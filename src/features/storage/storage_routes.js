import crypto from 'node:crypto';
import { Permission } from '../../security/rbac.js';
import { requireId, requireString, requireBool, optionalString, optionalNumber } from '../../security/guards.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { validationError, notFound } from '../../kernel/errors.js';
import {
    getStorageOverview,
    testMountPath,
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

export function registerStorageRoutes(router) {
    router.get('/api/storage/overview', async (ctx) => ({
        body: getStorageOverview(ctx.config)
    }), { permission: Permission.LIVE_VIEW });

    router.get('/api/storage/pools', async () => ({
        body: { pools: listStoragePools() }
    }), { permission: Permission.LIVE_VIEW });

    router.post('/api/storage/pools', async (ctx) => {
        const { name, kind, path: poolPath, isDefault, maxBytes, minFreeBytes, networkHost, networkShare, networkProto, username, password } = ctx.body;
        const cleanName = requireString(name, 'Nome storage pool', { max: 80 });
        const cleanPath = requireString(poolPath, 'Percorso destinazione', { max: 300 });

        const test = testMountPath(cleanPath);
        if (!test.success) {
            throw validationError(`Percorso di destinazione non accessibile o non scrivibile: ${test.error}`);
        }

        const id = crypto.randomUUID();
        const pool = insertStoragePool({
            id,
            name: cleanName,
            kind: kind || 'local',
            path: test.path,
            isDefault: isDefault === true,
            maxBytes: optionalNumber(maxBytes, 'Quota massima (byte)') || 0,
            minFreeBytes: optionalNumber(minFreeBytes, 'Spazio libero minimo (byte)') || 5368709120,
            networkHost: optionalString(networkHost, 'Host di rete', { max: 255 }),
            networkShare: optionalString(networkShare, 'Share di rete', { max: 255 }),
            networkProto: optionalString(networkProto, 'Protocollo', { max: 16 }),
            username: optionalString(username, 'Nome utente', { max: 120 }),
            password: optionalString(password, 'Password', { max: 200 }),
            status: 'online'
        });

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: pool.id,
            remoteAddr: ctx.address,
            detail: { action: 'storage_pool_created', name: pool.name, path: pool.path }
        });

        return { status: 201, body: { pool } };
    }, { permission: Permission.STORAGE_MANAGE });

    router.put('/api/storage/pools/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'Storage pool id');
        const existing = getStoragePool(id);
        if (!existing) throw notFound('Storage pool');

        const patch = {};
        if (ctx.body.name !== undefined) patch.name = requireString(ctx.body.name, 'Nome', { max: 80 });
        if (ctx.body.path !== undefined) {
            const cleanPath = requireString(ctx.body.path, 'Percorso', { max: 300 });
            const test = testMountPath(cleanPath);
            if (!test.success) throw validationError(`Percorso non valido: ${test.error}`);
            patch.path = test.path;
        }
        if (ctx.body.isDefault !== undefined) patch.isDefault = requireBool(ctx.body.isDefault);
        if (ctx.body.maxBytes !== undefined) patch.maxBytes = Number(ctx.body.maxBytes) || 0;
        if (ctx.body.minFreeBytes !== undefined) patch.minFreeBytes = Number(ctx.body.minFreeBytes) || 5368709120;
        if (ctx.body.status !== undefined) patch.status = requireString(ctx.body.status, 'Stato', { max: 32 });

        const updated = updateStoragePool(id, patch);

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: id,
            remoteAddr: ctx.address,
            detail: { action: 'storage_pool_updated', id, patch }
        });

        return { body: { pool: updated } };
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

    router.post('/api/storage/nas/mount', async (ctx) => {
        const result = mountNetworkShare(ctx.body);
        return { body: result };
    }, { permission: Permission.STORAGE_MANAGE });

    router.put('/api/storage/camera-assignment', async (ctx) => {
        const { cameraId, poolId } = ctx.body;
        const cleanCameraId = requireId(cameraId, 'Camera id');
        const updatedCamera = assignCameraPool(cleanCameraId, poolId);

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: cleanCameraId,
            remoteAddr: ctx.address,
            detail: { action: 'camera_storage_routed', cameraId: cleanCameraId, poolId }
        });

        return { body: { camera: updatedCamera } };
    }, { permission: Permission.STORAGE_MANAGE });
}
