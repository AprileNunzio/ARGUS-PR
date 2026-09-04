import { Permission } from '../../security/rbac.js';
import { Exposure } from '../../security/net_zones.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { timeOverview, saveTimeConfig, synchroniseNow } from './time_service.js';

export function registerTimeRoutes(router) {
    router.get('/api/system/time', async () => ({
        body: await timeOverview()
    }), { permission: Permission.LIVE_VIEW, exposure: Exposure.PRIVATE });

    router.put('/api/system/time', async (ctx) => {
        const outcome = await saveTimeConfig(ctx.body);

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: 'time.config',
            remoteAddr: ctx.address,
            detail: {
                timezone: outcome.config.timezone,
                format: outcome.config.format,
                ntpEnabled: outcome.config.ntpEnabled,
                appliedToSystem: outcome.system.applied
            }
        });

        return { body: { ...(await timeOverview()), system: outcome.system } };
    }, {
        permission: Permission.SYSTEM_MANAGE,
        rateLimit: { limit: 30, windowMs: 10 * 60 * 1000 }
    });

    router.post('/api/system/time/sync', async (ctx) => {
        const outcome = await synchroniseNow();

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: 'time.sync',
            remoteAddr: ctx.address,
            detail: { success: outcome.success }
        });

        return { body: { ...outcome, overview: await timeOverview() } };
    }, {
        permission: Permission.SYSTEM_MANAGE,
        rateLimit: { limit: 10, windowMs: 10 * 60 * 1000 }
    });
}
