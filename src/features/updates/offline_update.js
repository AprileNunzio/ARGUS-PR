import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { projectRoot, ensureDir } from '../../platform/paths.js';
import { readPackageVersion } from '../../platform/version.js';
import { createLogger } from '../../kernel/logger.js';
import { AppError, ErrorCode } from '../../kernel/errors.js';
import { isReleaseTag, isNewer } from './semver.js';
import { Phase, readState, writeState } from './update_state.js';

const run = promisify(execFile);
const log = createLogger('offline-update');

const BUNDLE_PATTERN = /^argus-pr-(v\d+\.\d+\.\d+)\.(bundle|pack)$/i;
const MAX_BUNDLE_BYTES = 512 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 300000;

const SEARCH_ROOTS = Object.freeze([
    '/media',
    '/mnt',
    '/run/media',
    '/var/lib/argus-pr/updates'
]);

export const SOURCE_KINDS = Object.freeze(['local', 'url']);

function safeStat(target) {
    try {
        return fs.statSync(target);
    } catch {
        return null;
    }
}

function describeBundle(file) {
    const stats = safeStat(file);
    if (!stats || !stats.isFile()) return null;

    const match = BUNDLE_PATTERN.exec(path.basename(file));
    if (!match) return null;

    return {
        path: file,
        name: path.basename(file),
        tag: match[1],
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        newer: isNewer(match[1], readPackageVersion())
    };
}

function scanDirectory(directory, depth, found) {
    if (depth > 3 || found.length >= 40) return;

    const entries = (() => {
        try {
            return fs.readdirSync(directory, { withFileTypes: true });
        } catch {
            return [];
        }
    })();

    for (const entry of entries) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            scanDirectory(target, depth + 1, found);
            continue;
        }
        const bundle = describeBundle(target);
        if (bundle) found.push(bundle);
    }
}

export function scanForBundles(extraPaths = []) {
    const found = [];
    const roots = [...SEARCH_ROOTS, ...extraPaths.filter((entry) => typeof entry === 'string' && entry.length > 0)];

    for (const root of roots) {
        const stats = safeStat(root);
        if (!stats) continue;
        if (stats.isFile()) {
            const bundle = describeBundle(root);
            if (bundle) found.push(bundle);
            continue;
        }
        if (stats.isDirectory()) scanDirectory(root, 0, found);
    }

    const unique = [];
    for (const bundle of found) {
        if (!unique.some((entry) => entry.path === bundle.path)) unique.push(bundle);
    }

    return unique.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export function sha256Of(file) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(file));
    return hash.digest('hex');
}

function stagingDir(config) {
    return ensureDir(path.join(config.dataDir, 'updates'));
}

async function downloadHttp(url, destination) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' })
        .catch((error) => {
            throw new AppError(ErrorCode.DEPENDENCY, `Download non riuscito: ${error.message}`, { exposable: true });
        })
        .finally(() => clearTimeout(timer));

    if (!response.ok) {
        throw new AppError(ErrorCode.DEPENDENCY, `Il server ha risposto ${response.status}`, { exposable: true });
    }

    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_BUNDLE_BYTES) {
        throw new AppError(ErrorCode.VALIDATION, 'Pacchetto troppo grande', { exposable: true });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_BUNDLE_BYTES) {
        throw new AppError(ErrorCode.VALIDATION, 'Pacchetto troppo grande', { exposable: true });
    }

    fs.writeFileSync(destination, buffer, { mode: 0o640 });
    return destination;
}

async function downloadFtp(url, destination) {
    const result = await run('curl', ['--fail', '--silent', '--show-error', '--max-time', '300', '--output', destination, url], {
        windowsHide: true,
        shell: false,
        timeout: DOWNLOAD_TIMEOUT_MS + 5000,
        maxBuffer: 256 * 1024
    }).catch((error) => ({ failed: true, message: error.message }));

    if (result.failed) {
        throw new AppError(ErrorCode.DEPENDENCY, `Download FTP non riuscito: ${result.message}`, { exposable: true });
    }

    return destination;
}

