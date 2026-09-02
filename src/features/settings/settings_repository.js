import { getDatabase } from '../../storage/database.js';

const cache = new Map();

export function getSetting(key, fallback = null) {
    if (cache.has(key)) return cache.get(key);

    const row = getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get(key);
    const value = row ? JSON.parse(row.value) : fallback;
    cache.set(key, value);
    return value;
}

export function setSetting(key, value) {
    getDatabase()
        .prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
        .run(key, JSON.stringify(value), new Date().toISOString());
    cache.set(key, value);
    return value;
}

export function allSettings(defaults = {}) {
    const rows = getDatabase().prepare('SELECT key, value FROM settings').all();
    const stored = {};
    for (const row of rows) {
        stored[row.key] = JSON.parse(row.value);
    }
    return { ...defaults, ...stored };
}

export function invalidateSettings() {
    cache.clear();
}
