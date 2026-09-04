import { StreamSession, assertStreamable } from './stream_session.js';
import { onShutdown } from '../../kernel/process_guard.js';
import { subscribe, Topic } from '../../kernel/event_bus.js';

const sessions = new Map();

function sessionKey(cameraId, quality) {
    return `${cameraId}::${quality === 'main' ? 'main' : 'sub'}`;
}

export function getSession(cameraId, quality = 'sub') {
    assertStreamable(cameraId);

    const key = sessionKey(cameraId, quality);
    const existing = sessions.get(key);
    if (existing && !existing.stopped) return existing;

    const session = new StreamSession(cameraId, quality);
    sessions.set(key, session);
    return session;
}

export function stopSession(cameraId, reason = 'stopped') {
    let stopped = false;

    for (const [key, session] of sessions) {
        if (session.cameraId !== cameraId) continue;
        session.stop(reason);
        sessions.delete(key);
        stopped = true;
    }

    return stopped;
}

export function sessionStates() {
    return Array.from(sessions.values()).map((session) => session.snapshot());
}

export function installStreamHub() {
    const unsubscribe = subscribe(Topic.CAMERA_DELETED, (event) => {
        stopSession(event.payload.id, 'camera-deleted');
    });

    const unsubscribeUpdate = subscribe(Topic.CAMERA_UPDATED, (event) => {
        stopSession(event.payload.id, 'camera-updated');
    });

    onShutdown('stream-hub', () => {
        unsubscribe();
        unsubscribeUpdate();
        for (const session of Array.from(sessions.values())) {
            stopSession(session.cameraId, 'shutdown');
        }
    });
}
