import {
    CAPABILITIES,
    Capability,
    defaultEngineFor,
    findCapability,
    findEngine,
    isEngineAllowed,
    modelsRequiredBy
} from './engines_catalog.js';

function storedFor(rows, capabilityId) {
    return rows.find((row) => row.capability === capabilityId) ?? null;
}

function clampUnit(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 1) return fallback;
    return number;
}

export function mergeProfile(rows = []) {
    const merged = CAPABILITIES.map((capability) => {
        const stored = storedFor(rows, capability.id);
        const engineId = stored && isEngineAllowed(capability.id, stored.engineId)
            ? stored.engineId
            : defaultEngineFor(capability.id);

        return {
            capability: capability.id,
            label: capability.label,
            enabled: stored ? stored.enabled === true : capability.defaultEnabled === true,
            engineId,
            threshold: clampUnit(stored?.threshold, capability.defaultThreshold),
            minSize: clampUnit(stored?.minSize, 0),
            sensitive: capability.sensitive === true
        };
    });

    return applyDependencies(merged);
}

export function applyDependencies(entries) {
    const byId = new Map(entries.map((entry) => [entry.capability, entry]));

    for (const entry of entries) {
        const capability = findCapability(entry.capability);
        if (!capability?.requires) continue;
        const parent = byId.get(capability.requires);
        if (entry.enabled && (!parent || !parent.enabled)) {
            entry.enabled = false;
            entry.blockedBy = capability.requires;
        }
    }

    return entries;
}

export function activeEntries(entries) {
    return entries.filter((entry) => entry.enabled === true);
}

export function acceptedClasses(entries) {
    const classes = new Set();
    for (const entry of activeEntries(entries)) {
        const capability = findCapability(entry.capability);
        for (const className of capability?.classes ?? []) classes.add(className);
    }
    return classes;
}

function objectClasses(entries) {
    const classes = new Set();
    for (const entry of activeEntries(entries)) {
        const capability = findCapability(entry.capability);
        if (capability?.task !== 'objects') continue;
        for (const className of capability.classes) classes.add(className);
    }

    const plate = entries.find((entry) => entry.capability === Capability.PLATE);
    if (plate?.enabled) {
        for (const className of findCapability(Capability.VEHICLE).classes) classes.add(className);
    }

    return [...classes];
}

export function requiredEngines(entries) {
    return [...new Set(activeEntries(entries)
        .map((entry) => entry.engineId)
        .filter((id) => id !== null && id !== undefined))];
}

export function requiredModels(entries) {
    return modelsRequiredBy(requiredEngines(entries));
}

export function needsWorker(entries) {
    return activeEntries(entries).some((entry) => findEngine(entry.engineId)?.runtime === 'python');
}

function taskEntry(entries, capabilityId) {
    return entries.find((entry) => entry.capability === capabilityId && entry.enabled === true) ?? null;
}

export function buildWorkerProfile(entries, modelFiles = {}) {
    const fileFor = (engineId) => {
        const engine = findEngine(engineId);
        if (!engine || engine.models.length === 0) return null;
        return modelFiles[engine.models[0]] ?? null;
    };

    const classes = objectClasses(entries);
    const objectEntry = activeEntries(entries).find((entry) => findCapability(entry.capability)?.task === 'objects')
        ?? (taskEntry(entries, Capability.PLATE) ? { engineId: defaultEngineFor(Capability.VEHICLE), threshold: 0.4, minSize: 0 } : null);

    const faceDetect = taskEntry(entries, Capability.FACE_DETECT);
    const faceRecognize = taskEntry(entries, Capability.FACE_RECOGNIZE);
    const plate = taskEntry(entries, Capability.PLATE);

    const objectThreshold = Math.min(...activeEntries(entries)
        .filter((entry) => findCapability(entry.capability)?.task === 'objects')
        .map((entry) => entry.threshold)
        .concat(objectEntry ? [objectEntry.threshold ?? 0.4] : []));

    return {
        tasks: {
            objects: {
                enabled: classes.length > 0 && objectEntry !== null,
                engine: objectEntry?.engineId ?? null,
                model: objectEntry ? fileFor(objectEntry.engineId) : null,
                threshold: Number.isFinite(objectThreshold) ? objectThreshold : 0.4,
                minSize: objectEntry?.minSize ?? 0,
                classes
            },
            faces: {
                enabled: faceDetect !== null,
                engine: faceDetect?.engineId ?? null,
                model: faceDetect ? fileFor(faceDetect.engineId) : null,
                threshold: faceDetect?.threshold ?? 0.6,
                minSize: faceDetect?.minSize ?? 0,
                embed: faceRecognize !== null,
                embedEngine: faceRecognize?.engineId ?? null,
                embedModel: faceRecognize ? fileFor(faceRecognize.engineId) : null
            },
            plates: {
                enabled: plate !== null,
                engine: plate?.engineId ?? null,
                model: plate ? fileFor(plate.engineId) : null,
                threshold: plate?.threshold ?? 0.35
            }
        }
    };
}

export function faceMatchThreshold(entries) {
    const entry = taskEntry(entries, Capability.FACE_RECOGNIZE);
    return entry ? entry.threshold : null;
}
