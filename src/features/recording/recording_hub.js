import { Recorder } from './recorder.js';
import { runRetention } from './retention_worker.js';
import { listCameras } from '../cameras/camera_repository.js';
import { getSetting } from '../settings/settings_repository.js';
import { onShutdown } from '../../kernel/process_guard.js';
import { subscribe, Topic } from '../../kernel/event_bus.js';
import { createLogger } from '../../kernel/logger.js';
import { notFound } from '../../kernel/errors.js';

const log = createLogger('recording-hub');

const RETENTION_INTERVAL_MS = 10 * 60 * 1000;

const recorders = new Map();
let runtimeConfig = null;

function segmentSeconds() {
    const value = Number(getSetting('recording.segmentSeconds', 60));
    return Number.isFinite(value) && value >= 10 && value <= 900 ? value : 60;
}

function isEnabled(cameraId) {
    return getSetting(`recording.enabled.${cameraId}`, false) === true;
}

export function startRecording(cameraId) {
    const camera = listCameras().find((item) => item.id === cameraId);
    if (!camera) throw notFound('Camera');

    const existing = recorders.get(cameraId);
    if (existing && !existing.stopped) return existing.snapshot();

    const recorder = new Recorder(runtimeConfig, cameraId, { segmentSeconds: segmentSeconds() });
    recorders.set(cameraId, recorder);
    recorder.start();
    return recorder.snapshot();
}

export function stopRecording(cameraId, reason = 'operator') {
    const recorder = recorders.get(cameraId);
    if (!recorder) return false;
    recorder.stop(reason);
    recorders.delete(cameraId);
    return true;
}

export function recordingStates() {
    return listCameras().map((camera) => {
        const recorder = recorders.get(camera.id);
        return {
            cameraId: camera.id,
            name: camera.name,
            enabled: isEnabled(camera.id),
            ...(recorder ? recorder.snapshot() : { state: 'stopped', since: null, segmentSeconds: segmentSeconds() })
        };
    });
}

export function applyRecordingPolicy() {
    for (const camera of listCameras()) {
        const shouldRun = camera.enabled && isEnabled(camera.id);
        const running = recorders.has(camera.id);

        if (shouldRun && !running) startRecording(camera.id);
        if (!shouldRun && running) stopRecording(camera.id, 'policy');
    }
}

export function installRecordingHub(config) {
    runtimeConfig = config;

    const unsubscribeDelete = subscribe(Topic.CAMERA_DELETED, (event) => {
        stopRecording(event.payload.id, 'camera-deleted');
    });

    applyRecordingPolicy();

    const retentionTimer = setInterval(() => {
        runRetention(config);
    }, RETENTION_INTERVAL_MS);
    retentionTimer.unref();

    log.info('recording hub ready', { active: recorders.size });

    onShutdown('recording-hub', () => {
        clearInterval(retentionTimer);
        unsubscribeDelete();
        for (const cameraId of Array.from(recorders.keys())) {
            stopRecording(cameraId, 'shutdown');
        }
    });
}
