import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { projectRoot } from '../../platform/paths.js';
import { readPackageVersion } from '../../platform/version.js';
import { createLogger } from '../../kernel/logger.js';
import { onShutdown } from '../../kernel/process_guard.js';
import { AppError, ErrorCode } from '../../kernel/errors.js';
import { fetchLatestRelease, repository } from './release_client.js';
import { isNewer, isReleaseTag } from './semver.js';
import { Phase, readState, writeState } from './update_state.js';

const run = promisify(execFile);
const log = createLogger('updates');

const HEALTHY_AFTER_MS = 90 * 1000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RESTART_EXIT_CODE = 75;

let cachedCheck = null;
let activeConfig = null;

export function isGitInstall() {
    return fs.existsSync(path.join(projectRoot, '.git'));
}

async function git(args) {
    const result = await run('git', ['-C', projectRoot, ...args], {
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

    const result = {
        currentVersion: current,
        latest: release,
        updateAvailable: isNewer(release.tag, current),
        checkedAt: new Date().toISOString()
    };

    cachedCheck = { at: Date.now(), result };
    return result;
}

export function updateStatus(config) {
    const state = readState(config);

    return {
        currentVersion: readPackageVersion(),
        phase: state.phase,
        targetRef: state.targetRef,
        previousVersion: state.previousVersion,
        attempts: state.attempts,
        requestedAt: state.requestedAt,
        appliedAt: state.appliedAt,
        message: state.message,
        supported: isGitInstall(),
        repository: repository.url,
        lastCheck: cachedCheck?.result ?? null
    };
}

export async function requestUpdate(config, ref) {
    if (!isGitInstall()) {
        throw new AppError(ErrorCode.CONFLICT, 'Aggiornamento automatico non disponibile: questa copia non e\' un clone git');
    }

    if (!isReleaseTag(ref)) {
        throw new AppError(ErrorCode.VALIDATION, 'Riferimento non valido: sono ammessi solo i tag di release (vX.Y.Z)');
    }

    if (!isNewer(ref, readPackageVersion())) {
        throw new AppError(ErrorCode.CONFLICT, 'La versione richiesta non e\' successiva a quella installata');
    }

    const state = readState(config);
    if (state.phase === Phase.REQUESTED || state.phase === Phase.PENDING) {
        throw new AppError(ErrorCode.CONFLICT, 'Un aggiornamento e\' gia\' in corso');
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
        message: null
    });

    log.warn('update requested', { target: ref, from: next.previousVersion });

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
    setTimeout(() => process.exit(RESTART_EXIT_CODE), 400).unref();
}

function markHealthy(config) {
    const state = readState(config);
    if (state.phase !== Phase.PENDING) return;

    writeState(config, {
        phase: Phase.HEALTHY,
        attempts: 0,
        appliedAt: new Date().toISOString(),
        message: `Aggiornato a ${readPackageVersion()}`
    });

    log.info('update confirmed healthy', { version: readPackageVersion() });
}

export function installUpdateWatchdog(config) {
    activeConfig = config;

    const state = readState(config);
    if (state.phase === Phase.PENDING) {
        log.warn('running a freshly applied version, waiting for the health window', {
            version: readPackageVersion(),
            attempts: state.attempts
        });
    }

    const healthTimer = setTimeout(() => markHealthy(config), HEALTHY_AFTER_MS);
    healthTimer.unref();

    const checkTimer = setInterval(() => {
        checkForUpdate({ force: true })
            .then((result) => {
                if (result.updateAvailable) log.warn('update available', { latest: result.latest.tag });
            })
            .catch((error) => log.debug('update check failed', { message: error.message }));
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
