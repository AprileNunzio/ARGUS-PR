import crypto from 'node:crypto';
import { getDatabase } from '../../storage/database.js';

function toFloorPlan(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        imagePath: row.image_path,
        width: row.width,
        height: row.height,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function toMarker(row) {
    if (!row) return null;
    return {
        id: row.id,
        floorPlanId: row.floor_plan_id,
        cameraId: row.camera_id,
        cameraName: row.camera_name ?? row.camera_id,
        x: row.x,
        y: row.y,
        fovAngle: row.fov_angle,
        fovRange: row.fov_range,
        createdAt: row.created_at
    };
}

function toBarrier(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        cameraId: row.camera_id,
        kind: row.kind,
        points: (() => {
            try {
                return JSON.parse(row.points);
            } catch {
                return [];
            }
        })(),
        direction: row.direction,
        enabled: row.enabled === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

export function listFloorPlans() {
    return getDatabase()
        .prepare('SELECT * FROM floor_plans ORDER BY created_at ASC')
        .all()
        .map(toFloorPlan);
}

export function getFloorPlanById(id) {
    const row = getDatabase().prepare('SELECT * FROM floor_plans WHERE id = ?').get(id);
    return toFloorPlan(row);
}

export function createFloorPlan({ name, imagePath, width, height }) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO floor_plans (id, name, image_path, width, height, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, name, imagePath, width, height, now, now);
    return getFloorPlanById(id);
}

export function deleteFloorPlan(id) {
    return getDatabase().prepare('DELETE FROM floor_plans WHERE id = ?').run(id).changes > 0;
}

export function listFloorPlanMarkers(floorPlanId) {
    return getDatabase()
        .prepare(`SELECT m.*, c.name AS camera_name FROM floor_plan_markers m
                  LEFT JOIN cameras c ON c.id = m.camera_id
                  WHERE m.floor_plan_id = ?`)
        .all(floorPlanId)
        .map(toMarker);
}

export function upsertFloorPlanMarker({ floorPlanId, cameraId, x, y, fovAngle = 0, fovRange = 50 }) {
    const existing = getDatabase()
        .prepare('SELECT id FROM floor_plan_markers WHERE floor_plan_id = ? AND camera_id = ?')
        .get(floorPlanId, cameraId);
    const now = new Date().toISOString();

    if (existing) {
        getDatabase()
            .prepare(`UPDATE floor_plan_markers
                      SET x = ?, y = ?, fov_angle = ?, fov_range = ?
                      WHERE id = ?`)
            .run(x, y, fovAngle, fovRange, existing.id);
        const row = getDatabase().prepare('SELECT * FROM floor_plan_markers WHERE id = ?').get(existing.id);
        return toMarker(row);
    }

    const id = crypto.randomUUID();
    getDatabase()
        .prepare(`INSERT INTO floor_plan_markers (id, floor_plan_id, camera_id, x, y, fov_angle, fov_range, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, floorPlanId, cameraId, x, y, fovAngle, fovRange, now);
    const row = getDatabase().prepare('SELECT * FROM floor_plan_markers WHERE id = ?').get(id);
    return toMarker(row);
}

export function deleteFloorPlanMarker(markerId) {
    return getDatabase().prepare('DELETE FROM floor_plan_markers WHERE id = ?').run(markerId).changes > 0;
}

export function listVirtualBarriers(cameraId = null) {
    const db = getDatabase();
    if (cameraId) {
        return db.prepare('SELECT * FROM virtual_barriers WHERE camera_id = ?').all(cameraId).map(toBarrier);
    }
    return db.prepare('SELECT * FROM virtual_barriers ORDER BY created_at ASC').all().map(toBarrier);
}

export function createVirtualBarrier({ name, cameraId, kind, points, direction = 'both' }) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const pts = typeof points === 'string' ? points : JSON.stringify(points);
    getDatabase()
        .prepare(`INSERT INTO virtual_barriers (id, name, camera_id, kind, points, direction, enabled, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`)
        .run(id, name, cameraId, kind, pts, direction, now, now);
    const row = getDatabase().prepare('SELECT * FROM virtual_barriers WHERE id = ?').get(id);
    return toBarrier(row);
}

export function deleteVirtualBarrier(id) {
    return getDatabase().prepare('DELETE FROM virtual_barriers WHERE id = ?').run(id).changes > 0;
}
