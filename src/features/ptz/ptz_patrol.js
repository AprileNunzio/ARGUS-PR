import { ptzGotoPreset } from './ptz_service.js';
import { createLogger } from '../../kernel/logger.js';
import { on, Topic } from '../../kernel/event_bus.js';

const log = createLogger('ptz-patrol');

const activeTours = new Map();
const preemptions = new Map();

export function startPtzTour(cameraId, stops = [], { loop = true } = {}) {
    stopPtzTour(cameraId);
    if (!stops || stops.length === 0) return { active: false };

    let currentStopIndex = 0;
    let timer = null;

    const executeStop = async () => {
        if (preemptions.has(cameraId)) {
            const pre = preemptions.get(cameraId);
            if (Date.now() < pre.until) {
                timer = setTimeout(executeStop, 2000);
                return;
            }
            preemptions.delete(cameraId);
        }

        const stop = stops[currentStopIndex];
        try {
            await ptzGotoPreset(cameraId, stop.presetToken);
        } catch (err) {
            log.warn('PTZ tour stop failed', { cameraId, preset: stop.presetToken, error: err.message });
        }

        currentStopIndex = (currentStopIndex + 1) % stops.length;
        if (!loop && currentStopIndex === 0) {
            stopPtzTour(cameraId);
            return;
        }

        const dwellMs = Math.max((stop.dwellSeconds || 10) * 1000, 1000);
        timer = setTimeout(executeStop, dwellMs);
    };

    executeStop();

    activeTours.set(cameraId, {
        stops,
        loop,
        stop: () => {
            if (timer) clearTimeout(timer);
            activeTours.delete(cameraId);
        }
    });

    return { active: true, stopsCount: stops.length };
}

export function stopPtzTour(cameraId) {
    const existing = activeTours.get(cameraId);
    if (existing) {
        existing.stop();
        return { stopped: true };
    }
    return { stopped: false };
}

export function getPtzTourStatus(cameraId) {
    const active = activeTours.has(cameraId);
    const preemption = preemptions.get(cameraId) || null;
    return {
        active,
        isPreempted: preemption ? Date.now() < preemption.until : false
    };
}

export function preemptTourOnAlarm(cameraId, presetToken, holdSeconds = 30) {
    if (presetToken) {
        ptzGotoPreset(cameraId, presetToken).catch((err) =>
            log.warn('Failed to goto alarm preset', { cameraId, presetToken, error: err.message })
        );
    }
    preemptions.set(cameraId, {
        until: Date.now() + holdSeconds * 1000,
        alarmPreset: presetToken
    });
}
