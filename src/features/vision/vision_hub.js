import { createLogger } from '../../kernel/logger.js';
import { publish, subscribe, Topic } from '../../kernel/event_bus.js';
import { Tracker } from './tracking.js';
import { voteOnPlate } from './plates.js';
import { findBestMatch, SFACE_COSINE_THRESHOLD } from './face_matcher.js';
import { evaluateAccess } from '../access/access_rules.js';
import { createVisionProcess } from './vision_process.js';
import { profileFor } from './analytics_repository.js';
import { Capability } from './engines_catalog.js';
import {
    acceptedClasses,
    buildWorkerProfile,
    faceMatchThreshold,
    needsWorker,
    requiredModels
} from './analytics_profile.js';
import { modelFiles, modelsDirFor, missingModels } from './models_service.js';
import { getSetting } from '../settings/settings_repository.js';
import { DEFAULT_PERFORMANCE_SETTINGS } from '../settings/performance_tuning.js';

const log = createLogger('vision-hub');

const PLATE_SOURCES = new Set(['car', 'truck', 'bus', 'motorcycle', 'plate']);

export function installVisionHub({ config, cameraRepository, detectionsRepository, peopleRepository, accessRepository }) {
    const processes = new Map();
    const trackers = new Map();
    const runtime = new Map();
    const modelsDir = modelsDirFor(config);

    function plannedFor(camera) {
        const entries = profileFor(camera.id);
        if (!needsWorker(entries)) return null;

        const pending = missingModels(requiredModels(entries), config);
        if (pending.length > 0) {
            log.warn('vision skipped: models missing', { cameraId: camera.id, models: pending });
            return null;
        }

        const workerProfile = buildWorkerProfile(entries, modelFiles());

        return {
            entries,
            workerProfile,
            accepted: acceptedClasses(entries),
            faceThreshold: faceMatchThreshold(entries) ?? SFACE_COSINE_THRESHOLD,
            recognizeFaces: entries.some((entry) => entry.capability === Capability.FACE_RECOGNIZE && entry.enabled),
            readPlates: entries.some((entry) => entry.capability === Capability.PLATE && entry.enabled),
            signature: JSON.stringify(workerProfile)
        };
    }

    function stopCamera(cameraId, reason) {
        const proc = processes.get(cameraId);
        if (!proc) return;
        proc.stop();
        processes.delete(cameraId);
        trackers.delete(cameraId);
        runtime.delete(cameraId);
        log.info('stopped vision analysis', { cameraId, reason });
    }

    function syncCameras() {
        const cameras = cameraRepository.list().filter((camera) => camera.enabled);
        const planned = new Map();

        for (const camera of cameras) {
            const plan = plannedFor(camera);
            if (plan) planned.set(camera.id, plan);
        }

        for (const cameraId of [...processes.keys()]) {
            if (!planned.has(cameraId)) stopCamera(cameraId, 'analytics-off');
        }

        const performanceSettings = getSetting('performance', DEFAULT_PERFORMANCE_SETTINGS);

        for (const [cameraId, plan] of planned.entries()) {
            const current = runtime.get(cameraId);
            if (current && current.signature === plan.signature) {
                runtime.set(cameraId, plan);
                continue;
            }
            if (current) stopCamera(cameraId, 'profile-changed');

            const camera = cameras.find((entry) => entry.id === cameraId);
            trackers.set(cameraId, new Tracker({ iouThreshold: 0.3, minHits: 2, maxMisses: 4 }));
            runtime.set(cameraId, plan);

            processes.set(cameraId, createVisionProcess({
                camera,
                ffmpegPath: config.ffmpegPath,
                dataDir: config.dataDir,
                modelsDir,
                performanceSettings,
                workerProfile: plan.workerProfile,
                onDetections: handleDetections
            }));

            log.info('started vision analysis', {
                cameraId,
                capabilities: plan.entries.filter((entry) => entry.enabled).map((entry) => entry.capability)
            });
        }
    }

    function recordTrack(cameraId, plan, track) {
        if (!plan.accepted.has(track.className)) return;

        const plate = plan.readPlates ? track.plateReadings?.[0]?.text ?? null : null;

        detectionsRepository.recordEvent({
            cameraId,
            source: 'vision',
            className: track.className,
            trackId: track.id,
            confidence: track.maxConfidence,
            box: track.bestBox,
            plateText: plate,
            startedAt: new Date(track.startedAt).toISOString(),
            endedAt: new Date(track.endedAt).toISOString()
        });

        publish(Topic.DETECTION, {
            cameraId,
            className: track.className,
            confidence: track.maxConfidence,
            box: track.bestBox,
            plateText: plate,
            timestamp: track.startedAt
        });
    }

    function recordFaces(cameraId, plan, detections, timestamp) {
        if (!plan.recognizeFaces) return;

        for (const detection of detections) {
            if (detection.className !== 'face' || !detection.faceEmbedding) continue;

            const people = peopleRepository.listPeople();
            const match = findBestMatch(detection.faceEmbedding, people, plan.faceThreshold);

            peopleRepository.recordFaceLog({
                cameraId,
                personId: match ? match.person.id : null,
                confidence: detection.confidence,
                box: detection.box,
                createdAt: new Date(timestamp).toISOString()
            });
        }
    }

    function recordPlates(cameraId, plan, closedTracks, timestamp) {
        if (!plan.readPlates) return;

        for (const track of closedTracks) {
            if (!PLATE_SOURCES.has(track.className)) continue;

            const plateResult = voteOnPlate(track.plateReadings);
            if (!plateResult) continue;

            const evaluation = evaluateAccess(plateResult.text, accessRepository.listRules());

            accessRepository.recordEvent({
                cameraId,
                plate: plateResult.text,
                decision: evaluation.decision,
                ruleId: evaluation.rule ? evaluation.rule.id : null,
                confidence: plateResult.confidence,
                createdAt: new Date(timestamp).toISOString()
            });

            publish(Topic.ACCESS, {
                cameraId,
                plate: plateResult.text,
                decision: evaluation.decision,
                label: evaluation.rule ? evaluation.rule.label : null,
                timestamp
            });
        }
    }

    function handleDetections({ cameraId, timestamp, detections }) {
        const tracker = trackers.get(cameraId);
        const plan = runtime.get(cameraId);
        if (!tracker || !plan) return;

        const { newlyConfirmed, closedTracks } = tracker.update(detections, timestamp);

        for (const track of newlyConfirmed) recordTrack(cameraId, plan, track);
        recordFaces(cameraId, plan, detections, timestamp);
        recordPlates(cameraId, plan, closedTracks, timestamp);
    }

    const interval = setInterval(syncCameras, 30000);
    interval.unref();
    syncCameras();

    const unsubscribeAnalytics = subscribe(Topic.ANALYTICS_UPDATED, (event) => {
        stopCamera(event.payload.cameraId, 'analytics-updated');
        syncCameras();
    });

    const unsubscribeCamera = subscribe(Topic.CAMERA_UPDATED, (event) => {
        stopCamera(event.payload.id, 'camera-updated');
        syncCameras();
    });

    const unsubscribeDeleted = subscribe(Topic.CAMERA_DELETED, (event) => {
        stopCamera(event.payload.id, 'camera-deleted');
    });

    log.info('vision hub ready', { active: processes.size, modelsDir });

    return {
        sync() {
            syncCameras();
        },
        stop() {
            clearInterval(interval);
            unsubscribeAnalytics();
            unsubscribeCamera();
            unsubscribeDeleted();
            for (const cameraId of [...processes.keys()]) stopCamera(cameraId, 'shutdown');
        }
    };
}
