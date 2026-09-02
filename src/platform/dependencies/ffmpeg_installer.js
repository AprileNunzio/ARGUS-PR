import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { projectRoot } from '../paths.js';
import { downloadToFile, fetchText } from './fetch_file.js';
import { extractArchive, findBinary } from './extract.js';
import { FFMPEG_RELEASE, assetUrl, checksumUrl, selectAsset, isDownloadSupported, targetKey } from './catalog.js';
import { AppError, ErrorCode } from '../../kernel/errors.js';
import { createLogger } from '../../kernel/logger.js';
import { publish, Topic } from '../../kernel/event_bus.js';

const log = createLogger('ffmpeg-install');

let running = false;

function vendorDir() {
    return path.join(projectRoot, 'vendor', 'ffmpeg');
}

function report(stage, detail) {
    publish(Topic.DEPENDENCY_PROGRESS, { dependency: 'ffmpeg', stage, ...detail });
}

function moveBinary(source, targetDir, name) {
    const suffix = process.platform === 'win32' ? '.exe' : '';
    const destination = path.join(targetDir, `${name}${suffix}`);

    fs.copyFileSync(source, destination);
    if (process.platform !== 'win32') fs.chmodSync(destination, 0o755);

    return destination;
}

export function installationSupported() {
    return isDownloadSupported();
}

export async function installFfmpeg() {
    if (running) {
        throw new AppError(ErrorCode.CONFLICT, 'An installation is already running');
    }

    if (!isDownloadSupported()) {
        throw new AppError(
            ErrorCode.DEPENDENCY,
            `Automatic installation is not available for ${targetKey()}. Install ffmpeg with your package manager and set ARGUS_FFMPEG_PATH.`
        );
    }

    running = true;

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-ffmpeg-'));

    const cleanup = () => {
        running = false;
        fs.rmSync(workDir, { recursive: true, force: true });
    };

    const outcome = await (async () => {
        report('checksum', { message: 'Recupero della lista di controllo' });

        const checksumText = await fetchText(checksumUrl());
        const asset = selectAsset(checksumText);

        if (!asset) {
            throw new AppError(
                ErrorCode.DEPENDENCY,
                `Release ${FFMPEG_RELEASE.tag} does not publish a build for ${targetKey()}`
            );
        }

        const { name, sha256: expected } = asset;
        const url = assetUrl(name);
        const archive = path.join(workDir, name);

        report('download', { message: 'Scaricamento in corso', url, received: 0, total: null });

        const result = await downloadToFile(url, archive, {
            onProgress: (progress) => report('download', { message: 'Scaricamento in corso', ...progress })
        });

        if (result.sha256 !== expected) {
            throw new AppError(
                ErrorCode.DEPENDENCY,
                'Checksum mismatch: the downloaded file does not match the published hash. Installation aborted.',
                { details: { expected, actual: result.sha256 } }
            );
        }

        report('extract', { message: 'Estrazione dell\'archivio' });

        const extracted = path.join(workDir, 'unpacked');
        await extractArchive(archive, extracted);

        const ffmpegBinary = findBinary(extracted, 'ffmpeg');
        const ffprobeBinary = findBinary(extracted, 'ffprobe');

        if (!ffmpegBinary || !ffprobeBinary) {
            throw new AppError(ErrorCode.DEPENDENCY, 'The archive did not contain ffmpeg and ffprobe');
        }

        report('install', { message: 'Installazione dei binari' });

        const target = vendorDir();
        fs.mkdirSync(target, { recursive: true });

        return {
            ffmpeg: moveBinary(ffmpegBinary, target, 'ffmpeg'),
            ffprobe: moveBinary(ffprobeBinary, target, 'ffprobe'),
            sha256: result.sha256,
            bytes: result.bytes,
            release: FFMPEG_RELEASE.tag
        };
    })().catch((error) => error);

    cleanup();

    if (outcome instanceof Error) {
        log.error('installation failed', { message: outcome.message });
        report('failed', { message: outcome.message });
        throw outcome;
    }

    log.warn('ffmpeg installed', { path: outcome.ffmpeg, release: outcome.release, sha256: outcome.sha256 });
    report('done', { message: 'Installazione completata', path: outcome.ffmpeg });

    return outcome;
}
