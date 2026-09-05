import { slotIndex } from '../scheduling/schedule.js';
import { isSunUp } from './solar_calc.js';

export const TriggerKind = Object.freeze({
    DETECTION: 'detection',
    ACCESS: 'access',
    MOTION: 'motion'
});

export const PlateScope = Object.freeze({ ANY: 'any', ALLOWED: 'allowed', DENIED: 'denied', UNKNOWN: 'unknown' });
export const PersonScope = Object.freeze({ ANY: 'any', KNOWN: 'known', UNKNOWN: 'unknown' });
export const SolarMode = Object.freeze({ NONE: 'none', NIGHT_SOLAR: 'night_solar', DAY_SOLAR: 'day_solar' });
export const ArmState = Object.freeze({ DISARMED: 'disarmed', ARMED_HOME: 'armed_home', ARMED_AWAY: 'armed_away' });

export const TRIGGER_KINDS = Object.freeze(Object.values(TriggerKind));
export const PLATE_SCOPES = Object.freeze(Object.values(PlateScope));
export const PERSON_SCOPES = Object.freeze(Object.values(PersonScope));
export const SOLAR_MODES = Object.freeze(Object.values(SolarMode));
export const ARM_STATES = Object.freeze(Object.values(ArmState));

function withinSchedule(rule, when) {
    if (typeof rule.weekMask !== 'string' || rule.weekMask.length !== 336) return true;
    return rule.weekMask[slotIndex(when)] === '1';
}

function withinSolarMode(rule, when) {
    if (!rule.solarMode || rule.solarMode === SolarMode.NONE) return true;
    const sunUp = isSunUp(when);
    if (rule.solarMode === SolarMode.NIGHT_SOLAR) return !sunUp;
    if (rule.solarMode === SolarMode.DAY_SOLAR) return sunUp;
    return true;
}

function withinArmState(rule, currentArmState) {
    if (!rule.armStates || !Array.isArray(rule.armStates) || rule.armStates.length === 0) return true;
    if (!currentArmState) return true;
    return rule.armStates.includes(currentArmState);
}

function withinCooldown(rule, state, timestamp) {
    if (!state?.lastFiredAt) return false;
    const cooldownMs = Math.max(0, rule.cooldownSeconds ?? 0) * 1000;
    return timestamp - state.lastFiredAt < cooldownMs;
}

function overDailyLimit(rule, state, when) {
    if (!rule.dailyLimit || rule.dailyLimit <= 0) return false;
    if (!state?.day || state.day !== when.toISOString().slice(0, 10)) return false;
    return (state.count ?? 0) >= rule.dailyLimit;
}

function matchesPlate(rule, event) {
    if (rule.plateScope === PlateScope.ANY) return true;
    if (rule.plateScope === PlateScope.ALLOWED) return event.decision === 'allow';
    if (rule.plateScope === PlateScope.DENIED) return event.decision === 'deny';
    return event.decision === 'unknown' || event.decision === undefined || event.decision === null;
}

function matchesPerson(rule, event) {
    if (rule.personScope === PersonScope.ANY) return true;
    if (rule.personScope === PersonScope.KNOWN) return Boolean(event.personId);
    return !event.personId;
}

export function evaluateRule(rule, event, options = {}) {
    const timestamp = event.timestamp ?? Date.now();
    const when = new Date(timestamp);

    if (rule.enabled === false) return { fires: false, reason: 'regola disattivata' };
    if (rule.triggerKind !== event.kind) return { fires: false, reason: 'evento di altro tipo' };
    if (rule.cameraId && rule.cameraId !== event.cameraId) return { fires: false, reason: 'altra telecamera' };

    if (rule.className && rule.className !== event.className) return { fires: false, reason: 'altra classe' };

    const confidence = event.confidence ?? 1;
    if (confidence < (rule.minConfidence ?? 0)) return { fires: false, reason: 'confidenza insufficiente' };

    if (!withinArmState(rule, options.currentArmState)) {
        return { fires: false, reason: `impianto non armato nello stato richiesto (${options.currentArmState ?? 'nessuno'})` };
    }

    if (!withinSolarMode(rule, when)) {
        return { fires: false, reason: 'fascia solare non corrispondente' };
    }

    if (rule.minDwellSeconds && rule.minDwellSeconds > 0) {
        const dwell = options.dwellSeconds ?? event.dwellSeconds ?? (event.durationMs ? Math.round(event.durationMs / 1000) : 0);
        if (dwell < rule.minDwellSeconds) {
            return { fires: false, reason: `stazionamento insufficiente (${dwell}s < ${rule.minDwellSeconds}s)` };
        }
    }

    if (rule.triggerKind === TriggerKind.ACCESS && !matchesPlate(rule, event)) {
        return { fires: false, reason: 'esito targa non corrispondente' };
    }

    if (rule.targetPlate) {
        const expected = rule.targetPlate.toUpperCase().trim();
        const actual = (event.plate ?? event.plateText ?? '').toUpperCase().trim();
        if (!actual.includes(expected)) {
            return { fires: false, reason: 'targa specifica non corrispondente' };
        }
    }

    if (rule.targetPersonId && event.personId !== rule.targetPersonId) {
        return { fires: false, reason: 'persona specifica non corrispondente' };
    }

    if (rule.upperColor && event.upperColor) {
        if (rule.upperColor.toLowerCase().trim() !== event.upperColor.toLowerCase().trim()) {
            return { fires: false, reason: 'colore abito non corrispondente' };
        }
    } else if (rule.upperColor && !event.upperColor) {
        return { fires: false, reason: 'colore abito non rilevato' };
    }

    if (rule.triggerKind === TriggerKind.DETECTION && event.className === 'face' && !matchesPerson(rule, event)) {
        return { fires: false, reason: 'persona non corrispondente' };
    }

    if (rule.minOccurrences && rule.minOccurrences > 1) {
        const recentCount = (options.recentOccurrences ?? 1);
        if (recentCount < rule.minOccurrences) {
            return { fires: false, reason: `occorrenze insufficienti (${recentCount}/${rule.minOccurrences})` };
        }
    }

    if (!withinSchedule(rule, when)) return { fires: false, reason: 'fuori orario' };
    if (withinCooldown(rule, options.state, timestamp)) return { fires: false, reason: 'in attesa del cooldown' };
    if (overDailyLimit(rule, options.state, when)) return { fires: false, reason: 'limite giornaliero raggiunto' };

    return { fires: true, reason: 'condizioni soddisfatte' };
}

export function nextState(state, timestamp) {
    const day = new Date(timestamp).toISOString().slice(0, 10);
    if (!state || state.day !== day) return { day, count: 1, lastFiredAt: timestamp };
    return { day, count: (state.count ?? 0) + 1, lastFiredAt: timestamp };
}

export function describeEvent(event) {
    if (event.kind === TriggerKind.ACCESS) {
        return `targa ${event.plate ?? '?'} (${event.decision ?? 'senza esito'})`;
    }
    if (event.kind === TriggerKind.MOTION) {
        return `movimento${event.zoneLabel ? ` in ${event.zoneLabel}` : ''}`;
    }
    return `${event.className ?? 'oggetto'}${event.plateText ? ` targa ${event.plateText}` : ''}`;
}
