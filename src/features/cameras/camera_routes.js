import crypto from 'node:crypto';
import { listCameras, getCamera, insertCamera, updateCamera, deleteCamera } from './camera_repository.js';
import { probeStream, probeSource } from './stream_probe.js';
import { listLocalDevices } from './local_devices.js';
import { readCameraInput } from './camera_payload.js';
import { Permission } from '../../security/rbac.js';
import { Exposure, Zone } from '../../security/net_zones.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { publish, Topic } from '../../kernel/event_bus.js';
import { notFound } from '../../kernel/errors.js';
import { requireId } from '../../security/guards.js';

function publicView(camera) {
    return {
        id: camera.id,
        name: camera.name,
        enabled: camera.enabled,
        createdAt: camera.createdAt ?? null
    };
}

export function registerCameraRoutes(router) {
    router.get('/api/cameras', async (ctx) => ({
        body: { cameras: listCameras().map((camera) => (ctx.zone === Zone.WAN ? publicView(camera) : camera)) }
    }), { permission: Permission.LIVE_VIEW, exposure: Exposure.PUBLIC });

    router.get('/api/cameras/devices', async (ctx) => {
        const withFormats = ctx.query?.formats === '1' || ctx.query?.formats === 'true';
        const result = await listLocalDevices({ withFormats });
        return { body: result };
    }, { permission: Permission.CAMERA_MANAGE, rateLimit: { limit: 20, windowMs: 60 * 1000 } });

    router.get('/api/cameras/:id', async (ctx) => {
        const camera = getCamera(requireId(ctx.params.id, 'Camera id'));
        if (!camera) throw notFound('Camera');
        return { body: { camera } };
    }, { permission: Permission.LIVE_VIEW });

    router.post('/api/cameras', async (ctx) => {
        const input = readCameraInput(ctx.body);
        const camera = insertCamera({
            id: crypto.randomUUID(),
            enabled: input.enabled ?? true,
            audioEnabled: input.audioEnabled ?? true,
            ...input
        });

        recordAudit({
            action: AuditAction.CAMERA_CREATED,
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            target: camera.id,
            remoteAddr: ctx.address,
            detail: { name: camera.name, sourceKind: camera.sourceKind }
        });
        publish(Topic.CAMERA_CREATED, { id: camera.id, name: camera.name });

        return { status: 201, body: { camera } };
    }, { permission: Permission.CAMERA_MANAGE });

    router.put('/api/cameras/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'Camera id');
        const current = getCamera(id);
        if (!current) throw notFound('Camera');

        const input = readCameraInput(ctx.body, { partial: true, currentKind: current.sourceKind });
        const camera = updateCamera(id, input);

        recordAudit({
            action: AuditAction.CAMERA_UPDATED,
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            target: id,
            remoteAddr: ctx.address,
            detail: { fields: Object.keys(input) }
        });
        publish(Topic.CAMERA_UPDATED, { id, name: camera.name });

        return { body: { camera } };
    }, { permission: Permission.CAMERA_MANAGE });

    router.delete('/api/cameras/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'Camera id');
        if (!deleteCamera(id)) throw notFound('Camera');

        recordAudit({
            action: AuditAction.CAMERA_DELETED,
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            target: id,
            remoteAddr: ctx.address
        });
        publish(Topic.CAMERA_DELETED, { id });

        return { body: { ok: true } };
    }, { permission: Permission.CAMERA_MANAGE });

    router.post('/api/cameras/probe', async (ctx) => {
        const input = readCameraInput(ctx.body);
        const result = await probeSource(input, { preferSub: false });
        return { body: result };
    }, { permission: Permission.CAMERA_MANAGE, rateLimit: { limit: 15, windowMs: 60 * 1000 } });

    router.post('/api/cameras/:id/probe', async (ctx) => {
        const id = requireId(ctx.params.id, 'Camera id');
        const result = await probeStream(id);
        return { body: result };
    }, { permission: Permission.CAMERA_MANAGE, rateLimit: { limit: 20, windowMs: 60 * 1000 } });
}
