import { validationError } from '../kernel/errors.js';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const HOSTNAME_PATTERN = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
const ALLOWED_STREAM_SCHEMES = Object.freeze(['rtsp:', 'rtsps:', 'http:', 'https:']);

export function requireString(value, field, options = {}) {
    const min = options.min ?? 1;
    const max = options.max ?? 255;

    if (typeof value !== 'string') throw validationError(`${field} must be text`);
    const trimmed = value.trim();
    if (trimmed.length < min) throw validationError(`${field} must be at least ${min} characters`);
    if (trimmed.length > max) throw validationError(`${field} must be at most ${max} characters`);
    return trimmed;
}

export function optionalString(value, field, options = {}) {
    if (value === undefined || value === null || value === '') return null;
    return requireString(value, field, options);
}

export function requireId(value, field) {
    const candidate = requireString(value, field, { max: 64 });
    if (!ID_PATTERN.test(candidate)) throw validationError(`${field} has an invalid format`);
    return candidate;
}

export function requirePort(value, field) {
    const port = Number.parseInt(value, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw validationError(`${field} must be a port between 1 and 65535`);
    }
    return port;
}

export function optionalPort(value, field) {
    if (value === undefined || value === null || value === '') return null;
    return requirePort(value, field);
}

export function requireHostname(value, field) {
    const host = requireString(value, field, { max: 253 });
    if (!HOSTNAME_PATTERN.test(host)) throw validationError(`${field} is not a valid host`);
    return host;
}

export function requireEnum(value, field, allowed) {
    const candidate = requireString(value, field, { max: 64 });
    if (!allowed.includes(candidate)) {
        throw validationError(`${field} must be one of: ${allowed.join(', ')}`);
    }
    return candidate;
}

export function requireBool(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
}

export function requireStreamUrl(value, field) {
    const candidate = requireString(value, field, { max: 2048 });

    const parsed = (() => {
        try {
            return new URL(candidate);
        } catch {
            return null;
        }
    })();

    if (!parsed) throw validationError(`${field} is not a valid URL`);
    if (!ALLOWED_STREAM_SCHEMES.includes(parsed.protocol)) {
        throw validationError(`${field} must use one of: ${ALLOWED_STREAM_SCHEMES.join(' ')}`);
    }
    if (parsed.hostname.length === 0) throw validationError(`${field} is missing a host`);

    return candidate;
}

export function optionalStreamUrl(value, field) {
    if (value === undefined || value === null || value === '') return null;
    return requireStreamUrl(value, field);
}

export function stripControlCharacters(value) {
    let output = '';
    for (const character of value) {
        const code = character.codePointAt(0);
        if (code < 0x20 || code === 0x7f) continue;
        output += character;
    }
    return output;
}

export function sanitiseForLog(value, max = 120) {
    if (typeof value !== 'string') return null;
    return stripControlCharacters(value).slice(0, max);
}

export function redactCredentials(url) {
    if (typeof url !== 'string') return null;
    const parsed = (() => {
        try {
            return new URL(url);
        } catch {
            return '[invalid-url]';
        }
    })();
    if (typeof parsed === 'string') return parsed;
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
}

const SCHEDULE_MODES = Object.freeze(['continuous', 'scheduled', 'motion', 'off']);
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MASK_PATTERN = /^[01]{336}$/;
const DETECTION_CLASSES = Object.freeze([
    'person', 'vehicle', 'car', 'truck', 'bus', 'motorcycle', 'bicycle',
    'dog', 'cat', 'bird', 'animal', 'face', 'plate', 'motion'
]);

export function requireScheduleMode(value, field = 'mode') {
    return requireEnum(value, field, SCHEDULE_MODES);
}

export function requireWeekMask(value, field = 'weekMask') {
    const candidate = requireString(value, field, { min: 336, max: 336 });
    if (!MASK_PATTERN.test(candidate)) throw validationError(`${field} must contain exactly 336 binary characters`);
    return candidate;
}

export function requireIsoDay(value, field = 'day') {
    const candidate = requireString(value, field, { min: 10, max: 10 });
    if (!DAY_PATTERN.test(candidate)) throw validationError(`${field} must be YYYY-MM-DD`);
    return candidate;
}

export function requireNumberRange(value, field, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < min || num > max) {
        throw validationError(`${field} must be a number between ${min} and ${max}`);
    }
    return num;
}

export function requirePolygon(points, field = 'points') {
    if (!Array.isArray(points) || points.length < 3) {
        throw validationError(`${field} must be an array of at least 3 points`);
    }
    if (points.length > 64) {
        throw validationError(`${field} must not have more than 64 points`);
    }
    const clean = [];
    for (let i = 0; i < points.length; i += 1) {
        const pt = points[i];
        if (!Array.isArray(pt) || pt.length < 2) {
            throw validationError(`${field}[${i}] must be [x, y] coordinates`);
        }
        const x = requireNumberRange(pt[0], `${field}[${i}][0]`, 0, 1);
        const y = requireNumberRange(pt[1], `${field}[${i}][1]`, 0, 1);
        clean.push([x, y]);
    }
    return clean;
}

export function requireDetectionClass(value, field = 'className') {
    const candidate = requireString(value, field, { max: 32 });
    if (!DETECTION_CLASSES.includes(candidate)) {
        throw validationError(`${field} must be one of: ${DETECTION_CLASSES.join(', ')}`);
    }
    return candidate;
}

