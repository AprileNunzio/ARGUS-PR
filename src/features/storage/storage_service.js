import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
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
            assignedCameras,
            alarm: freeSpaceAlarm(pool, stats)
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

function freeSpaceAlarm(pool, stats) {
    if (!stats || stats.totalBytes <= 0) return { triggered: false, reason: 'unknown' };

    const threshold = Number.isInteger(pool.alarmPercent) ? pool.alarmPercent : 10;
    const freePercent = Math.round((stats.freeBytes / stats.totalBytes) * 1000) / 10;

    if (freePercent <= threshold) {
        return { triggered: true, reason: 'free-space', freePercent, threshold };
    }

    if (pool.maxBytes > 0 && stats.usedBytes >= pool.maxBytes) {
        return { triggered: true, reason: 'quota', freePercent, threshold };
    }

    return { triggered: false, freePercent, threshold };
}

export function benchmarkPath(targetPath, megabytes) {
    const resolved = path.resolve(targetPath);
    const size = Math.min(Math.max(Number(megabytes) || 32, 8), 256);
    const probe = path.join(resolved, `.argus-benchmark-${crypto.randomBytes(6).toString('hex')}`);
    const block = crypto.randomBytes(1024 * 1024);

    try {
        ensureDir(resolved);

        const openedAt = process.hrtime.bigint();
        const handle = fs.openSync(probe, 'w');
        const latencyMs = Number(process.hrtime.bigint() - openedAt) / 1e6;

        const startedAt = process.hrtime.bigint();
        for (let index = 0; index < size; index += 1) fs.writeSync(handle, block);
        fs.fsyncSync(handle);
        fs.closeSync(handle);
        const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

        const readStartedAt = process.hrtime.bigint();
        fs.readFileSync(probe);
        const readElapsedMs = Number(process.hrtime.bigint() - readStartedAt) / 1e6;

        fs.unlinkSync(probe);

        return {
            success: true,
            path: resolved,
            megabytes: size,
            writeMbPerSecond: Math.round((size / (elapsedMs / 1000)) * 10) / 10,
            readMbPerSecond: Math.round((size / (readElapsedMs / 1000)) * 10) / 10,
            openLatencyMs: Math.round(latencyMs * 100) / 100,
            stats: diskStats(resolved)
        };
    } catch (err) {
        try {
            fs.unlinkSync(probe);
        } catch {
            return { success: false, path: resolved, error: err.message };
        }
        return { success: false, path: resolved, error: err.message };
    }
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

const SMB_VERSIONS = new Set(['1.0', '2.0', '2.1', '3.0', '3.1.1']);
const MOUNT_OPTION_PATTERN = /^[A-Za-z0-9_.,=:/+-]{0,200}$/;

function buildMountOptions(params) {
    const options = [];

    if (params.proto === 'cifs' || params.proto === 'smb') {
        options.push(params.username ? `username=${params.username}` : 'guest');
        if (params.username) options.push(`password=${params.password ?? ''}`);
        options.push('iocharset=utf8');
        if (SMB_VERSIONS.has(String(params.smbVersion ?? ''))) options.push(`vers=${params.smbVersion}`);
    }

    const reconnect = Number.parseInt(params.reconnectSeconds, 10);
    if (Number.isInteger(reconnect) && reconnect > 0) options.push(`retrans=1,timeo=${Math.min(reconnect, 600) * 10}`);

    const extra = String(params.mountOptions ?? '').trim();
    if (extra.length > 0) {
        if (!MOUNT_OPTION_PATTERN.test(extra)) throw validationError('Opzioni di mount non valide');
        options.push(extra);
    }

    return options.join(',');
}

export function mountNetworkShare(params) {
    const { proto, host, share, mountpoint } = params;
    if (!host || !share || !mountpoint) {
        throw validationError('Host, share e mountpoint sono obbligatori');
    }

    const resolvedMount = path.resolve(mountpoint);
    ensureDir(resolvedMount);

    if (process.platform === 'linux') {
        const isCifs = proto === 'cifs' || proto === 'smb';
        const fstype = isCifs ? 'cifs' : 'nfs';
        const source = isCifs ? `//${host}/${String(share).replace(/^\//, '')}` : `${host}:${share}`;
        const options = buildMountOptions(params);
        const args = ['-t', fstype, source, resolvedMount];
        if (options.length > 0) args.push('-o', options);

        try {
            execFileSync('mount', args, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000, shell: false });
            return { success: true, mountpoint: resolvedMount, fstype, stats: diskStats(resolvedMount) };
        } catch (err) {
            throw validationError(`Impossibile montare la share di rete: ${err.message}`);
        }
    }

    if (process.platform === 'win32') {
        const netPath = `\\\\${host}\\${String(share).replace(/^\\/, '')}`;
        const test = testMountPath(netPath);
        if (test.success) {
            return { success: true, mountpoint: netPath, fstype: 'smb', stats: test.stats };
        }
        throw validationError(`Impossibile raggiungere la share Windows: ${test.error}`);
    }

    return { success: true, mountpoint: resolvedMount, fstype: 'local', stats: diskStats(resolvedMount) };
}

export function assignCameraPool(cameraId, poolId) {
    if (poolId && poolId !== 'default') {
        const pool = getStoragePool(poolId);
        if (!pool) throw validationError('Storage pool specificato non trovato');
    }
    const updateId = poolId === 'default' || !poolId ? null : poolId;
    return updateCamera(cameraId, { storagePoolId: updateId });
}
