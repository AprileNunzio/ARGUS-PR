import { createHash } from 'node:crypto';
import { Permission } from '../../security/rbac.js';
import { Exposure } from '../../security/net_zones.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { publish, Topic } from '../../kernel/event_bus.js';
import { listCameras } from '../cameras/camera_repository.js';
import { detectDisplays } from '../kiosk/kiosk_service.js';
import { readTimeConfig, effectiveTimezone } from '../system/time_service.js';
import { readWallConfig, saveWallConfig, wallCameraPlan } from './wall_config.js';

function revisionOf(config, timezone) {
    return createHash('sha1').update(JSON.stringify({ config, timezone })).digest('hex').slice(0, 16);
}

function overview() {
    const config = readWallConfig();
    const cameras = listCameras();
    const timezone = effectiveTimezone(readTimeConfig());

    return {
        config,
        revision: revisionOf(config, timezone),
        timezone,
        displays: detectDisplays(),
        plan: wallCameraPlan(config, cameras),
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
    router.get('/api/wall/config', async () => ({
        body: overview()
    }), { permission: Permission.LIVE_VIEW, exposure: Exposure.PRIVATE });

    router.put('/api/wall/config', async (ctx) => {
        const config = saveWallConfig(ctx.body);
        const payload = overview();

        publish(Topic.WALL_CONFIG, { revision: payload.revision, layout: config.layout });

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: 'wall.config',
            remoteAddr: ctx.address,
            detail: { layout: config.layout, tiles: config.tiles.length, clock: config.clock.format }
        });

        return { body: payload };
    }, {
        permission: Permission.SYSTEM_MANAGE,
        rateLimit: { limit: 60, windowMs: 10 * 60 * 1000 }
    });
}
