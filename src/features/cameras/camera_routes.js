import crypto from 'node:crypto';
import { listCameras, getCamera, insertCamera, updateCamera, deleteCamera } from './camera_repository.js';
import { probeStream } from './stream_probe.js';
import { Permission } from '../../security/rbac.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { publish, Topic } from '../../kernel/event_bus.js';
import { notFound } from '../../kernel/errors.js';
import {
    requireString,
    optionalString,
    requireId,
    optionalPort,
    requireEnum,
    requireBool,
    requireStreamUrl,
    optionalStreamUrl
} from '../../security/guards.js';

const SOURCE_KINDS = ['rtsp', 'http'];
const TRANSPORTS = ['tcp', 'udp'];

function readCameraInput(body, options = {}) {
    const partial = options.partial === true;

    const payload = {
        name: partial && body.name === undefined ? undefined : requireString(body.name, 'Name', { max: 120 }),
        sourceKind: partial && body.sourceKind === undefined ? undefined : requireEnum(body.sourceKind ?? 'rtsp', 'Source kind', SOURCE_KINDS),
        transport: partial && body.transport === undefined ? undefined : requireEnum(body.transport ?? 'tcp', 'Transport', TRANSPORTS),
        mainStreamUrl: partial && body.mainStreamUrl === undefined ? undefined : requireStreamUrl(body.mainStreamUrl, 'Main stream URL'),
        subStreamUrl: body.subStreamUrl === undefined ? undefined : optionalStreamUrl(body.subStreamUrl, 'Sub stream URL'),
        host: body.host === undefined ? undefined : optionalString(body.host, 'Host', { max: 253 }),
        port: body.port === undefined ? undefined : optionalPort(body.port, 'Port'),
        onvifPort: body.onvifPort === undefined ? undefined : optionalPort(body.onvifPort, 'ONVIF port'),
        username: body.username === undefined ? undefined : optionalString(body.username, 'Username', { max: 120 }),
        password: body.password === undefined ? undefined : optionalString(body.password, 'Password', { max: 200 }),
        manufacturer: body.manufacturer === undefined ? undefined : optionalString(body.manufacturer, 'Manufacturer', { max: 120 }),
        model: body.model === undefined ? undefined : optionalString(body.model, 'Model', { max: 120 }),
        enabled: body.enabled === undefined ? undefined : requireBool(body.enabled)
    };

    for (const key of Object.keys(payload)) {
        if (payload[key] === undefined) delete payload[key];
    }

    return payload;
}

export function registerCameraRoutes(router) {
    router.get('/api/cameras', async () => ({ body: { cameras: listCameras() } }), {
        permission: Permission.LIVE_VIEW
    });

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
            host: null,
            port: null,
            subStreamUrl: null,
            username: null,
            password: null,
            onvifPort: null,
            manufacturer: null,
            model: null,
            ...input
        });

        recordAudit({
            action: AuditAction.CAMERA_CREATED,
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            target: camera.id,
            remoteAddr: ctx.address,
            detail: { name: camera.name }
        });
        publish(Topic.CAMERA_CREATED, { id: camera.id, name: camera.name });

        return { status: 201, body: { camera } };
    }, { permission: Permission.CAMERA_MANAGE });

    router.put('/api/cameras/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'Camera id');
        const input = readCameraInput(ctx.body, { partial: true });
        const camera = updateCamera(id, input);
        if (!camera) throw notFound('Camera');

        recordAudit({
            action: AuditAction.CAMERA_UPDATED,
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            target: id,
            remoteAddr: ctx.address,
            detail: { fields: Object.keys(input) }
        });

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

    router.post('/api/cameras/:id/probe', async (ctx) => {
        const id = requireId(ctx.params.id, 'Camera id');
        const result = await probeStream(id);
        return { body: result };
    }, { permission: Permission.CAMERA_MANAGE, rateLimit: { limit: 20, windowMs: 60 * 1000 } });
}
