import { validationError } from '../../kernel/errors.js';
import { parseCidr } from '../../security/net_zones.js';
import { getSetting, setSetting, invalidateSettings } from './settings_repository.js';
import { SETTINGS, SettingType, definitionFor, defaults, GROUPS } from './settings_schema.js';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const HOST_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

function asBoolean(value, entry) {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === 1) return true;
    if (value === 'false' || value === 0) return false;
    throw validationError(`${entry.label}: valore non booleano`);
}

function asInteger(value, entry) {
    const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);

    if (!Number.isInteger(parsed)) throw validationError(`${entry.label}: valore non intero`);
    if (entry.minimum !== undefined && parsed < entry.minimum) {
        throw validationError(`${entry.label}: minimo ${entry.minimum}`);
    }
    if (entry.maximum !== undefined && parsed > entry.maximum) {
        throw validationError(`${entry.label}: massimo ${entry.maximum}`);
    }

    return parsed;
}

function asEnum(value, entry) {
    const allowed = entry.options.map((option) => option.value);
    if (!allowed.includes(value)) throw validationError(`${entry.label}: valore non ammesso`);
    return value;
}

function asTime(value, entry) {
    if (typeof value !== 'string' || !TIME_PATTERN.test(value)) {
        throw validationError(`${entry.label}: usa il formato HH:MM`);
    }
    return value;
}

function asDays(value, entry) {
    if (!Array.isArray(value)) throw validationError(`${entry.label}: elenco di giorni non valido`);

    const days = [...new Set(value.map((day) => Number.parseInt(day, 10)))].sort();
    if (days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
        throw validationError(`${entry.label}: i giorni vanno da 0 a 6`);
    }
    if (days.length === 0) throw validationError(`${entry.label}: scegli almeno un giorno`);

    return days;
}

function asCidrList(value, entry) {
    const entries = Array.isArray(value)
        ? value
        : String(value ?? '').split(',');

    const cleaned = entries.map((item) => String(item).trim()).filter((item) => item.length > 0);
    if (cleaned.length > 32) throw validationError(`${entry.label}: troppe reti`);

    for (const item of cleaned) parseCidr(item);

    return cleaned;
}

function asHostList(value, entry) {
    const entries = Array.isArray(value) ? value : String(value ?? '').split(',');
    const cleaned = entries.map((item) => String(item).trim().toLowerCase()).filter((item) => item.length > 0);

    if (cleaned.length > 16) throw validationError(`${entry.label}: troppi nomi`);
    for (const item of cleaned) {
        if (item.length > 253 || !HOST_PATTERN.test(item)) {
            throw validationError(`${entry.label}: nome non valido "${item}"`);
        }
    }

    return cleaned;
}

export function coerce(key, value) {
    const entry = definitionFor(key);
    if (!entry) throw validationError(`Impostazione sconosciuta: ${key}`);

    switch (entry.type) {
        case SettingType.BOOLEAN: return asBoolean(value, entry);
        case SettingType.INTEGER: return asInteger(value, entry);
        case SettingType.ENUM: return asEnum(value, entry);
        case SettingType.TIME: return asTime(value, entry);
        case SettingType.DAYS: return asDays(value, entry);
        case SettingType.CIDR_LIST: return asCidrList(value, entry);
        case SettingType.HOST_LIST: return asHostList(value, entry);
        default: throw validationError(`Tipo non gestito per ${key}`);
    }
}

let seeded = false;

export function seedFromConfig(config) {
    if (seeded) return;
    seeded = true;

    if (getSetting('access.publicAccess', null) === null) {
        setSetting('access.publicAccess', config.publicAccess === true);
    }

    if (getSetting('access.trustedNetworks', null) === null && config.trustedNetworkList.length > 0) {
        setSetting('access.trustedNetworks', [...config.trustedNetworkList]);
    }

    if (getSetting('security.sessionTtlHours', null) === null) {
        setSetting('security.sessionTtlHours', config.sessionTtlHours);
    }

    if (getSetting('updates.autoCheck', null) === null) {
        setSetting('updates.autoCheck', config.autoUpdate === true);
    }

    if (getSetting('updates.minIntervalMinutes', null) === null) {
        setSetting('updates.minIntervalMinutes', config.autoUpdateMinIntervalMinutes);
    }
}

export function readSetting(key) {
    const entry = definitionFor(key);
    if (!entry) throw validationError(`Impostazione sconosciuta: ${key}`);

    const stored = storedValue(key);
    if (stored === null || stored === undefined) return entry.default;

    try {
        return coerce(key, stored);
    } catch {
        return entry.default;
    }
}

export function readAll() {
    const values = {};
    for (const entry of SETTINGS) values[entry.key] = readSetting(entry.key);
    return values;
}

export function describe() {
    const values = readAll();

    return {
        groups: GROUPS,
        settings: SETTINGS.map((entry) => ({
            key: entry.key,
            group: entry.group,
            label: entry.label,
            help: entry.help ?? null,
            type: entry.type,
            unit: entry.unit ?? null,
            options: entry.options ?? null,
            minimum: entry.minimum ?? null,
            maximum: entry.maximum ?? null,
            sensitive: entry.sensitive === true,
            dependsOn: entry.dependsOn ?? null,
            default: entry.default,
            value: values[entry.key]
        }))
    };
}

export function updateSettings(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw validationError('Corpo della richiesta non valido');
    }

    const changes = [];

    for (const [key, raw] of Object.entries(patch)) {
        const entry = definitionFor(key);
        if (!entry) throw validationError(`Impostazione sconosciuta: ${key}`);

        const next = coerce(key, raw);
        const previous = readSetting(key);

        if (JSON.stringify(previous) !== JSON.stringify(next)) {
            changes.push({ key, previous, next, sensitive: entry.sensitive === true });
        }
    }

    for (const change of changes) setSetting(change.key, change.next);

    return changes;
}

let networkCache = { signature: null, networks: [] };

function storedValue(key) {
    try {
        return getSetting(key, null);
    } catch {
        return null;
    }
}

export function remoteAccessEnabled(config) {
    const stored = storedValue('access.publicAccess');
    return stored === null || stored === undefined ? config.publicAccess === true : stored === true;
}

export function trustedNetworksFor(config) {
    const stored = storedValue('access.trustedNetworks');
    if (stored === null || stored === undefined) return config.trustedNetworks;

    const signature = JSON.stringify(stored);
    if (networkCache.signature === signature) return networkCache.networks;

    const networks = [];
    for (const entry of Array.isArray(stored) ? stored : []) {
        try {
            networks.push(parseCidr(entry));
        } catch {
            continue;
        }
    }

    networkCache = { signature, networks };
    return networks;
}

export function sessionTtlHoursFor(config) {
    const stored = storedValue('security.sessionTtlHours');
    if (stored === null || stored === undefined) return config.sessionTtlHours;
    return Number.isInteger(stored) && stored > 0 ? stored : config.sessionTtlHours;
}

export function mfaRequiredForAdmin() {
    const stored = storedValue('security.mfaRequiredForAdmin');
    return stored === null || stored === undefined ? true : stored === true;
}

export function lockoutThresholds() {
    return {
        softThreshold: readSetting('security.lockoutSoftThreshold'),
        hardThreshold: readSetting('security.lockoutHardThreshold'),
        baseSeconds: readSetting('security.lockoutBaseSeconds'),
        maxSeconds: readSetting('security.lockoutMaxSeconds')
    };
}

export function resetSettings() {
    const values = defaults();
    for (const [key, value] of Object.entries(values)) setSetting(key, value);
    invalidateSettings();
    return values;
}
