import { MotionProcess } from './motion_process.js';
import { listZones } from './motion_repository.js';
import { listCameras } from '../cameras/camera_repository.js';
import { publish, subscribe, Topic } from '../../kernel/event_bus.js';
import { onShutdown } from '../../kernel/process_guard.js';
import { createLogger } from '../../kernel/logger.js';
import { recordMotionEvent } from '../detections/detections_repository.js';

const log = createLogger('motion-hub');

const processes = new Map();
let runtimeConfig = null;

function handleMotionEvents(cameraId, events) {
    for (const ev of events) {
        publish(Topic.MOTION, {
            cameraId,
            type: ev.type,
            zoneId: ev.zoneId,
            zoneName: ev.zoneName,
            ratio: ev.ratio,
            at: ev.at
        });

        if (ev.type === 'motion_start') {
            recordMotionEvent({
                cameraId,
                source: 'internal_motion',
                className: 'motion',
                confidence: Math.min(1, Math.max(0.1, Number((ev.ratio * 10).toFixed(2)))),
                zoneId: ev.zoneId !== 'default' ? ev.zoneId : null,
                startedAt: new Date(ev.at).toISOString()
            });
        }
    }
}

export function startMotion(cameraId) {
    if (processes.has(cameraId)) return;

    const camera = listCameras().find((c) => c.id === cameraId);
    if (!camera || !camera.enabled) return;

    const zones = listZones(cameraId);
    const proc = new MotionProcess(runtimeConfig, cameraId, zones, (events) => {
        handleMotionEvents(cameraId, events);
    });

    processes.set(cameraId, proc);
    proc.start();
}

export function stopMotion(cameraId) {
    const proc = processes.get(cameraId);
    if (!proc) return;
    proc.stop();
    processes.delete(cameraId);
}

export function updateMotionZones(cameraId) {
    const proc = processes.get(cameraId);
    if (!proc) return;
    const zones = listZones(cameraId);
    proc.setZones(zones);
}

export function applyMotionPolicy() {
    for (const camera of listCameras()) {
        const shouldRun = camera.enabled;
        const isRunning = processes.has(camera.id);

        if (shouldRun && !isRunning) startMotion(camera.id);
        if (!shouldRun && isRunning) stopMotion(camera.id);
    }
}

export function installMotionHub(config) {
    runtimeConfig = config;

    const unsubscribeDelete = subscribe(Topic.CAMERA_DELETED, (event) => {
        stopMotion(event.payload.id);
    });

    applyMotionPolicy();

    log.info('motion hub ready', { active: processes.size });

    onShutdown('motion-hub', () => {
        unsubscribeDelete();
        for (const cameraId of Array.from(processes.keys())) {
            stopMotion(cameraId);
        }
    });
}
