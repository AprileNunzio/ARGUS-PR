export default {
    version: 17,
    name: 'floor_plans_and_barriers',
    sql: `
CREATE TABLE IF NOT EXISTS floor_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    image_path TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS floor_plan_markers (
    id TEXT PRIMARY KEY,
    floor_plan_id TEXT NOT NULL REFERENCES floor_plans(id) ON DELETE CASCADE,
    camera_id TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
    x REAL NOT NULL,
    y REAL NOT NULL,
    fov_angle REAL DEFAULT 0,
    fov_range REAL DEFAULT 50,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_floor_plan_markers_plan ON floor_plan_markers(floor_plan_id);

CREATE TABLE IF NOT EXISTS virtual_barriers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    camera_id TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    points TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'both',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_virtual_barriers_camera ON virtual_barriers(camera_id, enabled);
`
};
