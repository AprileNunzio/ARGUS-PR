import { getDatabase } from '../../storage/database.js';
import { encryptSecret, decryptSecret } from '../../security/vault.js';

function toPublic(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        kind: row.kind,
        path: row.path,
        isDefault: row.is_default === 1,
        maxBytes: row.max_bytes,
        minFreeBytes: row.min_free_bytes,
        networkHost: row.network_host,
        networkShare: row.network_share,
        networkProto: row.network_proto,
        username: row.username,
        hasPassword: Boolean(row.password_secret),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

export function listStoragePools() {
    return getDatabase()
        .prepare('SELECT * FROM storage_pools ORDER BY is_default DESC, name COLLATE NOCASE')
        .all()
        .map(toPublic);
}

export function getStoragePool(id) {
    return toPublic(getDatabase().prepare('SELECT * FROM storage_pools WHERE id = ?').get(id));
}

export function getDefaultStoragePool() {
    return toPublic(getDatabase().prepare('SELECT * FROM storage_pools WHERE is_default = 1 LIMIT 1').get());
}

export function getStoragePoolSecrets(id) {
    const row = getDatabase().prepare('SELECT * FROM storage_pools WHERE id = ?').get(id);
    if (!row) return null;
    return {
        ...toPublic(row),
        password: decryptSecret(row.password_secret)
    };
}

export function insertStoragePool(pool) {
    const at = new Date().toISOString();
    const db = getDatabase();

    if (pool.isDefault) {
        db.prepare('UPDATE storage_pools SET is_default = 0').run();
    }

    db.prepare(`
        INSERT INTO storage_pools (
            id, name, kind, path, is_default, max_bytes, min_free_bytes,
            network_host, network_share, network_proto, username, password_secret, status,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        pool.id,
        pool.name,
        pool.kind || 'local',
        pool.path,
        pool.isDefault ? 1 : 0,
        pool.maxBytes || 0,
        pool.minFreeBytes || 5368709120,
        pool.networkHost || null,
        pool.networkShare || null,
        pool.networkProto || null,
        pool.username || null,
        pool.password ? encryptSecret(pool.password) : null,
        pool.status || 'online',
        at,
        at
    );

    return getStoragePool(pool.id);
}

export function updateStoragePool(id, patch) {
    const existing = getDatabase().prepare('SELECT * FROM storage_pools WHERE id = ?').get(id);
    if (!existing) return null;

    const db = getDatabase();
    if (patch.isDefault) {
        db.prepare('UPDATE storage_pools SET is_default = 0').run();
    }

    const assignments = ['updated_at = ?'];
    const values = [new Date().toISOString()];

    const fields = {
        name: 'name',
        kind: 'kind',
        path: 'path',
        maxBytes: 'max_bytes',
        minFreeBytes: 'min_free_bytes',
        networkHost: 'network_host',
        networkShare: 'network_share',
        networkProto: 'network_proto',
        username: 'username',
        status: 'status'
    };

    for (const [key, col] of Object.entries(fields)) {
        if (patch[key] !== undefined) {
            assignments.push(`${col} = ?`);
            values.push(patch[key]);
        }
    }

    if (patch.isDefault !== undefined) {
        assignments.push('is_default = ?');
        values.push(patch.isDefault ? 1 : 0);
    }

    if (patch.password !== undefined) {
        assignments.push('password_secret = ?');
        values.push(patch.password ? encryptSecret(patch.password) : null);
    }

    values.push(id);
    db.prepare(`UPDATE storage_pools SET ${assignments.join(', ')} WHERE id = ?`).run(...values);

    return getStoragePool(id);
}

export function deleteStoragePool(id) {
    const db = getDatabase();
    db.prepare('UPDATE cameras SET storage_pool_id = NULL WHERE storage_pool_id = ?').run(id);
    return db.prepare('DELETE FROM storage_pools WHERE id = ?').run(id).changes > 0;
}
