import { listCameras } from '../cameras/camera_repository.js';
import { profileFor, replaceProfile } from './analytics_repository.js';
import { capabilityIds, defaultEngineFor, findCapability, isEngineAllowed } from './engines_catalog.js';
import { requiredModels } from './analytics_profile.js';
import { missingModels } from './models_service.js';
import { validationError } from '../../kernel/errors.js';

function resolveCamera(reference) {
    const cameras = listCameras();
    const byId = cameras.find((camera) => camera.id === reference);
    if (byId) return byId;

    const matches = cameras.filter((camera) => camera.name.toLowerCase().includes(String(reference).toLowerCase()));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
        throw validationError(`Riferimento ambiguo "${reference}": corrisponde a ${matches.map((camera) => camera.name).join(', ')}`);
    }

    throw validationError(`Nessuna telecamera corrisponde a "${reference}"`);
}

function parseCapabilities(raw) {
    const allowed = capabilityIds();
    const wanted = String(raw ?? '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0);

    if (wanted.length === 0) throw validationError('Indica almeno una capacita');

    for (const entry of wanted) {
        if (!allowed.includes(entry)) {
            throw validationError(`Capacita sconosciuta "${entry}". Ammesse: ${allowed.join(', ')}`);
        }
    }

    return wanted;
}

function withDependencies(capabilities) {
    const resolved = new Set(capabilities);

    for (const id of capabilities) {
        let capability = findCapability(id);
        while (capability?.requires) {
            resolved.add(capability.requires);
            capability = findCapability(capability.requires);
        }
    }

    return [...resolved];
}

export function visionOverview(config) {
    return listCameras().map((camera) => {
        const entries = profileFor(camera.id);
        const active = entries.filter((entry) => entry.enabled);

        return {
            id: camera.id,
            name: camera.name,
            enabled: camera.enabled,
            capabilities: active.map((entry) => entry.capability),
            engines: [...new Set(active.map((entry) => entry.engineId))],
            missing: missingModels(requiredModels(entries), config)
        };
    });
}

export function applyVisionCapabilities(config, reference, capabilities, enabled) {
    const camera = resolveCamera(reference);
    const requested = enabled ? withDependencies(parseCapabilities(capabilities)) : parseCapabilities(capabilities);
    const current = profileFor(camera.id);

    const entries = current.map((entry) => {
        if (!requested.includes(entry.capability)) return entry;

        const engineId = isEngineAllowed(entry.capability, entry.engineId)
            ? entry.engineId
            : defaultEngineFor(entry.capability);

        return { ...entry, enabled, engineId };
    });

    const saved = replaceProfile(camera.id, entries.map((entry) => ({
        capability: entry.capability,
        enabled: entry.enabled,
        engineId: entry.engineId,
        threshold: entry.threshold,
        minSize: entry.minSize
    })));

    const active = saved.filter((entry) => entry.enabled);

    return {
        camera,
        applied: requested,
        active: active.map((entry) => entry.capability),
        engines: [...new Set(active.map((entry) => entry.engineId))],
        missing: missingModels(requiredModels(saved), config)
    };
}
