import { getCamera, getCameraSecrets } from '../cameras/camera_repository.js';
import {
    deviceServiceUrl,
    envelope,
    call,
    allTags,
    attribute,
    firstTag,
    mediaServiceUrl,
    listProfiles,
    nodeCapabilities,
    continuousMoveBody,
    stopBody,
    homeBody,
    presetsBody,
    gotoPresetBody,
    setPresetBody
} from './onvif_ptz.js';

const PROBE_TTL_MS = 5 * 60 * 1000;
const MAX_SPEED = 1;
const DEFAULT_DURATION_MS = 600;

const cache = new Map();

export const Direction = Object.freeze({
    up: { pan: 0, tilt: 1, zoom: 0 },
    down: { pan: 0, tilt: -1, zoom: 0 },
    left: { pan: -1, tilt: 0, zoom: 0 },
    right: { pan: 1, tilt: 0, zoom: 0 },
    'up-left': { pan: -1, tilt: 1, zoom: 0 },
    'up-right': { pan: 1, tilt: 1, zoom: 0 },
    'down-left': { pan: -1, tilt: -1, zoom: 0 },
    'down-right': { pan: 1, tilt: -1, zoom: 0 },
    'zoom-in': { pan: 0, tilt: 0, zoom: 1 },
    'zoom-out': { pan: 0, tilt: 0, zoom: -1 }
});

function credentialsFor(cameraId) {
    const camera = getCamera(cameraId);
    if (!camera) throw new Error('Telecamera sconosciuta');

    const secrets = getCameraSecrets(cameraId);

    return {
        camera,
        url: deviceServiceUrl(camera.host, camera.onvifPort),
        credentials: { username: camera.username ?? '', password: secrets?.password ?? '' }
    };
}

function clampSpeed(value) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return 0.6;
    return Math.min(Math.max(Math.abs(parsed), 0.05), MAX_SPEED);
}

function clampDuration(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed)) return DEFAULT_DURATION_MS;
    return Math.min(Math.max(parsed, 100), 5000);
}

async function probe(cameraId) {
    const { camera, url, credentials } = credentialsFor(cameraId);

    if (!camera.host) return { supported: false, reason: 'la telecamera non ha un indirizzo di rete' };

    const services = await mediaServiceUrl(url, credentials);
    if (!services.ptz) return { supported: false, reason: 'il dispositivo non espone il servizio PTZ ONVIF' };

    const profiles = await listProfiles(services.media ?? url, credentials);
    const usable = profiles.find((profile) => profile.hasPtz) ?? profiles[0];
    if (!usable) return { supported: false, reason: 'nessun profilo media disponibile' };

    const capabilities = await nodeCapabilities(services.ptz, credentials);

    return {
        supported: true,
        ptzUrl: services.ptz,
        profileToken: usable.token,
        profileName: usable.name,
        capabilities
    };
}

export async function ptzStatus(cameraId, { refresh = false } = {}) {
    const cached = cache.get(cameraId);
    if (!refresh && cached && Date.now() - cached.at < PROBE_TTL_MS) return cached.value;

    const value = await probe(cameraId).catch((error) => ({ supported: false, reason: error.message }));
    cache.set(cameraId, { at: Date.now(), value });
    return value;
}

export function forgetPtz(cameraId) {
    cache.delete(cameraId);
}

async function withProfile(cameraId, handler) {
    const status = await ptzStatus(cameraId);
    if (!status.supported) throw new Error(status.reason ?? 'PTZ non disponibile');

    const { credentials } = credentialsFor(cameraId);
    return handler(status, credentials);
}

export function ptzMove(cameraId, direction, options = {}) {
    const vector = Direction[direction];
    if (!vector) throw new Error('Direzione PTZ non valida');

    const speed = clampSpeed(options.speed);
    const duration = clampDuration(options.durationMs);

    return withProfile(cameraId, async (status, credentials) => {
        const body = continuousMoveBody(
            status.profileToken,
            (vector.pan * speed).toFixed(2),
            (vector.tilt * speed).toFixed(2),
            (vector.zoom * speed).toFixed(2)
        );

        await call(status.ptzUrl, envelope(credentials, body));
        await new Promise((resolve) => setTimeout(resolve, duration));
        await call(status.ptzUrl, envelope(credentials, stopBody(status.profileToken)));

        return { direction, speed, durationMs: duration };
    });
}

export function ptzStop(cameraId) {
    return withProfile(cameraId, async (status, credentials) => {
        await call(status.ptzUrl, envelope(credentials, stopBody(status.profileToken)));
        return { stopped: true };
    });
}

export function ptzHome(cameraId) {
    return withProfile(cameraId, async (status, credentials) => {
        await call(status.ptzUrl, envelope(credentials, homeBody(status.profileToken)));
        return { home: true };
    });
}

export function ptzPresets(cameraId) {
    return withProfile(cameraId, async (status, credentials) => {
        const xml = await call(status.ptzUrl, envelope(credentials, presetsBody(status.profileToken)));

        const presets = allTags(xml, 'Preset').map(({ attributes, inner }) => ({
            token: attribute(attributes, 'token'),
            name: firstTag(inner, 'Name') ?? attribute(attributes, 'token')
        })).filter((preset) => preset.token);

        return { presets };
    });
}

export function ptzGotoPreset(cameraId, preset) {
    const token = String(preset ?? '').trim();
    if (token.length === 0 || token.length > 128) throw new Error('Preset non valido');

    return withProfile(cameraId, async (status, credentials) => {
        await call(status.ptzUrl, envelope(credentials, gotoPresetBody(status.profileToken, token)));
        return { preset: token };
    });
}

export function ptzSavePreset(cameraId, name) {
    const label = String(name ?? '').trim();
    if (label.length === 0 || label.length > 64) throw new Error('Nome del preset non valido');

    return withProfile(cameraId, async (status, credentials) => {
        const xml = await call(status.ptzUrl, envelope(credentials, setPresetBody(status.profileToken, label)));
        return { preset: firstTag(xml, 'PresetToken') ?? label, name: label };
    });
}
