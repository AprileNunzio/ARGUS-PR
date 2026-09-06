import { Permission } from '../../security/rbac.js';
import { Exposure } from '../../security/net_zones.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { raisePanic, clearPanic, panicState, listPanics } from './panic_service.js';

export function registerAlarmRoutes(router) {
    router.get('/api/alarm/panic', async () => ({
        body: { panics: listPanics() }
    }), { permission: Permission.LIVE_VIEW, exposure: Exposure.PRIVATE });

    router.get('/api/alarm/panic/:id', async (ctx) => ({
        body: { cameraId: ctx.params.id, ...panicState(ctx.params.id) }
    }), { permission: Permission.LIVE_VIEW, exposure: Exposure.PRIVATE });

    router.post('/api/alarm/panic/:id', async (ctx) => {
        const outcome = await raisePanic(ctx.params.id, {
            reason: String(ctx.body?.reason ?? 'Allarme avviato da un operatore').slice(0, 200),
            holdMs: ctx.body?.holdMs,
            channels: Array.isArray(ctx.body?.channels) ? ctx.body.channels : null
        });

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: `alarm.panic:${ctx.params.id}`,
            remoteAddr: ctx.address,
            detail: { camera: outcome.camera, channels: outcome.outcomes.length }
        });

        return { body: outcome };
    }, {
        permission: Permission.ALARM_ACKNOWLEDGE,
        exposure: Exposure.PRIVATE,
        rateLimit: { limit: 30, windowMs: 10 * 60 * 1000 }
    });

    router.delete('/api/alarm/panic/:id', async (ctx) => {
        const outcome = clearPanic(ctx.params.id);

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: `alarm.panic:${ctx.params.id}`,
            remoteAddr: ctx.address,
            detail: { cleared: true }
        });

        return { body: outcome };
    }, { permission: Permission.ALARM_ACKNOWLEDGE, exposure: Exposure.PRIVATE });
}
