import { createHash } from 'node:crypto';
import { Permission } from '../../security/rbac.js';
import { Exposure } from '../../security/net_zones.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { publish, Topic } from '../../kernel/event_bus.js';
import { listCameras } from '../cameras/camera_repository.js';
import { detectDisplays } from '../kiosk/kiosk_service.js';
import { readTimeConfig, effectiveTimezone } from '../system/time_service.js';
import { readWallConfig, saveWallConfig, wallCameraPlan, screenFor } from './wall_config.js';

function revisionOf(config, timezone) {
    return createHash('sha1').update(JSON.stringify({ config, timezone })).digest('hex').slice(0, 16);
}

function overview(screenId = null) {
    const config = readWallConfig();
    const cameras = listCameras();
    const timezone = effectiveTimezone(readTimeConfig());
    const screen = screenFor(config, screenId);

    return {
        config,
        screen,
        revision: revisionOf(config, timezone),
        timezone,
        displays: detectDisplays(),
        plans: Object.fromEntries(config.screens.map((entry) => [entry.id, wallCameraPlan(config, cameras, entry.id)])),
        plan: wallCameraPlan(config, cameras, screen.id),
        cameras: cameras.map((camera) => ({
            id: camera.id,
            name: camera.name,
            enabled: camera.enabled,
            sourceKind: camera.sourceKind,
            hasMainStream: Boolean(camera.mainStreamUrl),
            hasSubStream: Boolean(camera.subStreamUrl)
        }))
    };
}

export function registerWallRoutes(router) {
    router.get('/api/wall/config', async (ctx) => ({
        body: overview(ctx.query.screen ?? null)
    }), { permission: Permission.LIVE_VIEW, exposure: Exposure.PRIVATE });

    router.put('/api/wall/config', async (ctx) => {
        const config = saveWallConfig(ctx.body);
        const payload = overview(ctx.query.screen ?? null);

        publish(Topic.WALL_CONFIG, { revision: payload.revision, screens: config.screens.length });

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: 'wall.config',
            remoteAddr: ctx.address,
            detail: { screens: config.screens.map((entry) => `${entry.id}:${entry.layout}`), clock: config.clock.format }
        });

        return { body: payload };
    }, {
        permission: Permission.SYSTEM_MANAGE,
        rateLimit: { limit: 60, windowMs: 10 * 60 * 1000 }
    });
}