export async function fetchRemoteBundle(config, rawUrl) {
    const parsed = (() => {
        try {
            return new URL(rawUrl);
        } catch {
            return null;
        }
    })();

    if (!parsed) throw new AppError(ErrorCode.VALIDATION, 'Indirizzo del pacchetto non valido');
    if (!['http:', 'https:', 'ftp:', 'ftps:'].includes(parsed.protocol)) {
        throw new AppError(ErrorCode.VALIDATION, 'Sono ammessi solo indirizzi http, https, ftp o ftps');
    }

    const filename = path.basename(parsed.pathname);
    if (!BUNDLE_PATTERN.test(filename)) {
        throw new AppError(ErrorCode.VALIDATION, 'Il nome del pacchetto deve essere argus-pr-vX.Y.Z.bundle');
    }

    const destination = path.join(stagingDir(config), filename);

    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        await downloadHttp(parsed.toString(), destination);
    } else {
        await downloadFtp(parsed.toString(), destination);
    }

    log.warn('offline bundle downloaded', { url: `${parsed.protocol}//${parsed.host}${parsed.pathname}`, destination });

    return describeBundle(destination);
}

async function git(args, timeout = 120000) {
    const result = await run('git', ['-C', projectRoot, ...args], {
        windowsHide: true,
        shell: false,
        timeout,
        maxBuffer: 4 * 1024 * 1024
    }).catch((error) => ({ failed: true, message: error.message, stderr: error.stderr ?? '' }));

    if (result.failed) {
        throw new AppError(ErrorCode.DEPENDENCY, `Comando git fallito: ${String(result.stderr || result.message).slice(0, 300)}`, { exposable: true });
    }

    return String(result.stdout ?? '').trim();
}

export async function verifyBundle(bundlePath) {
    const bundle = describeBundle(bundlePath);
    if (!bundle) {
        throw new AppError(ErrorCode.VALIDATION, 'Il file non e un pacchetto ARGUS-PR valido (argus-pr-vX.Y.Z.bundle)');
    }

    if (!isReleaseTag(bundle.tag)) {
        throw new AppError(ErrorCode.VALIDATION, 'Il pacchetto non dichiara un tag di release valido');
    }

    const listing = await git(['bundle', 'list-heads', bundle.path], 60000);
    const carriesTag = listing.split('\n').some((line) => line.trim().endsWith(`refs/tags/${bundle.tag}`));

    if (!carriesTag) {
        throw new AppError(ErrorCode.VALIDATION, `Il pacchetto non contiene il tag ${bundle.tag}`);
    }

    return {
        ...bundle,
        sha256: sha256Of(bundle.path),
        refs: listing.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 20)
    };
}

export async function applyOfflineBundle(config, bundlePath, expectedSha256 = null) {
    const verified = await verifyBundle(bundlePath);

    if (expectedSha256 && expectedSha256.toLowerCase() !== verified.sha256) {
        throw new AppError(ErrorCode.VALIDATION, 'Impronta SHA-256 del pacchetto diversa da quella dichiarata');
    }

    if (!isNewer(verified.tag, readPackageVersion())) {
        throw new AppError(ErrorCode.CONFLICT, `Il pacchetto contiene ${verified.tag}, non successiva alla v${readPackageVersion()} installata`);
    }

    const state = readState(config);
    if (state.phase === Phase.REQUESTED || state.phase === Phase.PENDING) {
        throw new AppError(ErrorCode.CONFLICT, 'Un aggiornamento e gia in corso');
    }

    await git(['fetch', '--force', verified.path, `refs/tags/${verified.tag}:refs/tags/${verified.tag}`]);

    const head = await git(['rev-parse', 'HEAD']).catch(() => null);

    const next = writeState(config, {
        phase: Phase.REQUESTED,
        targetRef: verified.tag,
        previousRef: head,
        previousVersion: readPackageVersion(),
        attempts: 0,
        requestedAt: new Date().toISOString(),
        appliedAt: null,
        message: `Aggiornamento offline da ${verified.name}`
    });

    log.warn('offline update staged', { target: verified.tag, source: verified.name, sha256: verified.sha256 });

    return { state: next, bundle: verified };
}
