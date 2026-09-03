import { StreamSession, assertStreamable } from './stream_session.js';
import { onShutdown } from '../../kernel/process_guard.js';
import { subscribe, Topic } from '../../kernel/event_bus.js';

const sessions = new Map();

export function getSession(cameraId) {
    assertStreamable(cameraId);

    const existing = sessions.get(cameraId);
    if (existing && !existing.stopped) return existing;

    const session = new StreamSession(cameraId);
    sessions.set(cameraId, session);
    return session;
}

export function stopSession(cameraId, reason = 'stopped') {
    const session = sessions.get(cameraId);
    if (!session) return false;
    session.stop(reason);
    sessions.delete(cameraId);
    return true;
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
        for (const cameraId of Array.from(sessions.keys())) {
            stopSession(cameraId, 'shutdown');
        }
    });
}
