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
        message: null
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
