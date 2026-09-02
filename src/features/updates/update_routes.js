import { Permission } from '../../security/rbac.js';
import { recordAudit } from '../../security/audit.js';
import { checkForUpdate, updateStatus, requestUpdate, cancelUpdate, scheduleRestart } from './update_service.js';

export function registerUpdateRoutes(router) {
    router.get('/api/updates/status', async (ctx) => ({
        body: updateStatus(ctx.config)
    }), { permission: Permission.SYSTEM_MANAGE });

    router.post('/api/updates/check', async () => ({
        body: await checkForUpdate({ force: true })
    }), {
        permission: Permission.SYSTEM_MANAGE,
        rateLimit: { limit: 10, windowMs: 10 * 60 * 1000 }
    });

    router.post('/api/updates/apply', async (ctx) => {
        const state = await requestUpdate(ctx.config, ctx.body.ref);

        recordAudit({
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            action: 'update.request',
            target: state.targetRef,
            remoteAddr: ctx.address,
            detail: { from: state.previousVersion }
        });

        scheduleRestart();

        return { status: 202, body: { state, restarting: true } };
    }, {
        permission: Permission.SYSTEM_MANAGE,
        rateLimit: { limit: 5, windowMs: 60 * 60 * 1000 }
    });

    router.post('/api/updates/cancel', async (ctx) => {
        const state = cancelUpdate(ctx.config);

        recordAudit({
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            action: 'update.cancel',
            target: null,
            remoteAddr: ctx.address,
            detail: null
        });

        return { body: { state } };
    }, { permission: Permission.SYSTEM_MANAGE });
}
