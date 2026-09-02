import { recordingStates, startRecording, stopRecording, applyRecordingPolicy } from './recording_hub.js';
import { runRetention } from './retention_worker.js';
import { querySegments, listIndexedDays } from './segment_index.js';
import { getSetting, setSetting, allSettings } from '../settings/settings_repository.js';
import { Permission } from '../../security/rbac.js';
import { requireId, requireBool } from '../../security/guards.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { validationError } from '../../kernel/errors.js';

const RETENTION_DEFAULTS = Object.freeze({
    'recording.segmentSeconds': 60,
    'retention.maxAgeDays': 14,
    'retention.maxBytesPerCamera': 0,
    'retention.minFreeBytes': 5 * 1024 ** 3
});

function parseRange(query) {
    const now = Date.now();
    const from = Number.parseInt(query.from, 10);
    const to = Number.parseInt(query.to, 10);

    const start = Number.isFinite(from) ? from : now - 3600000;
    const end = Number.isFinite(to) ? to : now;

    if (end <= start) throw validationError('The time range is empty');
    if (end - start > 7 * 86400000) throw validationError('The time range cannot exceed seven days');

    return { start, end };
}

export function registerRecordingRoutes(router) {
    router.get('/api/recording', async () => ({
        body: { recorders: recordingStates(), settings: allSettings(RETENTION_DEFAULTS) }
    }), { permission: Permission.LIVE_VIEW });

    router.post('/api/recording/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'Camera id');
        const enabled = requireBool(ctx.body.enabled);

        setSetting(`recording.enabled.${id}`, enabled);
        if (enabled) startRecording(id);
        else stopRecording(id, 'operator');

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            target: id,
            remoteAddr: ctx.address,
            detail: { recording: enabled }
        });

        return { body: { recorders: recordingStates() } };
    }, { permission: Permission.CAMERA_MANAGE });

    router.put('/api/recording/settings', async (ctx) => {
        const allowed = Object.keys(RETENTION_DEFAULTS);

        for (const [key, value] of Object.entries(ctx.body)) {
            if (!allowed.includes(key)) throw validationError(`Unknown setting: ${key}`);
            const numeric = Number(value);
            if (!Number.isFinite(numeric) || numeric < 0) throw validationError(`Invalid value for ${key}`);
            setSetting(key, numeric);
        }

        applyRecordingPolicy();

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            remoteAddr: ctx.address,
            detail: ctx.body
        });

        return { body: { settings: allSettings(RETENTION_DEFAULTS) } };
    }, { permission: Permission.STORAGE_MANAGE });

    router.post('/api/recording/retention/run', async (ctx) => ({
        body: runRetention(ctx.config)
    }), { permission: Permission.STORAGE_MANAGE, rateLimit: { limit: 5, windowMs: 60000 } });

    router.get('/api/archive/:id/days', async (ctx) => {
        const id = requireId(ctx.params.id, 'Camera id');
        return { body: { days: listIndexedDays(ctx.config, id) } };
    }, { permission: Permission.ARCHIVE_VIEW });

    router.get('/api/archive/:id/segments', async (ctx) => {
        const id = requireId(ctx.params.id, 'Camera id');
        const { start, end } = parseRange(ctx.query);

        const segments = querySegments(ctx.config, id, start, end);

        recordAudit({
            action: AuditAction.ARCHIVE_VIEWED,
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            target: id,
            remoteAddr: ctx.address,
            detail: { from: start, to: end, segments: segments.length }
        });

        return {
            body: {
                cameraId: id,
                from: start,
                to: end,
                segments,
                totalBytes: segments.reduce((sum, item) => sum + item.bytes, 0),
                segmentSeconds: getSetting('recording.segmentSeconds', 60)
            }
        };
    }, { permission: Permission.ARCHIVE_VIEW });
}
