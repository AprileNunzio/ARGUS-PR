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
        cameraName: row.camera_name ?? row.camera_id,
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
        zoneId: row.zone_id,
        upperColor: row.upper_color
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
                   snapshot_path, plate_text, person_id, match_score, zone_id, upper_color)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
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
            data.zoneId ?? null,
            data.upperColor ?? null
        );

    return toEvent(getDatabase().prepare('SELECT * FROM detection_events WHERE id = ?').get(id));
}

export function recordMotionEvent(data) {
    return insertDetectionEvent(data);
}

export function getDetectionEventById(id) {
    const row = getDatabase()
        .prepare(`SELECT e.*, c.name AS camera_name FROM detection_events e
                  LEFT JOIN cameras c ON c.id = e.camera_id
                  WHERE e.id = ?`)
        .get(id);
    return toEvent(row);
}

export function listDetectionEvents(filters = {}) {
    const conditions = [];
    const params = [];

    if (filters.cameraId) {
        conditions.push('e.camera_id = ?');
        params.push(filters.cameraId);
    }
    if (filters.className) {
        conditions.push('e.class_name = ?');
        params.push(filters.className);
    }
    if (filters.plate) {
        conditions.push('e.plate_text LIKE ?');
        params.push(`%${filters.plate.toUpperCase().trim()}%`);
    }
    if (filters.personId) {
        conditions.push('e.person_id = ?');
        params.push(filters.personId);
    }
    if (filters.upperColor) {
        conditions.push('e.upper_color = ?');
        params.push(filters.upperColor.toLowerCase().trim());
    }
    if (filters.zoneId) {
        conditions.push('e.zone_id = ?');
        params.push(filters.zoneId);
    }
    if (filters.minConfidence !== undefined && filters.minConfidence !== null) {
        conditions.push('e.confidence >= ?');
        params.push(Number(filters.minConfidence));
    }
    if (filters.from) {
        conditions.push('e.started_at >= ?');
        params.push(filters.from);
    }
    if (filters.to) {
        conditions.push('e.started_at <= ?');
        params.push(filters.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    const offset = Math.max(Number(filters.offset) || 0, 0);

    const rows = getDatabase()
        .prepare(`SELECT e.*, c.name AS camera_name FROM detection_events e
                  LEFT JOIN cameras c ON c.id = e.camera_id
                  ${whereClause}
                  ORDER BY e.started_at DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset);

    return rows.map(toEvent);
}

export function hasRecentEvent(cameraId, fromIso, toIso) {
    const row = getDatabase()
        .prepare('SELECT id FROM detection_events WHERE camera_id = ? AND started_at >= ? AND started_at <= ? LIMIT 1')
        .get(cameraId, fromIso, toIso);
    return Boolean(row);
}

export function getDetectionStats(filters = {}) {
    const db = getDatabase();
    const from = filters.from || new Date(Date.now() - 7 * 86400000).toISOString();
    const to = filters.to || new Date().toISOString();

    const topPlates = db.prepare(`
        SELECT plate_text AS plateText, COUNT(*) AS count,
               MIN(started_at) AS first_seen, MAX(started_at) AS last_seen,
               COUNT(DISTINCT camera_id) AS cameras_count
        FROM detection_events
        WHERE plate_text IS NOT NULL AND started_at >= ? AND started_at <= ?
        GROUP BY plate_text
        ORDER BY count DESC
        LIMIT 50
    `).all(from, to);

    const topPeople = db.prepare(`
        SELECT p.name AS personName, e.person_id AS personId, COUNT(*) AS count,
               MIN(e.started_at) AS first_seen, MAX(e.started_at) AS last_seen,
               COUNT(DISTINCT e.camera_id) AS cameras_count
        FROM detection_events e
        LEFT JOIN people p ON p.id = e.person_id
        WHERE e.person_id IS NOT NULL AND e.started_at >= ? AND e.started_at <= ?
        GROUP BY e.person_id
        ORDER BY count DESC
        LIMIT 50
    `).all(from, to);

    const colorStats = db.prepare(`
        SELECT upper_color AS upperColor, COUNT(*) AS count,
               MIN(started_at) AS first_seen, MAX(started_at) AS last_seen
        FROM detection_events
        WHERE class_name = 'person' AND upper_color IS NOT NULL AND started_at >= ? AND started_at <= ?
        GROUP BY upper_color
        ORDER BY count DESC
    `).all(from, to);

    return {
        from,
        to,
        plates: topPlates,
        people: topPeople,
        colors: colorStats
    };
}

export function countRecentOccurrences({ cameraId, className, plateText, personId, upperColor, windowMinutes = 60 }) {
    const db = getDatabase();
    const since = new Date(Date.now() - windowMinutes * 60000).toISOString();
    const conditions = ['started_at >= ?'];
    const params = [since];

    if (cameraId) {
        conditions.push('camera_id = ?');
        params.push(cameraId);
    }
    if (className) {
        conditions.push('class_name = ?');
        params.push(className);
    }
    if (plateText) {
        conditions.push('plate_text = ?');
        params.push(plateText.toUpperCase().trim());
    }
    if (personId) {
        conditions.push('person_id = ?');
        params.push(personId);
    }
    if (upperColor) {
        conditions.push('upper_color = ?');
        params.push(upperColor.toLowerCase().trim());
    }

    const row = db.prepare(`SELECT COUNT(*) AS total FROM detection_events WHERE ${conditions.join(' AND ')}`).get(...params);
    return row?.total ?? 0;
}
