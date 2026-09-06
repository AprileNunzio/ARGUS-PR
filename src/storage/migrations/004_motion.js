export default {
    version: 4,
    name: 'motion',
    sql: `
CREATE TABLE IF NOT EXISTS motion_zones (
    id TEXT PRIMARY KEY,
    camera_id TEXT NOT NULL,
    name TEXT NOT NULL,
    points_json TEXT NOT NULL,
    sensitivity REAL NOT NULL DEFAULT 0.015,
    cooldown_seconds INTEGER NOT NULL DEFAULT 15,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_motion_zones_camera ON motion_zones(camera_id);
`
};
