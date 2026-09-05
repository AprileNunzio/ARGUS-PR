import {
    listFloorPlans,
    getFloorPlanById,
    createFloorPlan,
    deleteFloorPlan,
    listFloorPlanMarkers,
    upsertFloorPlanMarker,
    deleteFloorPlanMarker,
    listVirtualBarriers,
    createVirtualBarrier,
    deleteVirtualBarrier
} from './floorplan_repository.js';
import { serveFile } from '../../http/static_files.js';
import { Permission } from '../../security/rbac.js';
import { requireId, requireString, requireNumberRange } from '../../security/guards.js';
import { notFound, validationError } from '../../kernel/errors.js';

export function registerFloorplanRoutes(router) {
    router.get('/api/floorplans', async () => ({
        body: { floorPlans: listFloorPlans() }
    }), { permission: Permission.LIVE_VIEW });

    router.post('/api/floorplans', async (ctx) => {
        const name = requireString(ctx.body?.name, 'Name', { max: 120 });
        const imagePath = requireString(ctx.body?.imagePath, 'ImagePath', { max: 255 });
        const width = requireNumberRange(ctx.body?.width, 'Width', 100, 10000);
        const height = requireNumberRange(ctx.body?.height, 'Height', 100, 10000);

        const plan = createFloorPlan({ name, imagePath, width, height });
        return { body: { floorPlan: plan }, status: 201 };
    }, { permission: Permission.SETTINGS_MANAGE });

    router.delete('/api/floorplans/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'FloorPlan id');
        const deleted = deleteFloorPlan(id);
        if (!deleted) throw notFound('FloorPlan');
        return { body: { ok: true } };
    }, { permission: Permission.SETTINGS_MANAGE });

    router.get('/api/floorplans/:id/markers', async (ctx) => {
        const id = requireId(ctx.params.id, 'FloorPlan id');
        return { body: { markers: listFloorPlanMarkers(id) } };
    }, { permission: Permission.LIVE_VIEW });

    router.post('/api/floorplans/:id/markers', async (ctx) => {
        const floorPlanId = requireId(ctx.params.id, 'FloorPlan id');
        const cameraId = requireId(ctx.body?.cameraId, 'Camera id');
        const x = requireNumberRange(ctx.body?.x, 'X coordinate', 0, 10000);
        const y = requireNumberRange(ctx.body?.y, 'Y coordinate', 0, 10000);
        const fovAngle = ctx.body?.fovAngle !== undefined ? Number(ctx.body.fovAngle) : 0;
        const fovRange = ctx.body?.fovRange !== undefined ? Number(ctx.body.fovRange) : 50;

        const marker = upsertFloorPlanMarker({ floorPlanId, cameraId, x, y, fovAngle, fovRange });
        return { body: { marker }, status: 200 };
    }, { permission: Permission.SETTINGS_MANAGE });

    router.delete('/api/floorplans/markers/:markerId', async (ctx) => {
        const markerId = requireId(ctx.params.markerId, 'Marker id');
        const deleted = deleteFloorPlanMarker(markerId);
        if (!deleted) throw notFound('Marker');
        return { body: { ok: true } };
    }, { permission: Permission.SETTINGS_MANAGE });

    router.get('/api/barriers', async (ctx) => {
        const cameraId = ctx.query.cameraId ? requireId(ctx.query.cameraId, 'Camera id') : null;
        return { body: { barriers: listVirtualBarriers(cameraId) } };
    }, { permission: Permission.LIVE_VIEW });

    router.post('/api/barriers', async (ctx) => {
        const name = requireString(ctx.body?.name, 'Name', { max: 120 });
        const cameraId = requireId(ctx.body?.cameraId, 'Camera id');
        const kind = requireString(ctx.body?.kind, 'Kind', { max: 32 });
        if (!['tripwire', 'line_crossing', 'perimeter'].includes(kind)) {
            throw validationError('Invalid barrier kind');
        }
        if (!Array.isArray(ctx.body?.points) || ctx.body.points.length < 2) {
            throw validationError('points must be an array of at least 2 coordinate pairs');
        }

        const barrier = createVirtualBarrier({
            name,
            cameraId,
            kind,
            points: ctx.body.points,
            direction: ctx.body?.direction || 'both'
        });

        return { body: { barrier }, status: 201 };
    }, { permission: Permission.CAMERA_MANAGE });

    router.delete('/api/barriers/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'Barrier id');
        const deleted = deleteVirtualBarrier(id);
        if (!deleted) throw notFound('Barrier');
        return { body: { ok: true } };
    }, { permission: Permission.CAMERA_MANAGE });
}
