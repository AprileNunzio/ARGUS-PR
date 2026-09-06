import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { projectRoot } from '../../platform/paths.js';
import { readPackageVersion } from '../../platform/version.js';
import { createLogger } from '../../kernel/logger.js';
import { onShutdown } from '../../kernel/process_guard.js';
import { AppError, ErrorCode } from '../../kernel/errors.js';
import { fetchLatestRelease, fetchLatestTag, repository } from './release_client.js';
import { isNewer, isReleaseTag, compareVersions } from './semver.js';
import { Phase, readState, writeState, pardon, clearState } from './update_state.js';

const run = promisify(execFile);
const log = createLogger('updates');

const HEALTHY_AFTER_MS = 90 * 1000;
const MAX_BOOT_ATTEMPTS = 3;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RESTART_EXIT_CODE = 75;

let cachedCheck = null;
let activeConfig = null;

export function isGitInstall() {
    return fs.existsSync(path.join(projectRoot, '.git'));
}

export function isUpdateSupported() {
    return isGitInstall() || process.platform === 'win32';
}

async function git(args) {
    const result = await run('git', ['-C', projectRoot, '-c', `safe.directory=${projectRoot}`, ...args], {
        windowsHide: true,
        shell: false,
        timeout: 20000,
        maxBuffer: 1024 * 1024
    }).catch((error) => {
        throw new AppError(ErrorCode.DEPENDENCY, 'Comando git fallito', {
            cause: error,
            details: { command: args[0] },
            exposable: false
        });
    });

    return result.stdout.trim();
}

async function currentCommit() {
    return git(['rev-parse', 'HEAD']).catch(() => null);
}

export async function checkForUpdate({ force = false } = {}) {
    if (!force && cachedCheck && Date.now() - cachedCheck.at < 60 * 1000) return cachedCheck.result;

    const current = readPackageVersion();
    const release = await fetchLatestRelease();
    const tag = await fetchLatestTag().catch(() => null);

    const publishedIsNewer = tag && isNewer(tag.tag, release.tag);
    const latest = publishedIsNewer
        ? { ...release, tag: tag.tag, name: tag.tag, url: tag.url, notes: '', publishedAt: null, taggedOnly: true }
        : { ...release, taggedOnly: false };

    const comparison = compareVersions(latest.tag, current);

    const result = {
        currentVersion: current,
        latest,
        latestRelease: release,
        latestTag: tag,
        updateAvailable: comparison > 0,
        aligned: comparison === 0,
        ahead: comparison < 0,
        checkedAt: new Date().toISOString()
    };

    cachedCheck = { at: Date.now(), result };
    return result;
}

export function clearUpdateCache() {
    cachedCheck = null;
}

export function watchdogSnapshot(config) {
    const state = readState(config);
    const settled = state.phase === Phase.IDLE || state.phase === Phase.HEALTHY;

    return {
        quarantined: state.quarantine.length > 0,
        quarantineList: state.quarantine,
        attempts: settled ? 0 : state.attempts,
        maxAttempts: MAX_BOOT_ATTEMPTS,
        armed: isUpdateSupported(),
        settled
    };
}

export function resetWatchdog(config) {
    const state = readState(config);

    if (state.phase === Phase.REQUESTED || state.phase === Phase.PENDING) {
        throw new AppError(ErrorCode.CONFLICT, 'Un aggiornamento e in corso: attendi l\'esito prima di azzerare il watchdog');
    }

    clearState(config);
    log.warn('watchdog state cleared by the operator', { version: readPackageVersion() });

    return watchdogSnapshot(config);
}

export function updateStatus(config) {
    const state = readState(config);

    return {
        currentVersion: readPackageVersion(),
        watchdog: watchdogSnapshot(config),
        phase: state.phase,
        targetRef: state.targetRef,
        previousVersion: state.previousVersion,
        attempts: state.attempts,
        requestedAt: state.requestedAt,
        appliedAt: state.appliedAt,
        message: state.message,
        automatic: state.automatic,
        quarantine: state.quarantine,
        lastAutoAttemptAt: state.lastAutoAttemptAt,
        supported: isUpdateSupported(),
        repository: repository.url,
        lastCheck: cachedCheck?.result ?? null
    };
}

