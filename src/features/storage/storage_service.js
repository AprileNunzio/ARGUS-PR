import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { detectSystemStorage, diskStats } from '../../platform/storage_detect.js';
import { listStoragePools, getStoragePool, insertStoragePool, updateStoragePool, deleteStoragePool } from './storage_repository.js';
import { listCameras, updateCamera } from '../cameras/camera_repository.js';
import { ensureDir } from '../../platform/paths.js';
import { validationError } from '../../kernel/errors.js';

export function getStorageOverview(config) {
    const detected = detectSystemStorage();
    const pools = listStoragePools();
    const cameras = listCameras();

    const poolsWithStats = pools.map((pool) => {
        const stats = diskStats(pool.path);
        const assignedCameras = cameras.filter((c) => c.storagePoolId === pool.id).map((c) => ({
            id: c.id,
            name: c.name
        }));
        return {
            ...pool,
            stats,
            assignedCameras
        };
    });

    const defaultPool = pools.find((p) => p.isDefault) || null;
    const defaultStats = diskStats(config.mediaDir);

    const unassignedCameras = cameras.filter((c) => !c.storagePoolId).map((c) => ({
        id: c.id,
        name: c.name
    }));

    return {
        detected,
        pools: poolsWithStats,
        defaultPool,
        defaultPath: config.mediaDir,
        defaultStats,
        unassignedCameras
    };
}

export function testMountPath(targetPath) {
    if (!targetPath || typeof targetPath !== 'string') {
        throw validationError('Percorso non valido');
    }
    const resolved = path.resolve(targetPath);
    try {
        ensureDir(resolved);
        const testFile = path.join(resolved, '.argus-mount-test');
        fs.writeFileSync(testFile, 'ok');
        fs.unlinkSync(testFile);
        const stats = diskStats(resolved);
        return { success: true, path: resolved, stats };
    } catch (err) {
        return { success: false, path: resolved, error: err.message };
    }
}

export function mountNetworkShare(params) {
    const { proto, host, share, mountpoint, username, password } = params;
    if (!host || !share || !mountpoint) {
        throw validationError('Host, share e mountpoint sono obbligatori');
    }

    const resolvedMount = path.resolve(mountpoint);
    ensureDir(resolvedMount);

    if (process.platform === 'linux') {
        const isCifs = proto === 'cifs' || proto === 'smb';
        let credOpts = '';
        if (isCifs) {
            credOpts = username ? `username=${username},password=${password || ''}` : 'guest';
        }

        const fstype = isCifs ? 'cifs' : 'nfs';
        const source = isCifs ? `//${host}/${share.replace(/^\//, '')}` : `${host}:${share}`;
        const cmd = isCifs
            ? `mount -t cifs "${source}" "${resolvedMount}" -o ${credOpts},iocharset=utf8`
            : `mount -t nfs "${source}" "${resolvedMount}"`;

        try {
            execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 });
            return { success: true, mountpoint: resolvedMount, stats: diskStats(resolvedMount) };
        } catch (err) {
            throw validationError(`Impossibile montare la share di rete: ${err.message}`);
        }
    }

    if (process.platform === 'win32') {
        const netPath = `\\\\${host}\\${share.replace(/^\\/, '')}`;
        const test = testMountPath(netPath);
        if (test.success) {
            return { success: true, mountpoint: netPath, stats: test.stats };
        }
        throw validationError(`Impossibile raggiungere la share Windows: ${test.error}`);
    }

    return { success: true, mountpoint: resolvedMount, stats: diskStats(resolvedMount) };
}

export function assignCameraPool(cameraId, poolId) {
    if (poolId && poolId !== 'default') {
        const pool = getStoragePool(poolId);
        if (!pool) throw validationError('Storage pool specificato non trovato');
    }
    const updateId = poolId === 'default' || !poolId ? null : poolId;
    return updateCamera(cameraId, { storagePoolId: updateId });
}
