import { getCamera } from '../cameras/camera_repository.js';
import {
    listZones,
    getZone,
    insertZone,
    updateZone,
    deleteZone,
    replaceZones
} from './motion_repository.js';
import { updateMotionZones } from './motion_hub.js';
import { Permission } from '../../security/rbac.js';
import { notFound } from '../../kernel/errors.js';
import {
    requireId,
    requireString,
    requirePolygon,
    requireNumberRange,
    requireBool
} from '../../security/guards.js';

function readZoneInput(body) {
    return {
        name: requireString(body.name, 'Name', { max: 120 }),
        points: requirePolygon(body.points, 'Points'),
        sensitivity: body.sensitivity !== undefined
            ? requireNumberRange(body.sensitivity, 'Sensitivity', 0.0001, 1)
            : 0.015,
        cooldownSeconds: body.cooldownSeconds !== undefined
            ? requireNumberRange(body.cooldownSeconds, 'Cooldown seconds', 1, 300)
            : 15,
        isActive: body.isActive !== undefined ? requireBool(body.isActive) : true
    };
}

export function registerMotionRoutes(router) {
    router.get('/api/cameras/:id/motion/zones', async (ctx) => {
        const cameraId = requireId(ctx.params.id, 'Camera id');
        const camera = getCamera(cameraId);
        if (!camera) throw notFound('Camera');

        return { body: { zones: listZones(cameraId) } };
    }, { permission: Permission.LIVE_VIEW });

    router.put('/api/cameras/:id/motion/zones', async (ctx) => {
        const cameraId = requireId(ctx.params.id, 'Camera id');
        const camera = getCamera(cameraId);
        if (!camera) throw notFound('Camera');

        const rawZones = Array.isArray(ctx.body?.zones) ? ctx.body.zones : [];
        const validated = rawZones.map(readZoneInput);

        const zones = replaceZones(cameraId, validated);
        updateMotionZones(cameraId);
        return { body: { zones } };
    }, { permission: Permission.CAMERA_MANAGE });

    router.post('/api/cameras/:id/motion/zones', async (ctx) => {
        const cameraId = requireId(ctx.params.id, 'Camera id');
        const camera = getCamera(cameraId);
        if (!camera) throw notFound('Camera');

        const input = readZoneInput(ctx.body ?? {});
        const zone = insertZone(cameraId, input);
        updateMotionZones(cameraId);
        return { body: { zone }, status: 201 };
    }, { permission: Permission.CAMERA_MANAGE });

    router.delete('/api/cameras/:id/motion/zones/:zoneId', async (ctx) => {
        const cameraId = requireId(ctx.params.id, 'Camera id');
        const zoneId = requireId(ctx.params.zoneId, 'Zone id');
        const camera = getCamera(cameraId);
        if (!camera) throw notFound('Camera');

        const deleted = deleteZone(zoneId);
        if (!deleted) throw notFound('Motion zone');

        updateMotionZones(cameraId);
        return { body: { ok: true } };
    }, { permission: Permission.CAMERA_MANAGE });
}
