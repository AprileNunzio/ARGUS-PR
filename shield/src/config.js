import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_CONFIG_FILE = process.platform === 'win32'
    ? path.join(process.env.PROGRAMDATA ?? 'C:\\ProgramData', 'ARGUS-PR', 'shield.json')
    : '/etc/argus-pr/shield.json';

const DEFAULT_STATE_DIR = process.platform === 'win32'
    ? path.join(process.env.PROGRAMDATA ?? 'C:\\ProgramData', 'ARGUS-PR', 'shield')
    : '/var/lib/argus-shield';

const DEFAULT_EVENTS_FILE = process.platform === 'win32'
    ? path.join(process.env.PROGRAMDATA ?? 'C:\\ProgramData', 'ARGUS-PR', 'security-events.jsonl')
    : '/var/lib/argus-pr/security-events.jsonl';

const DEFAULTS = Object.freeze({
    httpsPort: 443,
    httpPort: 80,
    sshPort: 22,
    wireguardPort: 0,
    publicPorts: [443, 80],
    localOnlyPorts: [22],
    lanNetworks: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16', '127.0.0.0/8', 'fc00::/7', 'fe80::/10', '::1/128'],
    allowlist: [],
    banSeconds: 900,
    maxBanSeconds: 604800,
    scoreThreshold: 10,
    scoreHalfLifeSeconds: 600,
    connectionsPerSource: 40,
    newConnectionsPerMinute: 60,
    banLocalNetworks: false,
    pollIntervalMs: 1000,
    dryRun: false
});

function readFile(target) {
    if (!fs.existsSync(target)) return {};
    try {
        const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function numeric(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function list(value, fallback) {
    if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0);
    if (typeof value === 'string' && value.trim().length > 0) {
        return value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
    }
    return fallback;
}

function ports(value, fallback) {
    const entries = list(value, null);
    if (!entries) return fallback;
    return entries.map((entry) => Number.parseInt(entry, 10)).filter((entry) => Number.isInteger(entry) && entry > 0 && entry < 65536);
}

function truthy(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    return value === true || value === 'true' || value === '1' || value === 'yes';
}

export function loadShieldConfig(overrides = {}) {
    const configFile = overrides.configFile ?? process.env.ARGUS_SHIELD_CONFIG ?? DEFAULT_CONFIG_FILE;
    const file = readFile(configFile);
    const env = process.env;

    const pick = (key, envKey) => overrides[key] ?? env[envKey] ?? file[key];

    const stateDir = pick('stateDir', 'ARGUS_SHIELD_STATE_DIR') ?? DEFAULT_STATE_DIR;

    return Object.freeze({
        configFile,
        stateDir,
        stateFile: path.join(stateDir, 'state.json'),
        eventsFile: pick('eventsFile', 'ARGUS_SHIELD_EVENTS') ?? DEFAULT_EVENTS_FILE,
        httpsPort: numeric(pick('httpsPort', 'ARGUS_SHIELD_HTTPS_PORT'), DEFAULTS.httpsPort),
        httpPort: numeric(pick('httpPort', 'ARGUS_SHIELD_HTTP_PORT'), DEFAULTS.httpPort),
        sshPort: numeric(pick('sshPort', 'ARGUS_SHIELD_SSH_PORT'), DEFAULTS.sshPort),
        wireguardPort: numeric(pick('wireguardPort', 'ARGUS_SHIELD_WG_PORT'), DEFAULTS.wireguardPort),
        publicPorts: ports(pick('publicPorts', 'ARGUS_SHIELD_PUBLIC_PORTS'), DEFAULTS.publicPorts),
        localOnlyPorts: ports(pick('localOnlyPorts', 'ARGUS_SHIELD_LOCAL_PORTS'), DEFAULTS.localOnlyPorts),
        lanNetworks: list(pick('lanNetworks', 'ARGUS_SHIELD_LAN'), DEFAULTS.lanNetworks),
        allowlist: list(pick('allowlist', 'ARGUS_SHIELD_ALLOWLIST'), DEFAULTS.allowlist),
        banSeconds: numeric(pick('banSeconds', 'ARGUS_SHIELD_BAN_SECONDS'), DEFAULTS.banSeconds),
        maxBanSeconds: numeric(pick('maxBanSeconds', 'ARGUS_SHIELD_MAX_BAN'), DEFAULTS.maxBanSeconds),
        scoreThreshold: numeric(pick('scoreThreshold', 'ARGUS_SHIELD_THRESHOLD'), DEFAULTS.scoreThreshold),
        scoreHalfLifeSeconds: numeric(pick('scoreHalfLifeSeconds', 'ARGUS_SHIELD_HALF_LIFE'), DEFAULTS.scoreHalfLifeSeconds),
        connectionsPerSource: numeric(pick('connectionsPerSource', 'ARGUS_SHIELD_CONN_LIMIT'), DEFAULTS.connectionsPerSource),
        newConnectionsPerMinute: numeric(pick('newConnectionsPerMinute', 'ARGUS_SHIELD_RATE'), DEFAULTS.newConnectionsPerMinute),
        banLocalNetworks: truthy(pick('banLocalNetworks', 'ARGUS_SHIELD_BAN_LAN'), DEFAULTS.banLocalNetworks),
        pollIntervalMs: numeric(pick('pollIntervalMs', 'ARGUS_SHIELD_POLL_MS'), DEFAULTS.pollIntervalMs),
        dryRun: truthy(pick('dryRun', 'ARGUS_SHIELD_DRY_RUN'), DEFAULTS.dryRun)
    });
}

export { DEFAULTS };
