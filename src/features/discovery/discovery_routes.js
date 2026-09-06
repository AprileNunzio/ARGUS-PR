import { discoverOnvifDevices } from './onvif_discovery.js';
import { Permission } from '../../security/rbac.js';
import { recordAudit, AuditAction } from '../../security/audit.js';

export function registerDiscoveryRoutes(router) {
    router.post('/api/discovery/onvif', async (ctx) => {
        const timeout = Math.min(Math.max(Number.parseInt(ctx.body.timeoutMs, 10) || 4000, 1000), 15000);
        const result = await discoverOnvifDevices(timeout);

        recordAudit({
            action: AuditAction.DISCOVERY_RUN,
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            remoteAddr: ctx.address,
            detail: { found: result.devices.length }
        });

        return { body: result };
    }, {
        permission: Permission.CAMERA_MANAGE,
        rateLimit: { limit: 10, windowMs: 60 * 1000 }
    });
}
