import crypto from 'node:crypto';
import { getDatabase } from '../../storage/database.js';
import { validationError } from '../../kernel/errors.js';

const MAX_ZONES_PER_CAMERA = 32;

function toPublic(row) {
    if (!row) return null;
    let points = [];
    try {
        points = JSON.parse(row.points_json);
    } catch {
        points = [];
    }
    return {
        id: row.id,
        cameraId: row.camera_id,
        name: row.name,
        points,
        sensitivity: row.sensitivity,
        cooldownSeconds: row.cooldown_seconds,
        isActive: row.is_active === 1,
        createdAt: row.created_at
    };
}

export function listZones(cameraId) {
    return getDatabase()
        .prepare('SELECT * FROM motion_zones WHERE camera_id = ? ORDER BY created_at ASC')
        .all(cameraId)
        .map(toPublic);
}

export function getZone(id) {
    const row = getDatabase()
        .prepare('SELECT * FROM motion_zones WHERE id = ?')
        .get(id);
    return toPublic(row);
}

export function insertZone(cameraId, data) {
    const existingCount = getDatabase()
        .prepare('SELECT COUNT(*) as count FROM motion_zones WHERE camera_id = ?')
        .get(cameraId)?.count ?? 0;

    if (existingCount >= MAX_ZONES_PER_CAMERA) {
        throw validationError(`Maximum ${MAX_ZONES_PER_CAMERA} motion zones allowed per camera`);
    }

    const id = data.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const pointsJson = JSON.stringify(data.points ?? []);
    const sensitivity = data.sensitivity ?? 0.015;
    const cooldownSeconds = data.cooldownSeconds ?? 15;
    const isActive = data.isActive !== false ? 1 : 0;

    getDatabase()
        .prepare(`INSERT INTO motion_zones (id, camera_id, name, points_json, sensitivity, cooldown_seconds, is_active, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, cameraId, data.name, pointsJson, sensitivity, cooldownSeconds, isActive, now);

    return getZone(id);
}

export function updateZone(id, patch) {
    const existing = getZone(id);
    if (!existing) return null;

    const name = patch.name ?? existing.name;
    const pointsJson = patch.points !== undefined ? JSON.stringify(patch.points) : JSON.stringify(existing.points);
    const sensitivity = patch.sensitivity ?? existing.sensitivity;
    const cooldownSeconds = patch.cooldownSeconds ?? existing.cooldownSeconds;
    const isActive = patch.isActive !== undefined ? (patch.isActive ? 1 : 0) : (existing.isActive ? 1 : 0);

    getDatabase()
        .prepare(`UPDATE motion_zones SET name = ?, points_json = ?, sensitivity = ?, cooldown_seconds = ?, is_active = ? WHERE id = ?`)
        .run(name, pointsJson, sensitivity, cooldownSeconds, isActive, id);

    return getZone(id);
}

export function deleteZone(id) {
    return getDatabase()
        .prepare('DELETE FROM motion_zones WHERE id = ?')
        .run(id).changes > 0;
}

export function replaceZones(cameraId, zones) {
    if (!Array.isArray(zones) || zones.length > MAX_ZONES_PER_CAMERA) {
        throw validationError(`Zones must be an array of at most ${MAX_ZONES_PER_CAMERA} items`);
    }

    const db = getDatabase();
    const tx = db.transaction(() => {
        db.prepare('DELETE FROM motion_zones WHERE camera_id = ?').run(cameraId);
        for (const zone of zones) {
            insertZone(cameraId, zone);
        }
    });

    tx();
    return listZones(cameraId);
}
