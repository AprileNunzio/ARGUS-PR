import { Permission } from '../../security/rbac.js';
import { Exposure } from '../../security/net_zones.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { listCameras } from '../cameras/camera_repository.js';
import {
    ptzStatus,
    ptzMove,
    ptzStop,
    ptzHome,
    ptzPresets,
    ptzGotoPreset,
    ptzSavePreset,
    forgetPtz
} from './ptz_service.js';

function trace(ctx, target, detail) {
    recordAudit({
        action: AuditAction.SETTINGS_CHANGED,
        actorId: ctx.actor?.id,
        actorName: ctx.actor?.username,
        target,
        remoteAddr: ctx.address,
        detail
    });
}

export function registerPtzRoutes(router) {
    router.get('/api/ptz', async () => {
        const cameras = listCameras().filter((camera) => camera.enabled);
        const entries = await Promise.all(cameras.map(async (camera) => ({
            cameraId: camera.id,
            name: camera.name,
            ...(await ptzStatus(camera.id))
        })));

        return { body: { cameras: entries.map(({ ptzUrl, ...rest }) => rest) } };
    }, { permission: Permission.LIVE_VIEW, exposure: Exposure.PRIVATE });

    router.get('/api/ptz/:id', async (ctx) => {
        const { ptzUrl, ...status } = await ptzStatus(ctx.params.id, { refresh: ctx.query.refresh === 'true' });
        return { body: status };
    }, { permission: Permission.LIVE_VIEW, exposure: Exposure.PRIVATE });

    router.post('/api/ptz/:id/move', async (ctx) => {
        const outcome = await ptzMove(ctx.params.id, ctx.body?.direction, {
            speed: ctx.body?.speed,
            durationMs: ctx.body?.durationMs
        });

        return { body: outcome };
    }, { permission: Permission.ALARM_ACKNOWLEDGE, exposure: Exposure.PRIVATE });

    router.post('/api/ptz/:id/stop', async (ctx) => ({
        body: await ptzStop(ctx.params.id)
    }), { permission: Permission.ALARM_ACKNOWLEDGE, exposure: Exposure.PRIVATE });

    router.post('/api/ptz/:id/home', async (ctx) => ({
        body: await ptzHome(ctx.params.id)
    }), { permission: Permission.ALARM_ACKNOWLEDGE, exposure: Exposure.PRIVATE });

    router.get('/api/ptz/:id/presets', async (ctx) => ({
        body: await ptzPresets(ctx.params.id)
    }), { permission: Permission.LIVE_VIEW, exposure: Exposure.PRIVATE });

    router.post('/api/ptz/:id/presets', async (ctx) => {
        const outcome = await ptzSavePreset(ctx.params.id, ctx.body?.name);
        trace(ctx, `ptz.preset:${ctx.params.id}`, { preset: outcome.name });
        return { body: outcome };
    }, { permission: Permission.CAMERA_MANAGE, exposure: Exposure.PRIVATE });

    router.post('/api/ptz/:id/presets/:preset', async (ctx) => ({
        body: await ptzGotoPreset(ctx.params.id, ctx.params.preset)
    }), { permission: Permission.ALARM_ACKNOWLEDGE, exposure: Exposure.PRIVATE });

    router.delete('/api/ptz/:id', async (ctx) => {
        forgetPtz(ctx.params.id);
        return { body: await ptzStatus(ctx.params.id, { refresh: true }) };
    }, { permission: Permission.CAMERA_MANAGE, exposure: Exposure.PRIVATE });
}
