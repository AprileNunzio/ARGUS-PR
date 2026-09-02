import { getCamera } from '../cameras/camera_repository.js';
import {
    getSchedule,
    upsertSchedule,
    deleteSchedule,
    listExceptions,
    getException,
    upsertException,
    deleteException
} from './scheduling_repository.js';
import { Permission } from '../../security/rbac.js';
import { notFound } from '../../kernel/errors.js';
import {
    requireId,
    requireScheduleMode,
    requireWeekMask,
    requireIsoDay,
    optionalString
} from '../../security/guards.js';
import { applyRecordingPolicy } from '../recording/recording_hub.js';

export function registerSchedulingRoutes(router) {
    router.get('/api/cameras/:id/schedule', async (ctx) => {
        const cameraId = requireId(ctx.params.id, 'Camera id');
        const camera = getCamera(cameraId);
        if (!camera) throw notFound('Camera');

        const schedule = getSchedule(cameraId);
        const exceptions = listExceptions(cameraId);
        return { body: { schedule, exceptions } };
    }, { permission: Permission.CAMERA_MANAGE });

    router.put('/api/cameras/:id/schedule', async (ctx) => {
        const cameraId = requireId(ctx.params.id, 'Camera id');
        const camera = getCamera(cameraId);
        if (!camera) throw notFound('Camera');

        const mode = requireScheduleMode(ctx.body?.mode, 'Mode');
        const weekMask = ctx.body?.weekMask !== undefined
            ? requireWeekMask(ctx.body.weekMask, 'Week mask')
            : undefined;

        const schedule = upsertSchedule(cameraId, { mode, weekMask });
        applyRecordingPolicy();
        return { body: { schedule } };
    }, { permission: Permission.CAMERA_MANAGE });

    router.delete('/api/cameras/:id/schedule', async (ctx) => {
        const cameraId = requireId(ctx.params.id, 'Camera id');
        const camera = getCamera(cameraId);
        if (!camera) throw notFound('Camera');

        deleteSchedule(cameraId);
        applyRecordingPolicy();
        return { body: { ok: true } };
    }, { permission: Permission.CAMERA_MANAGE });

    router.post('/api/cameras/:id/schedule/exceptions', async (ctx) => {
        const cameraId = requireId(ctx.params.id, 'Camera id');
        const camera = getCamera(cameraId);
        if (!camera) throw notFound('Camera');

        const day = requireIsoDay(ctx.body?.day, 'Day');
        const mode = requireScheduleMode(ctx.body?.mode, 'Mode');
        const weekMask = ctx.body?.weekMask !== undefined && ctx.body?.weekMask !== null
            ? requireWeekMask(ctx.body.weekMask, 'Week mask')
            : null;
        const note = optionalString(ctx.body?.note, 'Note', { max: 200 });

        const exception = upsertException(cameraId, { day, mode, weekMask, note });
        applyRecordingPolicy();
        return { body: { exception }, status: 201 };
    }, { permission: Permission.CAMERA_MANAGE });

    router.delete('/api/cameras/:id/schedule/exceptions/:day', async (ctx) => {
        const cameraId = requireId(ctx.params.id, 'Camera id');
        const day = requireIsoDay(ctx.params.day, 'Day');
        const camera = getCamera(cameraId);
        if (!camera) throw notFound('Camera');

        const deleted = deleteException(cameraId, day);
        if (!deleted) throw notFound('Schedule exception');

        applyRecordingPolicy();
        return { body: { ok: true } };
    }, { permission: Permission.CAMERA_MANAGE });
}
