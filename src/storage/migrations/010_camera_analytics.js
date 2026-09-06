export default {
    version: 10,
    name: 'camera_analytics',
    sql: `
CREATE TABLE IF NOT EXISTS camera_analytics (
    camera_id TEXT NOT NULL,
    capability TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    engine_id TEXT NOT NULL,
    threshold REAL,
    min_size REAL,
    options TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (camera_id, capability),
    FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_camera_analytics_enabled ON camera_analytics(camera_id, enabled);
`
};
