import crypto from 'node:crypto';
import { Permission } from '../../security/rbac.js';
import { requireId, requireString, requireBool, requireEnum, optionalString } from '../../security/guards.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { validationError, notFound } from '../../kernel/errors.js';
import {
    getStorageOverview,
    testMountPath,
    benchmarkPath,
    mountNetworkShare,
    assignCameraPool
} from './storage_service.js';
import {
    listStoragePools,
    getStoragePool,
    insertStoragePool,
    updateStoragePool,
    deleteStoragePool
} from './storage_repository.js';

const RETENTION_POLICIES = ['fifo', 'block'];
const SMB_VERSIONS = ['1.0', '2.0', '2.1', '3.0', '3.1.1'];
const MOUNT_OPTION_PATTERN = /^[A-Za-z0-9_.,=:/+-]{0,200}$/;

function boundedInteger(value, field, min, max, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isInteger(parsed)) throw validationError(`${field} deve essere un numero intero`);
    if (parsed < min || parsed > max) throw validationError(`${field} deve essere compreso fra ${min} e ${max}`);
    return parsed;
}

function boundedBytes(value, field, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) throw validationError(`${field} non valido`);
    return Math.round(parsed);
}

function optionalMountOptions(value) {
    const clean = optionalString(value, 'Opzioni di mount', { max: 200 });
    if (clean === null) return null;
    if (!MOUNT_OPTION_PATTERN.test(clean)) throw validationError('Opzioni di mount non valide');
    return clean;
}

function optionalSmbVersion(value) {
    if (value === undefined || value === null || value === '') return null;
    return requireEnum(value, 'Versione protocollo SMB', SMB_VERSIONS);
}

function policyFields(body, current = {}) {
    return {
        maxBytes: boundedBytes(body.maxBytes, 'Quota massima', current.maxBytes ?? 0),
        minFreeBytes: boundedBytes(body.minFreeBytes, 'Spazio minimo libero', current.minFreeBytes ?? 5368709120),
        retentionPolicy: body.retentionPolicy === undefined
            ? (current.retentionPolicy ?? 'fifo')
            : requireEnum(body.retentionPolicy, 'Politica di ritenzione', RETENTION_POLICIES),
        retentionDays: boundedInteger(body.retentionDays, 'Giorni di ritenzione', 1, 3650, current.retentionDays ?? 30),
        alarmPercent: boundedInteger(body.alarmPercent, 'Soglia di allarme', 1, 90, current.alarmPercent ?? 10),
        reconnectSeconds: boundedInteger(body.reconnectSeconds, 'Timeout di riconnessione', 5, 600, current.reconnectSeconds ?? 30),
        smbVersion: body.smbVersion === undefined ? (current.smbVersion ?? null) : optionalSmbVersion(body.smbVersion),
        mountOptions: body.mountOptions === undefined ? (current.mountOptions ?? null) : optionalMountOptions(body.mountOptions)
    };
}

function routeCameras(poolId, cameraIds) {
    if (!Array.isArray(cameraIds)) return [];
    const applied = [];
    for (const raw of cameraIds.slice(0, 128)) {
        const cameraId = requireId(raw, 'Camera id');
        assignCameraPool(cameraId, poolId);
        applied.push(cameraId);
    }
    return applied;
}

