import { EventEmitter } from 'node:events';

const emitter = new EventEmitter();
emitter.setMaxListeners(200);

export const Topic = Object.freeze({
    CAMERA_STATE: 'camera.state',
    CAMERA_CREATED: 'camera.created',
    CAMERA_UPDATED: 'camera.updated',
    CAMERA_DELETED: 'camera.deleted',
    MOTION: 'motion.detected',
    RECORDING_STATE: 'recording.state',
    SEGMENT_CLOSED: 'segment.closed',
    ALARM: 'alarm.raised',
    STORAGE_PRESSURE: 'storage.pressure',
    SYSTEM_HEALTH: 'system.health',
    DEPENDENCY_PROGRESS: 'dependency.progress',
    DETECTION: 'detection.event',
    ANALYTICS_UPDATED: 'analytics.updated',
    ACCESS: 'access.event',
    UPDATE: 'update.state',
    SETTINGS: 'settings.changed',
    WALL_CONFIG: 'wall.config',
    TIME_CONFIG: 'time.config',
    VISION_LIVE: 'vision.live'
});


export function publish(topic, payload) {
    emitter.emit(topic, { topic, at: Date.now(), payload });
    emitter.emit('*', { topic, at: Date.now(), payload });
}

export function subscribe(topic, handler) {
    emitter.on(topic, handler);
    return () => emitter.off(topic, handler);
}

export const on = subscribe;

export function off(topic, handler) {
    emitter.off(topic, handler);
}

export function subscribeAll(handler) {
    return subscribe('*', handler);
}
