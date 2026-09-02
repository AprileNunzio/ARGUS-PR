import fs from 'node:fs';
import path from 'node:path';
import { defaultDataDir, defaultMediaDir, ensureDir, ensureSecureDir } from '../platform/paths.js';
import { validationError } from './errors.js';

function readEnvFile(dataDir) {
    const target = path.join(dataDir, 'argus.env');
    if (!fs.existsSync(target)) return {};

    const raw = fs.readFileSync(target, 'utf8');
    const parsed = {};
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
        const separator = trimmed.indexOf('=');
        if (separator < 1) continue;
        parsed[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
    }
    return parsed;
}

function pick(sources, key, fallback) {
    for (const source of sources) {
        const value = source[key];
        if (value !== undefined && value !== null && String(value).length > 0) return String(value);
    }
    return fallback;
}

function toPort(value) {
    const port = Number.parseInt(value, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw validationError(`Invalid port: ${value}`);
    }
    return port;
}

function toBool(value) {
    return value === 'true' || value === '1' || value === 'yes';
}

function toPositiveInt(value, name) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw validationError(`Invalid ${name}: ${value}`);
    }
    return parsed;
}

export function loadConfig(overrides = {}) {
    const bootDataDir = pick([overrides, process.env], 'ARGUS_DATA_DIR', '') || defaultDataDir();
    const fileEnv = readEnvFile(bootDataDir);
    const sources = [overrides, process.env, fileEnv];

    const dataDir = path.resolve(pick(sources, 'ARGUS_DATA_DIR', bootDataDir));
    const mediaDir = path.resolve(pick(sources, 'ARGUS_MEDIA_DIR', defaultMediaDir(dataDir)));

    ensureDir(dataDir);
    ensureDir(mediaDir);
    ensureSecureDir(path.join(dataDir, 'secrets'));

    return Object.freeze({
        host: pick(sources, 'ARGUS_HOST', '0.0.0.0'),
        port: toPort(pick(sources, 'ARGUS_PORT', '8088')),
        dataDir,
        mediaDir,
        secretsDir: path.join(dataDir, 'secrets'),
        databaseFile: path.join(dataDir, 'argus.db'),
        logLevel: pick(sources, 'ARGUS_LOG_LEVEL', 'info'),
        trustProxy: toBool(pick(sources, 'ARGUS_TRUST_PROXY', 'false')),
        sessionTtlHours: toPositiveInt(pick(sources, 'ARGUS_SESSION_TTL_HOURS', '12'), 'session TTL'),
        ffmpegPath: pick(sources, 'ARGUS_FFMPEG_PATH', ''),
        ffprobePath: pick(sources, 'ARGUS_FFPROBE_PATH', '')
    });
}