export function registerStorageRoutes(router) {
    router.get('/api/storage/overview', async (ctx) => ({
        body: getStorageOverview(ctx.config)
    }), { permission: Permission.LIVE_VIEW });

    router.get('/api/storage/pools', async () => ({
        body: { pools: listStoragePools() }
    }), { permission: Permission.LIVE_VIEW });

    router.post('/api/storage/pools', async (ctx) => {
        const cleanName = requireString(ctx.body.name, 'Nome storage pool', { max: 80 });
        const cleanPath = requireString(ctx.body.path, 'Percorso destinazione', { max: 300 });
        const kind = ctx.body.kind === undefined ? 'local' : requireEnum(ctx.body.kind, 'Tipo storage', ['local', 'nas']);

        const test = testMountPath(cleanPath);
        if (!test.success) {
            throw validationError(`Percorso di destinazione non accessibile o non scrivibile: ${test.error}`);
        }

        const pool = insertStoragePool({
            id: crypto.randomUUID(),
            name: cleanName,
            kind,
            path: test.path,
            isDefault: ctx.body.isDefault === true,
            networkHost: optionalString(ctx.body.networkHost, 'Host di rete', { max: 255 }),
            networkShare: optionalString(ctx.body.networkShare, 'Share di rete', { max: 255 }),
            networkProto: optionalString(ctx.body.networkProto, 'Protocollo', { max: 16 }),
            username: optionalString(ctx.body.username, 'Nome utente', { max: 120 }),
            password: optionalString(ctx.body.password, 'Password', { max: 200 }),
            status: 'online',
            ...policyFields(ctx.body)
        });

        const routed = routeCameras(pool.id, ctx.body.cameraIds);

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: pool.id,
            remoteAddr: ctx.address,
            detail: { action: 'storage_pool_created', name: pool.name, path: pool.path, cameras: routed.length }
        });

        return { status: 201, body: { pool, routedCameras: routed } };
    }, { permission: Permission.STORAGE_MANAGE });

    router.put('/api/storage/pools/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'Storage pool id');
        const existing = getStoragePool(id);
        if (!existing) throw notFound('Storage pool');

        const patch = policyFields(ctx.body, existing);
        if (ctx.body.name !== undefined) patch.name = requireString(ctx.body.name, 'Nome', { max: 80 });
        if (ctx.body.path !== undefined) {
            const cleanPath = requireString(ctx.body.path, 'Percorso', { max: 300 });
            const test = testMountPath(cleanPath);
            if (!test.success) throw validationError(`Percorso non valido: ${test.error}`);
            patch.path = test.path;
        }
        if (ctx.body.isDefault !== undefined) patch.isDefault = requireBool(ctx.body.isDefault);
        if (ctx.body.status !== undefined) patch.status = requireEnum(ctx.body.status, 'Stato', ['online', 'offline', 'degraded']);
        if (ctx.body.password !== undefined) patch.password = optionalString(ctx.body.password, 'Password', { max: 200 });

        const updated = updateStoragePool(id, patch);
        const routed = routeCameras(id, ctx.body.cameraIds);

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: id,
            remoteAddr: ctx.address,
            detail: { action: 'storage_pool_updated', id, cameras: routed.length }
        });

        return { body: { pool: updated, routedCameras: routed } };
    }, { permission: Permission.STORAGE_MANAGE });

    router.delete('/api/storage/pools/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'Storage pool id');
        const success = deleteStoragePool(id);
        if (!success) throw notFound('Storage pool');

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: id,
            remoteAddr: ctx.address,
            detail: { action: 'storage_pool_deleted', id }
        });

        return { body: { success: true } };
    }, { permission: Permission.STORAGE_MANAGE });

    router.post('/api/storage/test-path', async (ctx) => {
        const targetPath = requireString(ctx.body.path, 'Percorso da verificare', { max: 300 });
        return { body: testMountPath(targetPath) };
    }, { permission: Permission.STORAGE_MANAGE });

    router.post('/api/storage/benchmark', async (ctx) => {
        const targetPath = requireString(ctx.body.path, 'Percorso da misurare', { max: 300 });
        const megabytes = boundedInteger(ctx.body.megabytes, 'Dimensione del test', 8, 256, 32);
        return { body: benchmarkPath(targetPath, megabytes) };
    }, {
        permission: Permission.STORAGE_MANAGE,
        rateLimit: { limit: 12, windowMs: 10 * 60 * 1000 }
    });

    router.post('/api/storage/nas/mount', async (ctx) => ({
        body: mountNetworkShare({
            proto: ctx.body.proto,
            host: ctx.body.host,
            share: ctx.body.share,
            mountpoint: ctx.body.mountpoint,
            username: optionalString(ctx.body.username, 'Nome utente', { max: 120 }),
            password: optionalString(ctx.body.password, 'Password', { max: 200 }),
            smbVersion: optionalSmbVersion(ctx.body.smbVersion),
            mountOptions: optionalMountOptions(ctx.body.mountOptions),
            reconnectSeconds: boundedInteger(ctx.body.reconnectSeconds, 'Timeout di riconnessione', 5, 600, 30)
        })
    }), { permission: Permission.STORAGE_MANAGE });

    router.put('/api/storage/camera-assignment', async (ctx) => {
        const cleanCameraId = requireId(ctx.body.cameraId, 'Camera id');
        const updatedCamera = assignCameraPool(cleanCameraId, ctx.body.poolId);

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: cleanCameraId,
            remoteAddr: ctx.address,
            detail: { action: 'camera_storage_routed', cameraId: cleanCameraId, poolId: ctx.body.poolId }
        });

        return { body: { camera: updatedCamera } };
    }, { permission: Permission.STORAGE_MANAGE });
}
