export default {
    version: 6,
    name: 'vision_access',
    sql: `
CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    notes TEXT,
    embedding TEXT NOT NULL,
    photo_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS face_logs (
    id TEXT PRIMARY KEY,
    camera_id TEXT NOT NULL,
    person_id TEXT,
    confidence REAL NOT NULL,
    box_x REAL, box_y REAL, box_w REAL, box_h REAL,
    snapshot_path TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_face_logs_person ON face_logs(person_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_face_logs_camera ON face_logs(camera_id, created_at DESC);

CREATE TABLE IF NOT EXISTS access_rules (
    id TEXT PRIMARY KEY,
    plate_pattern TEXT NOT NULL,
    plate_normalised TEXT NOT NULL,
    label TEXT NOT NULL,
    list_type TEXT NOT NULL CHECK(list_type IN ('whitelist','blacklist','monitored')),
    is_active INTEGER NOT NULL DEFAULT 1,
    valid_from TEXT,
    valid_to TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_rules_plate ON access_rules(plate_normalised);

CREATE TABLE IF NOT EXISTS access_events (
    id TEXT PRIMARY KEY,
    camera_id TEXT NOT NULL,
    plate TEXT NOT NULL,
    decision TEXT NOT NULL CHECK(decision IN ('allow','deny','log')),
    rule_id TEXT,
    confidence REAL,
    snapshot_path TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_events_plate ON access_events(plate, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_events_time ON access_events(created_at DESC);
`
};
