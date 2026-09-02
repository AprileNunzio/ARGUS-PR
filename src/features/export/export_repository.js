import { getDatabase } from '../../storage/database.js';

function toRecord(row) {
    if (!row) return null;

    return {
        id: row.id,
        cameraId: row.camera_id,
        cameraName: row.camera_name,
        fromMs: row.from_ms,
        toMs: row.to_ms,
        reason: row.reason,
        state: row.state,
        outputBytes: row.output_bytes,
        outputSha256: row.output_sha256,
        chainRoot: row.chain_root,
        manifestSha256: row.manifest_sha256,
        sourcesIntact: row.sources_intact === 1,
        segmentCount: row.segment_count,
        error: row.error,
        actorName: row.actor_name,
        requestedAt: row.requested_at,
        completedAt: row.completed_at
    };
}

export function insertExport(entry) {
    getDatabase()
        .prepare(`INSERT INTO exports (id, camera_id, camera_name, from_ms, to_ms, reason, state,
                                       segment_count, actor_id, actor_name, remote_addr, requested_at)
                  VALUES (@id, @cameraId, @cameraName, @fromMs, @toMs, @reason, 'pending',
                          @segmentCount, @actorId, @actorName, @remoteAddr, @requestedAt)`)
        .run(entry);

    return getExport(entry.id);
}

export function completeExport(id, result) {
    getDatabase()
        .prepare(`UPDATE exports
                  SET state = 'ready', output_bytes = @outputBytes, output_sha256 = @outputSha256,
                      chain_root = @chainRoot, manifest_sha256 = @manifestSha256,
                      sources_intact = @sourcesIntact, completed_at = @completedAt
                  WHERE id = @id`)
        .run({ id, ...result });

    return getExport(id);
}

export function failExport(id, message) {
    getDatabase()
        .prepare('UPDATE exports SET state = \'failed\', error = ?, completed_at = ? WHERE id = ?')
        .run(String(message).slice(0, 500), new Date().toISOString(), id);

    return getExport(id);
}

export function getExport(id) {
    return toRecord(getDatabase().prepare('SELECT * FROM exports WHERE id = ?').get(id));
}

export function listExports(limit = 50) {
    return getDatabase()
        .prepare('SELECT * FROM exports ORDER BY requested_at DESC LIMIT ?')
        .all(Math.min(Math.max(limit, 1), 200))
        .map(toRecord);
}

export function deleteExport(id) {
    return getDatabase().prepare('DELETE FROM exports WHERE id = ?').run(id).changes > 0;
}

export function countActiveExports() {
    return getDatabase().prepare('SELECT COUNT(*) AS total FROM exports WHERE state = \'pending\'').get().total;
}