export async function requestUpdate(config, ref, { force = false } = {}) {
    if (!isUpdateSupported()) {
        throw new AppError(ErrorCode.CONFLICT, 'Aggiornamento automatico non disponibile su questa piattaforma');
    }

    if (!isReleaseTag(ref)) {
        throw new AppError(ErrorCode.VALIDATION, 'Riferimento non valido: sono ammessi solo i tag di release (vX.Y.Z)');
    }

    if (!force && !isNewer(ref, readPackageVersion())) {
        throw new AppError(ErrorCode.CONFLICT, 'La versione richiesta non e\' successiva a quella installata');
    }

    const state = readState(config);
    if (!force && (state.phase === Phase.REQUESTED || state.phase === Phase.PENDING)) {
        throw new AppError(ErrorCode.CONFLICT, 'Un aggiornamento e\' gia\' in corso');
    }

    if (process.platform === 'win32') {
        const { applyWindowsUpdate } = await import('./windows_updater.js');
        return applyWindowsUpdate(config, ref, { force });
    }

    const head = await currentCommit();

    const next = writeState(config, {
        phase: Phase.REQUESTED,
        targetRef: ref,
        previousRef: head,
        previousVersion: readPackageVersion(),
        attempts: 0,
        requestedAt: new Date().toISOString(),
        appliedAt: null,
        message: force ? 'Aggiornamento forzato dall operatore' : null
    });

    log.warn('update requested', { target: ref, from: next.previousVersion, force });

    return next;
}

export function cancelUpdate(config) {
    const state = readState(config);
    if (state.phase !== Phase.REQUESTED) {
        throw new AppError(ErrorCode.CONFLICT, 'Nessun aggiornamento in attesa da annullare');
    }
    return writeState(config, { phase: Phase.IDLE, targetRef: null, message: 'Annullato dall\'operatore' });
}

export function scheduleRestart() {
    log.warn('restarting to apply update', { exitCode: RESTART_EXIT_CODE });
    if (process.platform === 'win32' && !process.env.ARGUS_SERVICE && process.env.NODE_ENV !== 'test') {
        try {
            const entry = path.join(projectRoot, 'bin', 'argus.js');
            const child = spawn(process.execPath, [entry, 'serve'], {
                cwd: projectRoot,
                detached: true,
                stdio: 'ignore',
                windowsHide: true,
                shell: false
            });
            child.unref();
        } catch {}
    }
    setTimeout(() => process.exit(RESTART_EXIT_CODE), 400).unref();
}

function markHealthy(config) {
    const state = readState(config);
    if (state.phase !== Phase.PENDING) return;

    if (state.targetRef) pardon(config, state.targetRef);

    writeState(config, {
        phase: Phase.HEALTHY,
        attempts: 0,
        automatic: false,
        appliedAt: new Date().toISOString(),
        message: `Aggiornato a ${readPackageVersion()}`
    });

    log.info('update confirmed healthy', { version: readPackageVersion() });
}

let periodicHook = null;

export function onPeriodicCheck(handler) {
    periodicHook = handler;
}

async function periodicCheck(config) {
    const result = await checkForUpdate({ force: true }).catch((error) => {
        log.debug('update check failed', { message: error.message });
        return null;
    });

    if (!result || !result.updateAvailable) return;

    log.warn('update available', { latest: result.latest.tag });

    if (config.autoUpdate && periodicHook) await periodicHook(config);
}

export function installUpdateWatchdog(config) {
    activeConfig = config;

    const state = readState(config);

    if (state.phase !== Phase.PENDING && state.phase !== Phase.REQUESTED && state.attempts > 0) {
        writeState(config, { attempts: 0 });
        log.info('stale boot attempts cleared', { version: readPackageVersion() });
    }

    if (state.phase === Phase.HEALTHY && state.targetRef) {
        pardon(config, state.targetRef);
    }

    if (state.phase === Phase.PENDING) {
        log.warn('running a freshly applied version, waiting for the health window', {
            version: readPackageVersion(),
            attempts: state.attempts
        });
    }

    const healthTimer = setTimeout(() => markHealthy(config), HEALTHY_AFTER_MS);
    healthTimer.unref();

    const checkTimer = setInterval(() => {
        void periodicCheck(config);
    }, CHECK_INTERVAL_MS);
    checkTimer.unref();

    onShutdown('updates', () => {
        clearTimeout(healthTimer);
        clearInterval(checkTimer);
    });
}

export function currentConfig() {
    return activeConfig;
}
