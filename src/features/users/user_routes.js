import { Permission, Role } from '../../security/rbac.js';
import { Exposure } from '../../security/net_zones.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { revokeAllForUser } from '../../security/sessions.js';
import { generatePassword } from '../../security/password.js';
import { readDeviceIdentity, renameDevice } from '../system/device_identity.js';
import {
    listUsers,
    getUser,
    createUser,
    updateProfile,
    updateAccess,
    replacePassword,
    deleteUser
} from './user_repository.js';

const ROLE_LABELS = Object.freeze({
    admin: 'Amministratore: governa impianto, utenti, aggiornamenti e archivio',
    operator: 'Operatore: guarda in diretta, consulta e esporta l archivio, prende in carico gli allarmi',
    viewer: 'Osservatore: guarda in diretta e consulta l archivio, senza toccare nulla'
});

function trace(ctx, target, detail, outcome = 'success') {
    recordAudit({
        action: AuditAction.SETTINGS_CHANGED,
        actorId: ctx.actor?.id,
        actorName: ctx.actor?.username,
        target,
        remoteAddr: ctx.address,
        outcome,
        detail
    });
}

function notFound() {
    return { status: 404, body: { error: { message: 'Utente inesistente' } } };
}

export function registerUserRoutes(router) {
    router.get('/api/users/roles', async () => ({
        body: {
            roles: Object.entries(ROLE_LABELS).map(([id, description]) => ({ id, description })),
            device: readDeviceIdentity()
        }
    }), { permission: Permission.USER_MANAGE, exposure: Exposure.PRIVATE });

    router.get('/api/users', async () => ({
        body: { users: listUsers() }
    }), { permission: Permission.USER_MANAGE, exposure: Exposure.PRIVATE });

    router.get('/api/users/:id', async (ctx) => {
        const user = getUser(ctx.params.id);
        return user ? { body: user } : notFound();
    }, { permission: Permission.USER_MANAGE, exposure: Exposure.PRIVATE });

    router.post('/api/users', async (ctx) => {
        const generated = ctx.body?.password ? null : generatePassword();
        const user = await createUser({ ...ctx.body, password: ctx.body?.password ?? generated });

        trace(ctx, `user:${user.id}`, { created: user.username, role: user.role, generated: Boolean(generated) });

        return { status: 201, body: { user, temporaryPassword: generated } };
    }, {
        permission: Permission.USER_MANAGE,
        exposure: Exposure.PRIVATE,
        rateLimit: { limit: 20, windowMs: 60 * 60 * 1000 }
    });

    router.put('/api/users/:id', async (ctx) => {
        const user = updateProfile(ctx.params.id, ctx.body ?? {});
        if (!user) return notFound();

        trace(ctx, `user:${user.id}`, { profile: true, completeness: user.completeness });
        return { body: user };
    }, { permission: Permission.USER_MANAGE, exposure: Exposure.PRIVATE });

    router.put('/api/users/:id/access', async (ctx) => {
        if (ctx.params.id === ctx.actor?.id && ctx.body?.role !== undefined && ctx.body.role !== Role.ADMIN) {
            return { status: 409, body: { error: { message: 'Non puoi togliere a te stesso il ruolo di amministratore' } } };
        }

        const user = updateAccess(ctx.params.id, { role: ctx.body?.role, active: ctx.body?.active });
        if (!user) return notFound();

        if (!user.active) revokeAllForUser(user.id);

        trace(ctx, `user:${user.id}`, { role: user.role, active: user.active });
        return { body: user };
    }, { permission: Permission.USER_MANAGE, exposure: Exposure.PRIVATE });

    router.post('/api/users/:id/password', async (ctx) => {
        const generated = ctx.body?.password ? null : generatePassword();
        const user = await replacePassword(ctx.params.id, ctx.body?.password ?? generated, { mustChange: true });
        if (!user) return notFound();

        revokeAllForUser(user.id);

        recordAudit({
            action: AuditAction.PASSWORD_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: `user:${user.id}`,
            remoteAddr: ctx.address,
            detail: { reset: true, byAdministrator: true }
        });

        return { body: { user, temporaryPassword: generated } };
    }, {
        permission: Permission.USER_MANAGE,
        exposure: Exposure.PRIVATE,
        rateLimit: { limit: 20, windowMs: 60 * 60 * 1000 }
    });

    router.delete('/api/users/:id', async (ctx) => {
        if (ctx.params.id === ctx.actor?.id) {
            return { status: 409, body: { error: { message: 'Non puoi eliminare il tuo stesso account' } } };
        }

        const removed = deleteUser(ctx.params.id);
        if (!removed) return notFound();

        trace(ctx, `user:${ctx.params.id}`, { deleted: true });
        return { body: { ok: true } };
    }, { permission: Permission.USER_MANAGE, exposure: Exposure.PRIVATE });

    router.get('/api/system/device', async () => ({
        body: readDeviceIdentity()
    }), { permission: Permission.SYSTEM_MANAGE, exposure: Exposure.PRIVATE });

    router.put('/api/system/device', async (ctx) => {
        const identity = renameDevice(ctx.body?.label);
        trace(ctx, 'system.device', { label: identity.label, shortId: identity.shortId });
        return { body: identity };
    }, { permission: Permission.SYSTEM_MANAGE, exposure: Exposure.PRIVATE });
}
