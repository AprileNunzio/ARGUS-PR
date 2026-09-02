import { normalisePlate } from '../vision/plates.js';

export function matchesPattern(plate, pattern) {
    const p = String(pattern ?? '').trim().toUpperCase();
    if (!p) return false;
    if (!p.includes('*') && !p.includes('?')) return plate === p;

    const regexStr = p
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[A-Z0-9]*')
        .replace(/\?/g, '[A-Z0-9]');

    return new RegExp(`^${regexStr}$`).test(plate);
}

export function evaluateAccess(plate, rules = [], now = new Date().toISOString()) {
    const normalised = normalisePlate(plate);
    if (!normalised) {
        return { decision: 'log', rule: null, plate: '' };
    }

    const applicable = rules.filter((rule) => {
        if (!rule.isActive) return false;
        if (!matchesPattern(normalised, rule.plateNormalised)) return false;
        if (rule.validFrom && rule.validFrom > now) return false;
        if (rule.validTo && rule.validTo < now) return false;
        return true;
    });

    const blacklisted = applicable.find((rule) => rule.listType === 'blacklist');
    if (blacklisted) {
        return { decision: 'deny', rule: blacklisted, plate: normalised };
    }

    const allowed = applicable.find((rule) => rule.listType === 'whitelist');
    if (allowed) {
        return { decision: 'allow', rule: allowed, plate: normalised };
    }

    const monitored = applicable.find((rule) => rule.listType === 'monitored');
    if (monitored) {
        return { decision: 'log', rule: monitored, plate: normalised };
    }

    return { decision: 'log', rule: null, plate: normalised };
}
