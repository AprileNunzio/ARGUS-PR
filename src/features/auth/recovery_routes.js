import { Permission } from '../../security/rbac.js';
import { Exposure } from '../../security/net_zones.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { readRecoveryMailer, saveRecoveryMailer, testRecoveryMailer, recoveryMailerReady } from './recovery_mailer.js';
import { requestReset, inspectReset, consumeReset } from './password_reset.js';

export function registerRecoveryRoutes(router) {
    router.get('/api/auth/recovery/settings', async () => ({
        body: { mailer: readRecoveryMailer(), ready: recoveryMailerReady() }
    }), { permission: Permission.SYSTEM_MANAGE, exposure: Exposure.PRIVATE });

    router.put('/api/auth/recovery/settings', async (ctx) => {
        const mailer = saveRecoveryMailer(ctx.body ?? {});

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: 'auth.recovery.mailer',
            remoteAddr: ctx.address,
            detail: { enabled: mailer.enabled, host: mailer.host, port: mailer.port }
        });

        return { body: { mailer, ready: recoveryMailerReady() } };
    }, { permission: Permission.SYSTEM_MANAGE, exposure: Exposure.PRIVATE });

    router.post('/api/auth/recovery/settings/test', async (ctx) => {
        const outcome = await testRecoveryMailer(ctx.body?.to);

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: 'auth.recovery.mailer',
            remoteAddr: ctx.address,
            detail: { test: true }
        });

        return { body: outcome };
    }, {
        permission: Permission.SYSTEM_MANAGE,
        exposure: Exposure.PRIVATE,
        rateLimit: { limit: 5, windowMs: 30 * 60 * 1000 }
    });

    router.post('/api/auth/recovery/request', async (ctx) => ({
        body: await requestReset({ email: ctx.body?.email, remoteAddr: ctx.address })
    }), {
        anonymous: true,
        exposure: Exposure.PUBLIC,
        rateLimit: { limit: 5, windowMs: 15 * 60 * 1000 }
    });

    router.get('/api/auth/recovery/:token', async (ctx) => ({
        body: inspectReset(ctx.params.token)
    }), {
        anonymous: true,
        exposure: Exposure.PUBLIC,
        rateLimit: { limit: 20, windowMs: 15 * 60 * 1000 }
    });

    router.post('/api/auth/recovery/:token', async (ctx) => ({
        body: await consumeReset({
            token: ctx.params.token,
            password: ctx.body?.password,
            remoteAddr: ctx.address
        })
    }), {
        anonymous: true,
        exposure: Exposure.PUBLIC,
        rateLimit: { limit: 10, windowMs: 15 * 60 * 1000 }
    });
}
