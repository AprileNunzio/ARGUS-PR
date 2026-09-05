import { publish, Topic } from '../../kernel/event_bus.js';
import { createLogger } from '../../kernel/logger.js';
import { getCamera } from '../cameras/camera_repository.js';
import { listChannels, getChannelSecret, recordRun } from '../automation/automation_repository.js';
import { deliver } from '../automation/channels/index.js';

const log = createLogger('panic');

const HOLD_MIN_MS = 1000;
const HOLD_MAX_MS = 300000;
const active = new Map();

export function clampHold(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed)) return 30000;
    return Math.min(Math.max(parsed, HOLD_MIN_MS), HOLD_MAX_MS);
}

export function panicState(cameraId) {
    const entry = active.get(cameraId);
    if (!entry) return { active: false };
    return { active: true, since: entry.since, until: entry.until, reason: entry.reason };
}

export function listPanics() {
    return [...active.keys()].map((cameraId) => ({ cameraId, ...panicState(cameraId) }));
}

function messageFor(camera, reason, at) {
    const when = new Date(at).toLocaleString('it-IT');
    const label = camera?.name ?? 'canale sconosciuto';

    return {
        rule: 'Allarme manuale',
        event: reason,
        camera: label,
        cameraId: camera?.id ?? null,
        timestamp: at,
        subject: `ARGUS-PR: allarme manuale su ${label}`,
        text: `Allarme manuale\n${reason} su ${label}\n${when}`
    };
}

async function fanOut(message, channelIds) {
    const wanted = new Set(channelIds ?? []);
    const channels = listChannels().filter((channel) => (wanted.size === 0 ? true : wanted.has(channel.id)));
    const outcomes = [];

    for (const channel of channels) {
        const outcome = await deliver(channel, getChannelSecret(channel.id), message)
            .then((result) => ({ channelId: channel.id, kind: channel.kind, ok: true, detail: result }))
            .catch((error) => ({ channelId: channel.id, kind: channel.kind, ok: false, detail: error.message }));

        outcomes.push(outcome);

        recordRun({
            ruleId: null,
            trigger: `panic:${message.cameraId ?? 'sistema'}`,
            outcome: outcome.ok ? 'success' : 'failure',
            detail: `${channel.kind}: ${outcome.ok ? 'inviato' : outcome.detail}`
        });
    }

    return outcomes;
}

export async function raisePanic(cameraId, { reason = 'Allarme avviato da un operatore', holdMs, channels } = {}) {
    const camera = getCamera(cameraId);
    if (!camera) throw new Error('Telecamera sconosciuta');

    const at = Date.now();
    const hold = clampHold(holdMs);
    const existing = active.get(cameraId);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
        active.delete(cameraId);
        publish(Topic.ALARM, { source: 'panic', cameraId, cleared: true, timestamp: Date.now() });
    }, hold);

    timer.unref();
    active.set(cameraId, { since: at, until: at + hold, reason, timer });

    publish(Topic.ALARM, {
        source: 'panic',
        rule: 'Allarme manuale',
        cameraId,
        text: reason,
        timestamp: at
    });

    const outcomes = await fanOut(messageFor(camera, reason, at), channels)
        .catch((error) => {
            log.warn('panic fan-out failed', { message: error.message });
            return [];
        });

    return { cameraId, camera: camera.name, since: at, until: at + hold, holdMs: hold, outcomes };
}

export function clearPanic(cameraId) {
    const entry = active.get(cameraId);
    if (!entry) return { cameraId, active: false };

    clearTimeout(entry.timer);
    active.delete(cameraId);
    publish(Topic.ALARM, { source: 'panic', cameraId, cleared: true, timestamp: Date.now() });

    return { cameraId, active: false, cleared: true };
}
