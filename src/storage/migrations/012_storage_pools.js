export default {
    version: 12,
    name: 'storage_pools',
    sql: `
CREATE TABLE IF NOT EXISTS storage_pools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'local',
    path TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    max_bytes INTEGER NOT NULL DEFAULT 0,
    min_free_bytes INTEGER NOT NULL DEFAULT 5368709120,
    network_host TEXT,
    network_share TEXT,
    network_proto TEXT,
    username TEXT,
    password_secret TEXT,
    status TEXT NOT NULL DEFAULT 'online',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_storage_pools_default ON storage_pools(is_default);

ALTER TABLE cameras ADD COLUMN storage_pool_id TEXT;
`
};
