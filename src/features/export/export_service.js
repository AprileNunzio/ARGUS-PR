import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getMediaTools } from '../../platform/media_tools.js';
import { getCamera } from '../cameras/camera_repository.js';
import { querySegments } from '../recording/segment_index.js';
import { cameraSegmentDir } from '../recording/segment_paths.js';
import { readPackageVersion } from '../../platform/version.js';
import { deriveKey } from '../../security/vault.js';
import { createLogger } from '../../kernel/logger.js';
import { AppError, ErrorCode, notFound, validationError } from '../../kernel/errors.js';
import { buildManifest, sealManifest, verifyManifest } from './custody.js';
import { ensureExportDir, exportDir, manifestPath, outputPath, sealPath, OUTPUT_NAME } from './export_paths.js';
import { insertExport, completeExport, failExport, getExport, countActiveExports } from './export_repository.js';

const run = promisify(execFile);
const log = createLogger('export');

const KEY_PURPOSE = 'argus.export.custody.v1';
const MAX_RANGE_MS = 6 * 3600 * 1000;
const MAX_SEGMENTS = 720;
const MAX_CONCURRENT = 2;
const FFMPEG_TIMEOUT_MS = 10 * 60 * 1000;

function hashFile(target) {
    const hash = crypto.createHash('sha256');
    const stream = fs.readFileSync(target);
    hash.update(stream);
    return hash.digest('hex');
}

function custodyKey() {
    return deriveKey(KEY_PURPOSE);
}

export function planExport(config, cameraId, fromMs, toMs) {
    const camera = getCamera(cameraId);
    if (!camera) throw notFound('Camera');

    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
        throw validationError('Intervallo non valido');
    }

    if (toMs - fromMs > MAX_RANGE_MS) {
        throw validationError('L\'intervallo non puo\' superare le sei ore');
    }

    const segments = querySegments(config, cameraId, fromMs, toMs);

    if (segments.length === 0) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Nessuna registrazione nell\'intervallo richiesto');
    }

    if (segments.length > MAX_SEGMENTS) {
        throw validationError(`L'intervallo contiene ${segments.length} segmenti: riducilo`);
    }

    return { camera, segments };
}

function writeConcatList(dir, root, segments) {
    const list = path.join(dir, 'sources.txt');
    const lines = segments.map((segment) => {
        const absolute = path.join(root, segment.file);
        return `file '${absolute.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`;
    });

    fs.writeFileSync(list, `${lines.join('\n')}\n`, 'utf8');
    return list;
}

async function concatenate(listFile, destination) {
    const tools = getMediaTools();

    const args = [
        '-hide_banner', '-loglevel', 'error', '-nostdin',
        '-f', 'concat', '-safe', '0',
        '-i', listFile,
        '-c', 'copy',
        '-movflags', '+faststart',
        '-y', destination
    ];

    await run(tools.ffmpeg.path, args, {
        windowsHide: true,
        shell: false,
        timeout: FFMPEG_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024
    }).catch((error) => {
        throw new AppError(ErrorCode.MEDIA, 'Concatenazione dei segmenti fallita', {
            cause: error,
            details: { stderr: String(error.stderr ?? '').slice(0, 300) },
            exposable: false
        });
    });
}

function verifySources(root, segments) {
    return segments.map((segment) => {
        const absolute = path.join(root, segment.file);

        const verifiedSha256 = (() => {
            try {
                return hashFile(absolute);
            } catch {
                return null;
            }
        })();

        return { ...segment, verifiedSha256 };
    });
}

export async function createExport(config, request) {
    if (countActiveExports() >= MAX_CONCURRENT) {
        throw new AppError(ErrorCode.CONFLICT, 'Ci sono gia\' due esportazioni in corso: attendi che finiscano');
    }

    const { camera, segments } = planExport(config, request.cameraId, request.fromMs, request.toMs);

    const id = crypto.randomUUID();
    const requestedAt = new Date().toISOString();

    insertExport({
        id,
        cameraId: camera.id,
        cameraName: camera.name,
        fromMs: request.fromMs,
        toMs: request.toMs,
        reason: request.reason ?? null,
        segmentCount: segments.length,
        actorId: request.actorId,
        actorName: request.actorName,
        remoteAddr: request.address,
        requestedAt
    });

    log.info('export started', { id, camera: camera.id, segments: segments.length });

    const finish = async () => {
        const dir = ensureExportDir(config, id);
        const root = cameraSegmentDir(config, camera.id);

        const verified = verifySources(root, segments);
        const usable = verified.filter((segment) => segment.verifiedSha256 !== null);

        if (usable.length === 0) {
            throw new AppError(ErrorCode.STORAGE, 'Nessun segmento leggibile sul disco');
        }

        const listFile = writeConcatList(dir, root, usable);
        const destination = outputPath(config, id);

        await concatenate(listFile, destination);
        fs.rmSync(listFile, { force: true });

        const stat = fs.statSync(destination);

        const manifest = buildManifest({
            exportId: id,
            product: `ARGUS-PR ${readPackageVersion()}`,
            cameraId: camera.id,
            cameraName: camera.name,
            fromMs: request.fromMs,
            toMs: request.toMs,
            actorId: request.actorId,
            actorName: request.actorName,
            address: request.address,
            requestedAt,
            completedAt: new Date().toISOString(),
            reason: request.reason ?? null,
            outputName: OUTPUT_NAME,
            outputBytes: stat.size,
            outputSha256: hashFile(destination),
            sources: usable
        });

        const seal = sealManifest(manifest, custodyKey());

        fs.writeFileSync(manifestPath(config, id), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
        fs.writeFileSync(sealPath(config, id), `${seal}\n`, 'utf8');

        return completeExport(id, {
            outputBytes: stat.size,
            outputSha256: manifest.output.sha256,
            chainRoot: manifest.chainRoot,
            manifestSha256: manifest.manifestSha256,
            sourcesIntact: manifest.sourcesIntact ? 1 : 0,
            completedAt: manifest.completedAt
        });
    };

    return finish().catch((error) => {
        log.error('export failed', { id, message: error.message });
        fs.rmSync(exportDir(config, id), { recursive: true, force: true });
        failExport(id, error.message);
        throw error;
    });
}

export function verifyExport(config, id) {
    const record = getExport(id);
    if (!record) throw notFound('Export');
    if (record.state !== 'ready') throw new AppError(ErrorCode.CONFLICT, 'Esportazione non completata');

    const manifest = JSON.parse(fs.readFileSync(manifestPath(config, id), 'utf8'));
    const seal = fs.readFileSync(sealPath(config, id), 'utf8').trim();

    const outcome = verifyManifest(manifest, seal, custodyKey());

    const target = outputPath(config, id);
    const actual = fs.existsSync(target) ? hashFile(target) : null;
    const fileMatches = actual === manifest.output.sha256;

    return {
        exportId: id,
        valid: outcome.valid && fileMatches,
        problems: fileMatches ? outcome.problems : [...outcome.problems, 'Il video non corrisponde all\'hash del manifesto'],
        manifest
    };
}

export function removeExport(config, id) {
    const record = getExport(id);
    if (!record) throw notFound('Export');

    fs.rmSync(exportDir(config, id), { recursive: true, force: true });
    return record;
}
