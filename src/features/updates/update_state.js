import fs from 'node:fs';
import path from 'node:path';
import { AppError, ErrorCode } from '../../kernel/errors.js';
import { isReleaseTag } from './semver.js';

export const Phase = Object.freeze({
    IDLE: 'idle',
    REQUESTED: 'requested',
    PENDING: 'pending',
    HEALTHY: 'healthy',
    ROLLED_BACK: 'rolled-back',
    FAILED: 'failed'
});

const FILENAME = 'update-state.json';
const PHASES = new Set(Object.values(Phase));
const MAX_QUARANTINE = 10;

export function stateFile(config) {
    return path.join(config.dataDir, FILENAME);
}

function blank() {
    return {
        phase: Phase.IDLE,
        targetRef: null,
        previousRef: null,
        previousVersion: null,
        attempts: 0,
        requestedAt: null,
        appliedAt: null,
        message: null,
        automatic: false,
        lastAutoAttemptAt: null,
        quarantine: []
    };
}

function sanitise(raw) {
    const state = blank();
    if (!raw || typeof raw !== 'object') return state;

    if (PHASES.has(raw.phase)) state.phase = raw.phase;
    if (isReleaseTag(raw.targetRef)) state.targetRef = raw.targetRef;
    if (typeof raw.previousRef === 'string' && /^[0-9a-f]{40}$/.test(raw.previousRef)) state.previousRef = raw.previousRef;
    if (typeof raw.previousVersion === 'string') state.previousVersion = raw.previousVersion.slice(0, 32);
    if (Number.isInteger(raw.attempts) && raw.attempts >= 0) state.attempts = Math.min(raw.attempts, 99);
    if (typeof raw.requestedAt === 'string') state.requestedAt = raw.requestedAt.slice(0, 40);
    if (typeof raw.appliedAt === 'string') state.appliedAt = raw.appliedAt.slice(0, 40);
    if (typeof raw.message === 'string') state.message = raw.message.slice(0, 500);
    if (raw.automatic === true) state.automatic = true;
    if (typeof raw.lastAutoAttemptAt === 'string') state.lastAutoAttemptAt = raw.lastAutoAttemptAt.slice(0, 40);

    if (Array.isArray(raw.quarantine)) {
        state.quarantine = [...new Set(raw.quarantine.filter(isReleaseTag))].slice(-MAX_QUARANTINE);
    }

    return state;
}

export function readState(config) {
    const target = stateFile(config);

    const raw = (() => {
        try {
            return JSON.parse(fs.readFileSync(target, 'utf8'));
        } catch {
            return null;
        }
    })();

    return sanitise(raw);
}

export function writeState(config, patch) {
    const next = sanitise({ ...readState(config), ...patch });
    const target = stateFile(config);
    const temporary = `${target}.tmp`;

    try {
        fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o640 });
        fs.renameSync(temporary, target);
    } catch (error) {
        throw new AppError(ErrorCode.STORAGE, 'Impossibile salvare lo stato aggiornamento', { cause: error, exposable: false });
    }

    return next;
}

export function clearState(config) {
    return writeState(config, blank());
}

export function quarantine(config, ref) {
    const state = readState(config);
    if (!isReleaseTag(ref)) return state;

    return writeState(config, {
        quarantine: [...state.quarantine.filter((entry) => entry !== ref), ref].slice(-MAX_QUARANTINE)
    });
}

export function isQuarantined(state, ref) {
    return state.quarantine.includes(ref);
}

export function pardon(config, ref) {
    const state = readState(config);
    return writeState(config, { quarantine: state.quarantine.filter((entry) => entry !== ref) });
}
