import fs from 'node:fs';
import path from 'node:path';
import { planRetention, summarise } from './retention.js';
import { listIndexedDays, readDayRecords, rewriteDay } from './segment_index.js';
import { cameraSegmentDir, safeSegmentPath } from './segment_paths.js';
import { listCameras } from '../cameras/camera_repository.js';
import { getSetting } from '../settings/settings_repository.js';
import { createLogger } from '../../kernel/logger.js';
import { publish, Topic } from '../../kernel/event_bus.js';

const log = createLogger('retention');

function diskFree(target) {
    const stat = (() => {
        try {
            return fs.statfsSync(target);
        } catch {
            return null;
        }
    })();
    return stat ? stat.bavail * stat.bsize : -1;
}

function collectInventory(config, cameraId) {
    const inventory = [];
    for (const day of listIndexedDays(config, cameraId)) {
        for (const record of readDayRecords(config, cameraId, day)) {
            inventory.push({ ...record, day });
        }
    }
    return inventory;
}

function removeSegment(config, cameraId, record) {
    const absolute = safeSegmentPath(config, cameraId, record.file);
    if (!absolute) return true;

    const removed = (() => {
        try {
            fs.rmSync(absolute, { force: true });
            return true;
        } catch (error) {
            log.error('segment removal failed', { camera: cameraId, file: record.file, message: error.message });
            return false;
        }
    })();

    return removed;
}

function pruneEmptyDirs(root) {
    const walk = (dir) => {
        const entries = (() => {
            try {
                return fs.readdirSync(dir, { withFileTypes: true });
            } catch {
                return [];
            }
        })();

        for (const entry of entries) {
            if (entry.isDirectory()) walk(path.join(dir, entry.name));
        }

        const remaining = (() => {
            try {
                return fs.readdirSync(dir);
            } catch {
                return ['keep'];
            }
        })();

        if (remaining.length === 0 && dir !== root) {
            try {
                fs.rmdirSync(dir);
            } catch {
                return;
            }
        }
    };

    walk(root);
}

export function runRetention(config) {
    const policy = {
        maxAgeDays: Number(getSetting('retention.maxAgeDays', 14)),
        maxBytes: Number(getSetting('retention.maxBytesPerCamera', 0)),
        minFreeBytes: Number(getSetting('retention.minFreeBytes', 5 * 1024 ** 3))
    };

    const currentFreeBytes = diskFree(config.mediaDir);
    const report = [];

    for (const camera of listCameras()) {
        const inventory = collectInventory(config, camera.id);
        if (inventory.length === 0) continue;

        const plan = planRetention(inventory, { ...policy, currentFreeBytes }, Date.now());
        if (plan.remove.length === 0) continue;

        const removedByDay = new Map();

        for (const record of plan.remove) {
            if (!removeSegment(config, camera.id, record)) continue;
            const bucket = removedByDay.get(record.day) ?? new Set();
            bucket.add(record.file);
            removedByDay.set(record.day, bucket);
        }

        for (const [day, files] of removedByDay) {
            const remaining = readDayRecords(config, camera.id, day).filter((item) => !files.has(item.file));
            rewriteDay(config, camera.id, day, remaining);
        }

        pruneEmptyDirs(cameraSegmentDir(config, camera.id));

        const summary = summarise(plan);
        report.push({ cameraId: camera.id, name: camera.name, ...summary });
        log.info('retention applied', { camera: camera.id, ...summary });
    }

    if (report.length > 0) publish(Topic.STORAGE_PRESSURE, { report });
    return { policy, currentFreeBytes, report };
}
