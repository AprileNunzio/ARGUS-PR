import path from 'node:path';
import { ensureDir, resolveInside } from '../../platform/paths.js';
import { validationError } from '../../kernel/errors.js';

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const OUTPUT_NAME = 'video.mp4';
export const MANIFEST_NAME = 'manifest.json';
export const SEAL_NAME = 'manifest.sig';

export function assertExportId(id) {
    if (!ID_PATTERN.test(String(id ?? ''))) throw validationError('Identificativo esportazione non valido');
    return id;
}

export function exportsRoot(config) {
    const root = path.join(config.mediaDir, 'exports');
    ensureDir(root);
    return root;
}

export function exportDir(config, id) {
    assertExportId(id);
    return resolveInside(exportsRoot(config), id);
}

export function ensureExportDir(config, id) {
    const dir = exportDir(config, id);
    ensureDir(dir);
    return dir;
}

export function outputPath(config, id) {
    return path.join(exportDir(config, id), OUTPUT_NAME);
}

export function manifestPath(config, id) {
    return path.join(exportDir(config, id), MANIFEST_NAME);
}

export function sealPath(config, id) {
    return path.join(exportDir(config, id), SEAL_NAME);
}
