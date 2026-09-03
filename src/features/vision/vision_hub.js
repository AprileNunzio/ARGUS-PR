import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createLogger } from '../../kernel/logger.js';
import { publish, Topic } from '../../kernel/event_bus.js';
import { Tracker } from './tracking.js';
import { voteOnPlate } from './plates.js';
import { findBestMatch } from './face_matcher.js';
import { evaluateAccess } from '../access/access_rules.js';
import { createVisionProcess } from './vision_process.js';
import { getSetting } from '../settings/settings_repository.js';
import { DEFAULT_PERFORMANCE_SETTINGS } from '../settings/performance_tuning.js';

const log = createLogger('vision-hub');


export function installVisionHub({ config, cameraRepository, detectionsRepository, peopleRepository, accessRepository }) {

    const processes = new Map();
    const trackers = new Map();
    const modelsDir = join(config.dataDir, 'models');

    function syncCameras() {
        const cameras = cameraRepository.list().filter((c) => c.enabled);
        const activeIds = new Set(cameras.map((c) => c.id));

        for (const [id, proc] of processes.entries()) {
            if (!activeIds.has(id)) {
                proc.stop();
                processes.delete(id);
                trackers.delete(id);
                log.info('stopped vision analysis', { cameraId: id });
            }
        }

        const performanceSettings = getSetting('performance', DEFAULT_PERFORMANCE_SETTINGS);

        for (const camera of cameras) {
            if (!processes.has(camera.id)) {
                const tracker = new Tracker({ iouThreshold: 0.3, minHits: 2, maxMisses: 4 });
                trackers.set(camera.id, tracker);

                const proc = createVisionProcess({
                    camera,
                    ffmpegPath: config.ffmpegPath,
                    dataDir: config.dataDir,
                    modelsDir,
                    performanceSettings,
                    onDetections: handleDetections
                });
                processes.set(camera.id, proc);
                log.info('started vision analysis', { cameraId: camera.id });
            }
        }

    }

    function handleDetections({ cameraId, timestamp, detections }) {
        const tracker = trackers.get(cameraId);
        if (!tracker) return;

        const { activeTracks, newlyConfirmed, closedTracks } = tracker.update(detections, timestamp);

        for (const track of newlyConfirmed) {
            const plate = track.plateReadings?.[0]?.text ?? null;
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

        for (const det of detections) {
            if (det.className === 'face' && det.faceEmbedding) {
                const people = peopleRepository.listPeople();
                const match = findBestMatch(det.faceEmbedding, people);
                peopleRepository.recordFaceLog({
                    cameraId,
                    personId: match ? match.person.id : null,
                    confidence: det.confidence,
                    box: det.box,
                    createdAt: new Date(timestamp).toISOString()
                });
            }
        }

        for (const track of closedTracks) {
            if (track.className === 'car' || track.className === 'truck' || track.className === 'bus' || track.className === 'plate') {
                const plateResult = voteOnPlate(track.plateReadings);
                if (plateResult) {
                    const rules = accessRepository.listRules();
                    const evalResult = evaluateAccess(plateResult.text, rules);
                    accessRepository.recordEvent({
                        cameraId,
                        plate: plateResult.text,
                        decision: evalResult.decision,
                        ruleId: evalResult.rule ? evalResult.rule.id : null,
                        confidence: plateResult.confidence,
                        createdAt: new Date(timestamp).toISOString()
                    });

                    publish(Topic.ACCESS, {
                        cameraId,
                        plate: plateResult.text,
                        decision: evalResult.decision,
                        label: evalResult.rule ? evalResult.rule.label : null,
                        timestamp
                    });
                }
            }
        }

    }

    const interval = setInterval(syncCameras, 30000);
    syncCameras();

    log.info('vision hub ready', { active: processes.size, modelsDir });

    return {
        sync() {
            syncCameras();
        },
        stop() {
            clearInterval(interval);
            for (const proc of processes.values()) {
                proc.stop();
            }
            processes.clear();
            trackers.clear();
        }
    };
}
