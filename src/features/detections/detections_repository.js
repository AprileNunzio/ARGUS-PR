import crypto from 'node:crypto';
import { getDatabase } from '../../storage/database.js';

function hashKey(key) {
    return crypto.createHash('sha256').update(String(key).trim()).digest('hex');
}

function toSource(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        cameraId: row.camera_id,
        isActive: row.is_active === 1,
        lastSeenAt: row.last_seen_at,
        createdAt: row.created_at
    };
}

function toEvent(row) {
    if (!row) return null;
    return {
        id: row.id,
        cameraId: row.camera_id,
        source: row.source,
        className: row.class_name,
        trackId: row.track_id,
        confidence: row.confidence,
        box: row.box_x !== null ? [row.box_x, row.box_y, row.box_w, row.box_h] : null,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        snapshotPath: row.snapshot_path,
        plateText: row.plate_text,
        personId: row.person_id,
        matchScore: row.match_score,
        zoneId: row.zone_id
    };
}

export function createDetectionSource(data) {
    const id = crypto.randomUUID();
    const rawKey = `argus_src_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = hashKey(rawKey);
    const now = new Date().toISOString();

    getDatabase()
        .prepare(`INSERT INTO detection_sources (id, name, key_hash, camera_id, is_active, created_at)
                  VALUES (?, ?, ?, ?, 1, ?)`)
        .run(id, data.name, keyHash, data.cameraId ?? null, now);

    const source = toSource(getDatabase().prepare('SELECT * FROM detection_sources WHERE id = ?').get(id));
    return { source, rawKey };
}

export function authenticateSourceKey(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') return null;
    const keyHash = hashKey(rawKey);
    const row = getDatabase()
        .prepare('SELECT * FROM detection_sources WHERE key_hash = ? AND is_active = 1')
        .get(keyHash);

    if (!row) return null;

    const now = new Date().toISOString();
    getDatabase().prepare('UPDATE detection_sources SET last_seen_at = ? WHERE id = ?').run(now, row.id);
    row.last_seen_at = now;

    return toSource(row);
}


export function listDetectionSources() {
    return getDatabase()
        .prepare('SELECT * FROM detection_sources ORDER BY created_at ASC')
        .all()
        .map(toSource);
}

export function deleteDetectionSource(id) {
    return getDatabase()
        .prepare('DELETE FROM detection_sources WHERE id = ?')
        .run(id).changes > 0;
}

export function insertDetectionEvent(data) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const box = data.box ?? [null, null, null, null];

    getDatabase()
        .prepare(`INSERT INTO detection_events
                  (id, camera_id, source, class_name, track_id, confidence,
                   box_x, box_y, box_w, box_h, started_at, ended_at,
                   snapshot_path, plate_text, person_id, match_score, zone_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
            id,
            data.cameraId,
            data.source ?? 'api',
            data.className,
            data.trackId ?? null,
            data.confidence ?? 1.0,
            box[0] ?? null,
            box[1] ?? null,
            box[2] ?? null,
            box[3] ?? null,
            data.startedAt ?? now,
            data.endedAt ?? null,
            data.snapshotPath ?? null,
            data.plateText ?? null,
            data.personId ?? null,
            data.matchScore ?? null,
            data.zoneId ?? null
        );

    return toEvent(getDatabase().prepare('SELECT * FROM detection_events WHERE id = ?').get(id));
}

export function recordMotionEvent(data) {
    return insertDetectionEvent(data);
}

export function listDetectionEvents(filters = {}) {
    const conditions = [];
    const params = [];

    if (filters.cameraId) {
        conditions.push('camera_id = ?');
        params.push(filters.cameraId);
    }
    if (filters.className) {
        conditions.push('class_name = ?');
        params.push(filters.className);
    }
    if (filters.from) {
        conditions.push('started_at >= ?');
        params.push(filters.from);
    }
    if (filters.to) {
        conditions.push('started_at <= ?');
        params.push(filters.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    const offset = Math.max(Number(filters.offset) || 0, 0);

    const rows = getDatabase()
        .prepare(`SELECT * FROM detection_events ${whereClause} ORDER BY started_at DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset);

    return rows.map(toEvent);
}

export function hasRecentEvent(cameraId, fromIso, toIso) {
    const row = getDatabase()
        .prepare('SELECT id FROM detection_events WHERE camera_id = ? AND started_at >= ? AND started_at <= ? LIMIT 1')
        .get(cameraId, fromIso, toIso);
    return Boolean(row);
}
