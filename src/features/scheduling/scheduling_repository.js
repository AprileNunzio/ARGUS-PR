import crypto from 'node:crypto';
import { getDatabase } from '../../storage/database.js';
import { DEFAULT_WEEK_MASK } from './schedule.js';

function toSchedule(row) {
    if (!row) return null;
    return {
        id: row.id,
        cameraId: row.camera_id,
        mode: row.mode,
        weekMask: row.week_mask,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function toException(row) {
    if (!row) return null;
    return {
        id: row.id,
        cameraId: row.camera_id,
        day: row.day,
        mode: row.mode,
        weekMask: row.week_mask,
        note: row.note,
        createdAt: row.created_at
    };
}

export function getSchedule(cameraId) {
    const row = getDatabase()
        .prepare('SELECT * FROM schedules WHERE camera_id = ?')
        .get(cameraId);
    return toSchedule(row);
}

export function upsertSchedule(cameraId, data) {
    const now = new Date().toISOString();
    const existing = getSchedule(cameraId);
    const mode = data.mode ?? 'continuous';
    const weekMask = data.weekMask ?? DEFAULT_WEEK_MASK;

    if (existing) {
        getDatabase()
            .prepare(`UPDATE schedules SET mode = ?, week_mask = ?, updated_at = ? WHERE camera_id = ?`)
            .run(mode, weekMask, now, cameraId);
        return getSchedule(cameraId);
    }

    const id = crypto.randomUUID();
    getDatabase()
        .prepare(`INSERT INTO schedules (id, camera_id, mode, week_mask, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, cameraId, mode, weekMask, now, now);
    return getSchedule(cameraId);
}

export function deleteSchedule(cameraId) {
    return getDatabase()
        .prepare('DELETE FROM schedules WHERE camera_id = ?')
        .run(cameraId).changes > 0;
}

export function listExceptions(cameraId) {
    return getDatabase()
        .prepare('SELECT * FROM schedule_exceptions WHERE camera_id = ? ORDER BY day ASC')
        .all(cameraId)
        .map(toException);
}

export function getException(cameraId, day) {
    const row = getDatabase()
        .prepare('SELECT * FROM schedule_exceptions WHERE camera_id = ? AND day = ?')
        .get(cameraId, day);
    return toException(row);
}

export function upsertException(cameraId, data) {
    const now = new Date().toISOString();
    const existing = getException(cameraId, data.day);

    if (existing) {
        getDatabase()
            .prepare(`UPDATE schedule_exceptions SET mode = ?, week_mask = ?, note = ? WHERE camera_id = ? AND day = ?`)
            .run(data.mode, data.weekMask ?? null, data.note ?? null, cameraId, data.day);
        return getException(cameraId, data.day);
    }

    const id = crypto.randomUUID();
    getDatabase()
        .prepare(`INSERT INTO schedule_exceptions (id, camera_id, day, mode, week_mask, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, cameraId, data.day, data.mode, data.weekMask ?? null, data.note ?? null, now);
    return getException(cameraId, data.day);
}

export function deleteException(cameraId, day) {
    return getDatabase()
        .prepare('DELETE FROM schedule_exceptions WHERE camera_id = ? AND day = ?')
        .run(cameraId, day).changes > 0;
}

export function getEffectiveSchedule(cameraId, date = new Date()) {
    const schedule = getSchedule(cameraId);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dayKey = `${year}-${month}-${day}`;
    const exception = getException(cameraId, dayKey);
    return { schedule, exception };
}
