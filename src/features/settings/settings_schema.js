import {
    SettingType,
    RestartPolicy,
    getAllGroups,
    getAllSettings,
    getSettingDefinition,
    registerFeatureManifest
} from './settings_registry.js';

export { SettingType, RestartPolicy, registerFeatureManifest };

export const GROUPS = Object.freeze(getAllGroups());

export const SETTINGS = Object.freeze(getAllSettings());

export function definitionFor(key) {
    return getSettingDefinition(key);
}

export function defaults() {
    const values = {};
    for (const entry of getAllSettings()) values[entry.key] = entry.default;
    return values;
}

export function keys() {
    return getAllSettings().map((entry) => entry.key);
}
