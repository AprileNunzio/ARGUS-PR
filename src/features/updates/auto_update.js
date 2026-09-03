import { createLogger } from '../../kernel/logger.js';
import { readPackageVersion } from '../../platform/version.js';
import { publish, Topic } from '../../kernel/event_bus.js';
import { readSetting } from '../settings/settings_service.js';
import { RestartPolicy } from '../settings/settings_schema.js';
import { insideWindow, nextOpening } from './maintenance_window.js';
import { isNewer } from './semver.js';
import { checkForUpdate, isGitInstall, isUpdateSupported, requestUpdate, scheduleRestart } from './update_service.js';
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
    AWAITING_APPROVAL: 'awaiting-approval',
    AWAITING_WINDOW: 'awaiting-window',
    UPGRADING: 'upgrading'
});

function policy() {
    return {
        autoCheck: readSetting('updates.autoCheck'),
        restart: readSetting('updates.restartPolicy'),
        minIntervalMinutes: readSetting('updates.minIntervalMinutes'),
        window: {
            days: readSetting('updates.windowDays'),
            start: readSetting('updates.windowStart'),
            end: readSetting('updates.windowEnd')
        }
    };
}

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

function throttled(state, minIntervalMinutes) {
    if (!state.lastAutoAttemptAt) return false;

    const last = Date.parse(state.lastAutoAttemptAt);
    if (!Number.isFinite(last)) return false;

    return Date.now() - last < minIntervalMinutes * 60 * 1000;
}

function awaitApproval(config, target, reason, opensAt) {
    const state = readState(config);

    if (state.phase !== Phase.AWAITING_APPROVAL || state.targetRef !== target) {
        log.warn('update ready, waiting for authorisation to restart', { target, reason });
        publish(Topic.UPDATE, { phase: Phase.AWAITING_APPROVAL, target, reason, opensAt });
    }

    writeState(config, {
        phase: Phase.AWAITING_APPROVAL,
        targetRef: target,
        automatic: true,
        message: reason
    });
}

async function applyNow(config, target, trigger) {
    writeState(config, { lastAutoAttemptAt: new Date().toISOString() });

    const requested = await requestUpdate(config, target).catch((error) => {
        log.warn('automatic upgrade not requested', { message: error.message });
        return null;
    });

    if (!requested) return { outcome: Outcome.UP_TO_DATE, version: readPackageVersion() };

    writeState(config, { automatic: true });

    log.warn('applying an automatic upgrade', { trigger, from: readPackageVersion(), to: target });
    scheduleRestart();

    return { outcome: Outcome.UPGRADING, target };
}

export async function runAutomaticUpgrade(config, trigger = 'startup', deps = {}) {
    const check = deps.check ?? checkForUpdate;
    const apply = deps.apply ?? applyNow;
    const supported = deps.isUpdateSupported ?? deps.isGitInstall ?? isUpdateSupported;
    const now = deps.now ?? (() => new Date());

    const state = settleFailedAttempt(config);
    const rules = policy();

    if (!rules.autoCheck) return { outcome: Outcome.DISABLED };

    if (!supported()) {
        log.debug('automatic upgrade unavailable: this platform is not supported');
        return { outcome: Outcome.UNSUPPORTED };
    }

    if (state.phase === Phase.PENDING || state.phase === Phase.REQUESTED) {
        log.warn('upgrade in progress, waiting for the health window before checking again', {
            phase: state.phase,
            target: state.targetRef
        });
        return { outcome: Outcome.VALIDATING };
    }

    const result = await check({ force: trigger === 'startup' }).catch((error) => {
        log.warn('cannot reach GitHub, keeping the installed version', { message: error.message });
        return null;
    });

    if (!result) return { outcome: Outcome.UNREACHABLE };

    if (!result.updateAvailable || !isNewer(result.latest.tag, readPackageVersion())) {
        if (state.phase === Phase.AWAITING_APPROVAL) {
            writeState(config, { phase: Phase.IDLE, targetRef: null, automatic: false, message: null });
        }
        return { outcome: Outcome.UP_TO_DATE, version: readPackageVersion() };
    }

    const target = result.latest.tag;

    if (isQuarantined(state, target)) {
        log.error('newest version is in quarantine after a previous failure, no automatic upgrade', { target });
        return { outcome: Outcome.QUARANTINED, target };
    }

    if (rules.restart === RestartPolicy.ASK) {
        awaitApproval(config, target, 'in attesa di conferma per il riavvio', null);
        return { outcome: Outcome.AWAITING_APPROVAL, target };
    }

    if (rules.restart === RestartPolicy.WINDOW) {
        if (!insideWindow(now(), rules.window)) {
            const opensAt = nextOpening(now(), rules.window);
            awaitApproval(config, target, 'in attesa della finestra di manutenzione', opensAt);
            return { outcome: Outcome.AWAITING_WINDOW, target, opensAt };
        }
    }

    if (throttled(state, rules.minIntervalMinutes)) {
        log.info('automatic upgrade postponed: too soon after the previous attempt', {
            lastAttempt: state.lastAutoAttemptAt
        });
        return { outcome: Outcome.THROTTLED, target };
    }

    return apply(config, target, trigger);
}

export async function approveRestart(config, deps = {}) {
    const apply = deps.apply ?? applyNow;
    const state = readState(config);
    const target = state.targetRef;

    if (state.phase !== Phase.AWAITING_APPROVAL || !target) {
        return { approved: false, reason: 'Nessun aggiornamento in attesa di conferma' };
    }

    const outcome = await apply(config, target, 'approval');
    return { approved: outcome.outcome === Outcome.UPGRADING, target, outcome: outcome.outcome };
}

export function dismissPendingUpgrade(config) {
    const state = readState(config);
    if (state.phase !== Phase.AWAITING_APPROVAL) return state;

    return writeState(config, {
        phase: Phase.IDLE,
        targetRef: null,
        automatic: false,
        message: 'Riavvio rimandato dall operatore'
    });
}
