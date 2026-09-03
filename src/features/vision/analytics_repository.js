import { getDatabase } from '../../storage/database.js';
import { mergeProfile } from './analytics_profile.js';

function toEntry(row) {
    return {
        capability: row.capability,
        enabled: row.enabled === 1,
        engineId: row.engine_id,
        threshold: row.threshold,
        minSize: row.min_size,
        options: row.options ? JSON.parse(row.options) : null
    };
}

export function listStored(cameraId) {
    return getDatabase()
        .prepare('SELECT * FROM camera_analytics WHERE camera_id = ?')
        .all(cameraId)
        .map(toEntry);
}

export function profileFor(cameraId) {
    return mergeProfile(listStored(cameraId));
}

export function replaceProfile(cameraId, entries) {
    const database = getDatabase();
    const at = new Date().toISOString();

    const remove = database.prepare('DELETE FROM camera_analytics WHERE camera_id = ?');
    const insert = database.prepare(`INSERT INTO camera_analytics
        (camera_id, capability, enabled, engine_id, threshold, min_size, options, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

    const write = database.transaction((rows) => {
        remove.run(cameraId);
        for (const row of rows) {
            insert.run(
                cameraId,
                row.capability,
                row.enabled ? 1 : 0,
                row.engineId,
                row.threshold ?? null,
                row.minSize ?? null,
                row.options ? JSON.stringify(row.options) : null,
                at
            );
        }
    });

    write(entries);
    return profileFor(cameraId);
}

export function deleteProfile(cameraId) {
    return getDatabase().prepare('DELETE FROM camera_analytics WHERE camera_id = ?').run(cameraId).changes;
}

export function camerasWithAnalytics() {
    return getDatabase()
        .prepare('SELECT DISTINCT camera_id FROM camera_analytics WHERE enabled = 1')
        .all()
        .map((row) => row.camera_id);
}
