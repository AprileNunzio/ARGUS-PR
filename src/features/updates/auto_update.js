import { createLogger } from '../../kernel/logger.js';
import { readPackageVersion } from '../../platform/version.js';
import { isNewer } from './semver.js';
import { checkForUpdate, isGitInstall, requestUpdate, scheduleRestart } from './update_service.js';
import { Phase, readState, writeState, quarantine, isQuarantined } from './update_state.js';

const log = createLogger('auto-update');

export const Outcome = Object.freeze({
    DISABLED: 'disabled',
    UNSUPPORTED: 'unsupported',
    VALIDATING: 'validating',
    QUARANTINED: 'quarantined',
    THROTTLED: 'throttled',
    UP_TO_DATE: 'up-to-date',
    UNREACHABLE: 'unreachable',
    UPGRADING: 'upgrading'
});

function settleFailedAttempt(config) {
    const state = readState(config);

    if (state.phase !== Phase.ROLLED_BACK && state.phase !== Phase.FAILED) return state;

    if (state.targetRef && state.automatic) {
        quarantine(config, state.targetRef);
        log.error('version put in quarantine after a failed upgrade', {
            target: state.targetRef,
            phase: state.phase,
            reason: state.message
        });
    }

    return writeState(config, {
        phase: Phase.IDLE,
        targetRef: null,
        automatic: false,
        message: state.message
    });
}

function throttled(state, minIntervalMs) {
    if (!state.lastAutoAttemptAt) return false;

    const last = Date.parse(state.lastAutoAttemptAt);
    if (!Number.isFinite(last)) return false;

    return Date.now() - last < minIntervalMs;
}

export async function runAutomaticUpgrade(config, trigger = 'startup') {
    const state = settleFailedAttempt(config);

    if (!config.autoUpdate) return { outcome: Outcome.DISABLED };

    if (!isGitInstall()) {
        log.debug('automatic upgrade unavailable: this copy is not a git clone');
        return { outcome: Outcome.UNSUPPORTED };
    }

    if (state.phase === Phase.PENDING || state.phase === Phase.REQUESTED) {
        log.warn('upgrade in progress, waiting for the health window before checking again', {
            phase: state.phase,
            target: state.targetRef
        });
        return { outcome: Outcome.VALIDATING };
    }

    const minIntervalMs = config.autoUpdateMinIntervalMinutes * 60 * 1000;
    if (throttled(state, minIntervalMs)) {
        log.info('automatic upgrade postponed: too soon after the previous attempt', {
            lastAttempt: state.lastAutoAttemptAt
        });
        return { outcome: Outcome.THROTTLED };
    }

    const check = await checkForUpdate({ force: true }).catch((error) => {
        log.warn('cannot reach GitHub, starting the installed version', { message: error.message });
        return null;
    });

    if (!check) return { outcome: Outcome.UNREACHABLE };

    if (!check.updateAvailable || !isNewer(check.latest.tag, readPackageVersion())) {
        log.info('installed version is current', { version: readPackageVersion() });
        return { outcome: Outcome.UP_TO_DATE, version: readPackageVersion() };
    }

    if (isQuarantined(state, check.latest.tag)) {
        log.error('newest version is in quarantine after a previous failure, no automatic upgrade', {
            target: check.latest.tag
        });
        return { outcome: Outcome.QUARANTINED, target: check.latest.tag };
    }

    writeState(config, { lastAutoAttemptAt: new Date().toISOString() });

    const requested = await requestUpdate(config, check.latest.tag).catch((error) => {
        log.warn('automatic upgrade not requested', { message: error.message });
        return null;
    });

    if (!requested) return { outcome: Outcome.UP_TO_DATE, version: readPackageVersion() };

    writeState(config, { automatic: true });

    log.warn('applying an automatic upgrade', {
        trigger,
        from: readPackageVersion(),
        to: check.latest.tag
    });

    scheduleRestart();

    return { outcome: Outcome.UPGRADING, target: check.latest.tag };
}
