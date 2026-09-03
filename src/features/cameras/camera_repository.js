import { getDatabase } from '../../storage/database.js';
import { encryptSecret, decryptSecret } from '../../security/vault.js';
import { redactCredentials } from '../../security/guards.js';

const COLUMNS = Object.freeze({
    name: 'name',
    sourceKind: 'source_kind',
    host: 'host',
    port: 'port',
    mainStreamUrl: 'main_stream_url',
    subStreamUrl: 'sub_stream_url',
    username: 'username',
    onvifPort: 'onvif_port',
    manufacturer: 'manufacturer',
    model: 'model',
    transport: 'transport',
    deviceId: 'device_id',
    inputFormat: 'input_format',
    captureWidth: 'capture_width',
    captureHeight: 'capture_height',
    captureFps: 'capture_fps',
    location: 'location',
    group: 'camera_group',
    retentionDays: 'retention_days',
    hwaccel: 'hwaccel',
    notes: 'notes'
});

const BOOLEAN_COLUMNS = Object.freeze({ enabled: 'enabled', audioEnabled: 'audio_enabled' });

function toPublic(row) {
    if (!row) return null;

    const camera = {
        id: row.id,
        enabled: row.enabled === 1,
        audioEnabled: row.audio_enabled === 1,
        hasPassword: Boolean(row.password_secret),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };

    for (const [key, column] of Object.entries(COLUMNS)) {
        camera[key] = row[column] ?? null;
    }

    camera.mainStreamUrl = redactCredentials(row.main_stream_url);
    camera.subStreamUrl = redactCredentials(row.sub_stream_url);

    return camera;
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
        sourceKind: row.source_kind,
        mainStreamUrl: row.main_stream_url,
        subStreamUrl: row.sub_stream_url,
        username: row.username,
        password: decryptSecret(row.password_secret),
        transport: row.transport,
        deviceId: row.device_id,
        inputFormat: row.input_format,
        captureWidth: row.capture_width,
        captureHeight: row.capture_height,
        captureFps: row.capture_fps,
        audioEnabled: row.audio_enabled === 1,
        hwaccel: row.hwaccel,
        retentionDays: row.retention_days
    };
}

export function insertCamera(camera) {
    const at = new Date().toISOString();
    const columns = ['id', 'created_at', 'updated_at', 'password_secret'];
    const values = [camera.id, at, at, camera.password ? encryptSecret(camera.password) : null];

    for (const [key, column] of Object.entries(BOOLEAN_COLUMNS)) {
        columns.push(column);
        values.push((camera[key] ?? true) ? 1 : 0);
    }

    for (const [key, column] of Object.entries(COLUMNS)) {
        if (camera[key] === undefined) continue;
        columns.push(column);
        values.push(camera[key]);
    }

    getDatabase()
        .prepare(`INSERT INTO cameras (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
        .run(...values);

    return getCamera(camera.id);
}

export function updateCamera(id, patch) {
    const existing = getDatabase().prepare('SELECT * FROM cameras WHERE id = ?').get(id);
    if (!existing) return null;

    const assignments = ['updated_at = ?'];
    const values = [new Date().toISOString()];

    if (patch.password !== undefined) {
        assignments.push('password_secret = ?');
        values.push(patch.password ? encryptSecret(patch.password) : null);
    }

    for (const [key, column] of Object.entries(BOOLEAN_COLUMNS)) {
        if (patch[key] === undefined) continue;
        assignments.push(`${column} = ?`);
        values.push(patch[key] ? 1 : 0);
    }

    for (const [key, column] of Object.entries(COLUMNS)) {
        if (patch[key] === undefined) continue;
        assignments.push(`${column} = ?`);
        values.push(patch[key]);
    }

    values.push(id);
    getDatabase().prepare(`UPDATE cameras SET ${assignments.join(', ')} WHERE id = ?`).run(...values);

    return getCamera(id);
}

export function deleteCamera(id) {
    return getDatabase().prepare('DELETE FROM cameras WHERE id = ?').run(id).changes > 0;
}
