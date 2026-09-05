import { createLogger } from '../../kernel/logger.js';
import { publish, subscribe, Topic } from '../../kernel/event_bus.js';
import { Tracker } from './tracking.js';
import { voteOnPlate } from './plates.js';
import { findBestMatch, estimateFacePose3D, updateMovingCentroid, SFACE_COSINE_THRESHOLD } from './face_matcher.js';
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
import { readPerformanceSettings } from '../settings/performance_tuning.js';

const log = createLogger('vision-hub');

const LIVE_INTERVAL_MS = 200;
const MAX_LIVE_BOXES = 24;

const PLATE_SOURCES = new Set(['car', 'truck', 'bus', 'motorcycle', 'plate']);

export function installVisionHub({ config, cameraRepository, detectionsRepository, peopleRepository, accessRepository }) {
    const processes = new Map();
    const trackers = new Map();
    const runtime = new Map();
    const lastBroadcast = new Map();
    const lastFaceLogs = new Map();
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

        const performanceSettings = readPerformanceSettings();

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
            upperColor: track.upperColor ?? null,
            startedAt: new Date(track.startedAt).toISOString(),
            endedAt: new Date(track.endedAt).toISOString()
        });

        const dwellSeconds = Math.max(0, Math.round(((track.endedAt ?? track.startedAt) - track.startedAt) / 1000));

        publish(Topic.DETECTION, {
            cameraId,
            className: track.className,
            confidence: track.maxConfidence,
            box: track.bestBox,
            plateText: plate,
            upperColor: track.upperColor ?? null,
            dwellSeconds,
            durationMs: (track.endedAt ?? track.startedAt) - track.startedAt,
            timestamp: track.startedAt
        });
    }

    function recordFaces(cameraId, plan, detections, timestamp) {
        if (!plan.recognizeFaces) return;

        const people = peopleRepository.listPeople();
        for (const detection of detections) {
            if (detection.className !== 'face' || !detection.faceEmbedding) continue;

            const match = findBestMatch(detection.faceEmbedding, people, plan.faceThreshold);
            const pose3d = estimateFacePose3D(detection.landmarks);
            const personId = match ? match.person.id : null;
            const cooldownKey = `${cameraId}:${personId ?? 'unknown'}`;
            const lastLog = lastFaceLogs.get(cooldownKey);

            if (lastLog && (timestamp - lastLog.at < 45000) && lastLog.pose === pose3d.pose) {
                continue;
            }

            lastFaceLogs.set(cooldownKey, { at: timestamp, pose: pose3d.pose });

            peopleRepository.recordFaceLog({
                cameraId,
                personId,
                confidence: detection.confidence,
                box: detection.box,
                pose3d,
                createdAt: new Date(timestamp).toISOString()
            });

            if (match && match.score >= 0.55 && match.person.embedding?.length > 0) {
                const updatedEmb = updateMovingCentroid(match.person.embedding, detection.faceEmbedding, 0.92);
                peopleRepository.updatePerson(match.person.id, {
                    embedding: updatedEmb,
                    sampleCount: (match.person.sampleCount || 1) + 1
                });
            }
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

    function broadcastLive(cameraId, tracker, plan, timestamp) {
        const previous = lastBroadcast.get(cameraId) ?? 0;
        if (timestamp - previous < LIVE_INTERVAL_MS) return;
        lastBroadcast.set(cameraId, timestamp);

        const people = plan.recognizeFaces ? peopleRepository.listPeople() : [];
        const boxes = [];
        for (const track of tracker.tracks.values()) {
            if (!track.isConfirmed || !plan.accepted.has(track.className)) continue;
            if (!Array.isArray(track.box) || track.box.length !== 4) continue;
            if (boxes.length >= MAX_LIVE_BOXES) break;

            let personName = null;
            let personRole = null;
            if (track.className === 'face' && track.faceEmbeddings?.length > 0) {
                const bestEmbedding = track.faceEmbeddings[track.faceEmbeddings.length - 1].embedding;
                const match = findBestMatch(bestEmbedding, people, plan.faceThreshold);
                if (match) {
                    personName = match.person.name;
                    personRole = match.person.role;
                }
            }

            boxes.push({
                id: track.id.slice(0, 8),
                className: track.className,
                confidence: Math.round(track.maxConfidence * 100) / 100,
                box: track.box.map((value) => Math.round(value * 1000) / 1000),
                plate: track.plateReadings?.[0]?.text ?? null,
                personName,
                personRole
            });
        }

        publish(Topic.VISION_LIVE, { cameraId, at: timestamp, boxes });
    }

    function handleDetections({ cameraId, timestamp, detections }) {
        const tracker = trackers.get(cameraId);
        const plan = runtime.get(cameraId);
        if (!tracker || !plan) return;

        const { newlyConfirmed, closedTracks } = tracker.update(detections, timestamp);

        for (const track of newlyConfirmed) recordTrack(cameraId, plan, track);
        recordFaces(cameraId, plan, detections, timestamp);
        recordPlates(cameraId, plan, closedTracks, timestamp);
        broadcastLive(cameraId, tracker, plan, timestamp);
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
        status() {
            const cameras = cameraRepository.list();
            const byId = new Map(cameras.map((camera) => [camera.id, camera]));

            const entries = [...processes.entries()].map(([cameraId, process]) => {
                const plan = runtime.get(cameraId);
                const snapshot = process.snapshot ? process.snapshot() : { state: 'unknown' };

                return {
                    cameraId,
                    cameraName: byId.get(cameraId)?.name ?? cameraId,
                    capabilities: plan ? plan.entries.filter((entry) => entry.enabled).map((entry) => entry.capability) : [],
                    engines: plan ? [...new Set(plan.entries.filter((entry) => entry.enabled).map((entry) => entry.engineId))] : [],
                    classes: plan ? [...plan.accepted] : [],
                    ...snapshot
                };
            });

            return {
                active: entries.length,
                configured: cameras.length,
                modelsDir,
                cameras: entries.sort((a, b) => a.cameraName.localeCompare(b.cameraName))
            };
        },
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
