import { getCamera } from '../cameras/camera_repository.js';
import {
    createDetectionSource,
    authenticateSourceKey,
    listDetectionSources,
    deleteDetectionSource,
    insertDetectionEvent,
    listDetectionEvents,
    getDetectionEventById
} from './detections_repository.js';
import { serveFile } from '../../http/static_files.js';
import { Permission, can } from '../../security/rbac.js';
import { unauthenticated, forbidden, notFound, validationError } from '../../kernel/errors.js';
import {
    requireId,
    requireString,
    optionalString,
    requireDetectionClass,
    requireNumberRange
} from '../../security/guards.js';
import { publish, Topic } from '../../kernel/event_bus.js';

const INGESTION_RATE_LIMIT = Object.freeze({ limit: 600, windowMs: 60000 });

function extractApiKey(req) {
    const header = req.headers.authorization;
    if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
        return header.slice(7).trim();
    }
    const customHeader = req.headers['x-api-key'];
    if (typeof customHeader === 'string') {
        return customHeader.trim();
    }
    return null;
}

function validateBox(box) {
    if (box === undefined || box === null) return null;
    if (!Array.isArray(box) || box.length !== 4) {
        throw validationError('box must be [x, y, w, h]');
    }
    const [x, y, w, h] = box;
    return [
        requireNumberRange(x, 'box[0]', 0, 1),
        requireNumberRange(y, 'box[1]', 0, 1),
        requireNumberRange(w, 'box[2]', 0, 1),
        requireNumberRange(h, 'box[3]', 0, 1)
    ];
}

function validateStartedAt(isoString) {
    if (!isoString) return new Date().toISOString();
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
        throw validationError('startedAt must be a valid ISO date');
    }
    const now = Date.now();
    const diff = date.getTime() - now;
    if (diff > 60000) {
        throw validationError('startedAt cannot be in the future');
    }
    if (now - date.getTime() > 86400000) {
        throw validationError('startedAt cannot be older than 24 hours');
    }
    return date.toISOString();
}

export function registerDetectionRoutes(router) {
    router.post('/api/detections', async (ctx) => {
        const apiKey = extractApiKey(ctx.req);
        let sourceName = null;

        if (apiKey) {
            const source = authenticateSourceKey(apiKey);
            if (!source) throw unauthenticated('Invalid API key');
            sourceName = source.name;

            if (source.cameraId && source.cameraId !== ctx.body?.cameraId) {
                throw forbidden('API key is restricted to a different camera');
            }
        } else if (ctx.actor && can(ctx.actor.role, Permission.CAMERA_MANAGE)) {
            sourceName = ctx.actor.username;
        } else {
            throw unauthenticated('Missing authorization');
        }

        const cameraId = requireId(ctx.body?.cameraId, 'Camera id');
        const camera = getCamera(cameraId);
        if (!camera) throw notFound('Camera');

        const className = requireDetectionClass(ctx.body?.className, 'Class name');
        const confidence = requireNumberRange(ctx.body?.confidence ?? 1.0, 'Confidence', 0, 1);
        const box = validateBox(ctx.body?.box);
        const startedAt = validateStartedAt(ctx.body?.startedAt);

        const event = insertDetectionEvent({
            cameraId,
            source: sourceName,
            className,
            trackId: optionalString(ctx.body?.trackId, 'Track id', { max: 64 }),
            confidence,
            box,
            startedAt,
            endedAt: optionalString(ctx.body?.endedAt, 'Ended at', { max: 40 }),
            plateText: optionalString(ctx.body?.plateText, 'Plate text', { max: 32 }),
            personId: optionalString(ctx.body?.personId, 'Person id', { max: 64 }),
            matchScore: ctx.body?.matchScore !== undefined
                ? requireNumberRange(ctx.body.matchScore, 'Match score', 0, 1)
                : null,
            zoneId: optionalString(ctx.body?.zoneId, 'Zone id', { max: 64 })
        });

        publish(Topic.MOTION, {
            cameraId,
            type: 'detection',
            className,
            confidence,
            box,
            at: new Date(startedAt).getTime()
        });

        return { body: { event }, status: 201 };
    }, { anonymous: true, rateLimit: INGESTION_RATE_LIMIT });

    router.get('/api/detections', async (ctx) => {
        const events = listDetectionEvents({
            cameraId: ctx.query.cameraId,
            className: ctx.query.className,
            plate: ctx.query.plate,
            personId: ctx.query.personId,
            zoneId: ctx.query.zoneId,
            minConfidence: ctx.query.minConfidence,
            from: ctx.query.from,
            to: ctx.query.to,
            limit: ctx.query.limit,
            offset: ctx.query.offset
        });
        return { body: { events } };
    }, { permission: Permission.LIVE_VIEW });

    router.get('/api/detections/:id/snapshot', async (ctx) => {
        const id = requireId(ctx.params.id, 'Event id');
        const event = getDetectionEventById(id);
        if (!event || !event.snapshotPath) throw notFound('Snapshot');

        const served = serveFile(ctx.req, ctx.res, ctx.config.mediaDir, event.snapshotPath);
        if (!served) throw notFound('Snapshot file');
        return { handled: true };
    }, { permission: Permission.ARCHIVE_VIEW });

    router.get('/api/detections/sources', async () => {
        return { body: { sources: listDetectionSources() } };
    }, { permission: Permission.SYSTEM_MANAGE });

    router.post('/api/detections/sources', async (ctx) => {
        const name = requireString(ctx.body?.name, 'Name', { max: 120 });
        const cameraId = ctx.body?.cameraId ? requireId(ctx.body.cameraId, 'Camera id') : null;
        if (cameraId && !getCamera(cameraId)) throw notFound('Camera');

        const { source, rawKey } = createDetectionSource({ name, cameraId });
        return { body: { source, key: rawKey }, status: 201 };
    }, { permission: Permission.SYSTEM_MANAGE });

    router.delete('/api/detections/sources/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'Source id');
        const deleted = deleteDetectionSource(id);
        if (!deleted) throw notFound('Detection source');
        return { body: { ok: true } };
    }, { permission: Permission.SYSTEM_MANAGE });
}
