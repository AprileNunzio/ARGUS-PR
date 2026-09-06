export default {
    version: 2,
    name: 'exports',
    sql: `
CREATE TABLE IF NOT EXISTS exports (
    id TEXT PRIMARY KEY,
    camera_id TEXT NOT NULL,
    camera_name TEXT NOT NULL,
    from_ms INTEGER NOT NULL,
    to_ms INTEGER NOT NULL,
    reason TEXT,
    state TEXT NOT NULL DEFAULT 'pending',
    output_bytes INTEGER NOT NULL DEFAULT 0,
    output_sha256 TEXT,
    chain_root TEXT,
    manifest_sha256 TEXT,
    sources_intact INTEGER NOT NULL DEFAULT 1,
    segment_count INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    actor_id TEXT,
    actor_name TEXT,
    remote_addr TEXT,
    requested_at TEXT NOT NULL,
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_exports_camera ON exports(camera_id);
CREATE INDEX IF NOT EXISTS idx_exports_requested ON exports(requested_at DESC);
`
};
