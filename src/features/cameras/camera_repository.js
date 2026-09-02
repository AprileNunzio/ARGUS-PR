import { getDatabase } from '../../storage/database.js';
import { encryptSecret, decryptSecret } from '../../security/vault.js';
import { redactCredentials } from '../../security/guards.js';

function toPublic(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        enabled: row.enabled === 1,
        sourceKind: row.source_kind,
        host: row.host,
        port: row.port,
        mainStreamUrl: redactCredentials(row.main_stream_url),
        subStreamUrl: redactCredentials(row.sub_stream_url),
        username: row.username,
        hasPassword: Boolean(row.password_secret),
        onvifPort: row.onvif_port,
        manufacturer: row.manufacturer,
        model: row.model,
        transport: row.transport,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

export function listCameras() {
    return getDatabase()
        .prepare('SELECT * FROM cameras ORDER BY name COLLATE NOCASE')
        .all()
        .map(toPublic);
}

export function getCamera(id) {
    return toPublic(getDatabase().prepare('SELECT * FROM cameras WHERE id = ?').get(id));
}

export function getCameraSecrets(id) {
    const row = getDatabase().prepare('SELECT * FROM cameras WHERE id = ?').get(id);
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        mainStreamUrl: row.main_stream_url,
        subStreamUrl: row.sub_stream_url,
        username: row.username,
        password: decryptSecret(row.password_secret),
        transport: row.transport
    };
}

export function insertCamera(camera) {
    const at = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO cameras
                  (id, name, enabled, source_kind, host, port, main_stream_url, sub_stream_url,
                   username, password_secret, onvif_port, manufacturer, model, transport, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
            camera.id,
            camera.name,
            camera.enabled ? 1 : 0,
            camera.sourceKind,
            camera.host,
            camera.port,
            camera.mainStreamUrl,
            camera.subStreamUrl,
            camera.username,
            camera.password ? encryptSecret(camera.password) : null,
            camera.onvifPort,
            camera.manufacturer,
            camera.model,
            camera.transport,
            at,
            at
        );
    return getCamera(camera.id);
}

export function updateCamera(id, patch) {
    const existing = getDatabase().prepare('SELECT * FROM cameras WHERE id = ?').get(id);
    if (!existing) return null;

    const passwordSecret = patch.password === undefined
        ? existing.password_secret
        : (patch.password ? encryptSecret(patch.password) : null);

    getDatabase()
        .prepare(`UPDATE cameras SET
                    name = ?, enabled = ?, source_kind = ?, host = ?, port = ?,
                    main_stream_url = ?, sub_stream_url = ?, username = ?, password_secret = ?,
                    onvif_port = ?, manufacturer = ?, model = ?, transport = ?, updated_at = ?
                  WHERE id = ?`)
        .run(
            patch.name ?? existing.name,
            (patch.enabled ?? existing.enabled === 1) ? 1 : 0,
            patch.sourceKind ?? existing.source_kind,
            patch.host ?? existing.host,
            patch.port ?? existing.port,
            patch.mainStreamUrl ?? existing.main_stream_url,
            patch.subStreamUrl ?? existing.sub_stream_url,
            patch.username ?? existing.username,
            passwordSecret,
            patch.onvifPort ?? existing.onvif_port,
            patch.manufacturer ?? existing.manufacturer,
            patch.model ?? existing.model,
            patch.transport ?? existing.transport,
            new Date().toISOString(),
            id
        );

    return getCamera(id);
}

export function deleteCamera(id) {
    return getDatabase().prepare('DELETE FROM cameras WHERE id = ?').run(id).changes > 0;
}
