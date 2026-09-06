import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getSetting, setSetting } from '../settings/settings_repository.js';
import { validationError } from '../../kernel/errors.js';
import { createLogger } from '../../kernel/logger.js';

const run = promisify(execFile);
const log = createLogger('time');

const STORAGE_KEY = 'time.config';
const HOST_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

export const CLOCK_FORMATS = Object.freeze(['24h', '12h']);
export const DATE_STYLES = Object.freeze(['none', 'short', 'long']);
export const DST_MODES = Object.freeze(['auto', 'off']);
export const NTP_PRESETS = Object.freeze([
    'pool.ntp.org',
    'it.pool.ntp.org',
    'europe.pool.ntp.org',
    'time.google.com',
    'time.cloudflare.com',
    'time.windows.com'
]);

export const DEFAULT_TIME_CONFIG = Object.freeze({
    format: '24h',
    showSeconds: true,
    dateStyle: 'long',
    timezone: 'system',
    dstMode: 'auto',
    ntpEnabled: true,
    ntpServers: ['pool.ntp.org', 'time.google.com']
});

const ZONES = new Set(Intl.supportedValuesOf('timeZone'));

export function isKnownTimezone(value) {
    return value === 'UTC' || ZONES.has(value);
}

export function listTimezones() {
    return ['UTC', ...ZONES];
}

function sanitiseServers(raw) {
    const entries = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
    const clean = [];

    for (const item of entries) {
        const host = String(item).trim().toLowerCase();
        if (host.length === 0 || host.length > 253) continue;
        if (!HOST_PATTERN.test(host)) continue;
        if (!clean.includes(host)) clean.push(host);
    }

    return clean.slice(0, 6);
}

export function sanitiseTimeConfig(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const servers = sanitiseServers(source.ntpServers ?? DEFAULT_TIME_CONFIG.ntpServers);

    return {
        format: CLOCK_FORMATS.includes(source.format) ? source.format : DEFAULT_TIME_CONFIG.format,
        showSeconds: source.showSeconds !== false,
        dateStyle: DATE_STYLES.includes(source.dateStyle) ? source.dateStyle : DEFAULT_TIME_CONFIG.dateStyle,
        timezone: source.timezone === 'system' || isKnownTimezone(source.timezone) ? source.timezone : DEFAULT_TIME_CONFIG.timezone,
        dstMode: DST_MODES.includes(source.dstMode) ? source.dstMode : DEFAULT_TIME_CONFIG.dstMode,
        ntpEnabled: source.ntpEnabled !== false,
        ntpServers: servers.length > 0 ? servers : [...DEFAULT_TIME_CONFIG.ntpServers]
    };
}

export function readTimeConfig() {
    return sanitiseTimeConfig(getSetting(STORAGE_KEY, null));
}

function systemTimezone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

export function effectiveTimezone(config) {
    return config.timezone === 'system' ? systemTimezone() : config.timezone;
}

function offsetMinutes(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).formatToParts(date);

    const field = (type) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const asUtc = Date.UTC(field('year'), field('month') - 1, field('day'), field('hour') % 24, field('minute'), field('second'));

    return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

export function daylightSaving(timeZone, at = new Date()) {
    const year = at.getUTCFullYear();
    const january = offsetMinutes(new Date(Date.UTC(year, 0, 15)), timeZone);
    const july = offsetMinutes(new Date(Date.UTC(year, 6, 15)), timeZone);
    const current = offsetMinutes(at, timeZone);
    const standard = Math.min(january, july);

    return {
        observed: january !== july,
        active: current > standard,
        currentOffsetMinutes: current,
        standardOffsetMinutes: standard,
        shiftMinutes: current - standard
    };
}

async function shell(command, args) {
    const result = await run(command, args, { windowsHide: true, shell: false, timeout: 15000, maxBuffer: 256 * 1024 })
        .catch((error) => ({ failed: true, message: error.message, stdout: error.stdout ?? '' }));

    if (result.failed) return { ok: false, output: String(result.stdout ?? ''), error: result.message };
    return { ok: true, output: String(result.stdout ?? '') };
}

function parseTimedatectl(output) {
    const values = {};
    for (const line of output.split('\n')) {
        const index = line.indexOf('=');
        if (index > 0) values[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
    return values;
}

export async function readSyncStatus() {
    if (process.platform === 'linux') {
        const result = await shell('timedatectl', ['show']);
        if (!result.ok) return { available: false, service: 'timedatectl', detail: result.error };

        const values = parseTimedatectl(result.output);
        return {
            available: true,
            service: 'systemd-timesyncd',
            enabled: values.NTP === 'yes',
            synchronized: values.NTPSynchronized === 'yes',
            systemTimezone: values.Timezone ?? systemTimezone(),
            detail: values.TimeUSec ?? null
        };
    }

    if (process.platform === 'win32') {
        const result = await shell('w32tm', ['/query', '/status']);
        if (!result.ok) return { available: false, service: 'w32time', detail: result.error };

        const synchronized = /Source:/i.test(result.output) && !/unsynchronized/i.test(result.output);
        return {
            available: true,
            service: 'w32time',
            enabled: true,
            synchronized,
            systemTimezone: systemTimezone(),
            detail: result.output.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 6).join(' | ')
        };
    }

    return { available: false, service: process.platform, detail: 'Sincronizzazione NTP gestita dal sistema operativo' };
}

export async function synchroniseNow() {
    if (process.platform === 'linux') {
        const enable = await shell('timedatectl', ['set-ntp', 'true']);
        const restart = await shell('systemctl', ['restart', 'systemd-timesyncd']);
        const status = await readSyncStatus();

        if (!enable.ok && !restart.ok) {
            log.warn('ntp sync failed', { message: enable.error });
            return { success: false, error: enable.error ?? restart.error, status };
        }

        return { success: true, status };
    }

    if (process.platform === 'win32') {
        const result = await shell('w32tm', ['/resync']);
        const status = await readSyncStatus();
        return { success: result.ok, error: result.ok ? null : result.error, status };
    }

    return { success: false, error: 'Sincronizzazione manuale non supportata su questa piattaforma', status: await readSyncStatus() };
}

async function applySystemTimezone(timezone) {
    if (process.platform !== 'linux' || timezone === 'system') return { applied: false };

    const result = await shell('timedatectl', ['set-timezone', timezone]);
    if (!result.ok) log.warn('timezone not applied to the operating system', { timezone, message: result.error });
    return { applied: result.ok, error: result.ok ? null : result.error };
}

export async function saveTimeConfig(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw validationError('Configurazione di data e ora non valida');
    }

    if (patch.timezone !== undefined && patch.timezone !== 'system' && !isKnownTimezone(patch.timezone)) {
        throw validationError('Fuso orario non riconosciuto');
    }

    const previous = readTimeConfig();
    const next = sanitiseTimeConfig({ ...previous, ...patch });
    setSetting(STORAGE_KEY, next);

    const system = next.timezone !== previous.timezone
        ? await applySystemTimezone(next.timezone)
        : { applied: false };

    return { config: next, system };
}

export async function timeOverview() {
    const config = readTimeConfig();
    const timezone = effectiveTimezone(config);
    const now = new Date();

    return {
        config,
        presets: NTP_PRESETS,
        timezones: listTimezones(),
        systemTimezone: systemTimezone(),
        effectiveTimezone: timezone,
        nowIso: now.toISOString(),
        epochMs: now.getTime(),
        dst: daylightSaving(timezone, now),
        sync: await readSyncStatus()
    };
}
