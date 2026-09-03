import { join } from 'node:path';
import { loadCatalog, modelState, ensureModels } from './vision_provision.js';
import { createLogger } from '../../kernel/logger.js';

const log = createLogger('vision-models');

let cached = null;

export function visionCatalog(root = process.cwd()) {
    if (!cached) cached = loadCatalog(join(root, 'vision', 'models_catalog.json'));
    return cached;
}

export function modelsDirFor(config) {
    return join(config.dataDir, 'models');
}

export function modelFiles(root = process.cwd()) {
    const catalog = visionCatalog(root);
    const files = {};
    for (const model of catalog.models) files[model.name] = model.filename;
    return files;
}

export function modelsOverview(config, root = process.cwd()) {
    const catalog = visionCatalog(root);
    const modelsDir = modelsDirFor(config);

    const models = catalog.models.map((model) => modelState(model, modelsDir, catalog, root));

    return {
        directory: modelsDir,
        mirror: catalog.mirror ?? null,
        bundleDir: catalog.bundleDir ?? null,
        models
    };
}

export function missingModels(names, config, root = process.cwd()) {
    const catalog = visionCatalog(root);
    const modelsDir = modelsDirFor(config);

    return catalog.models
        .filter((model) => names.includes(model.name))
        .map((model) => modelState(model, modelsDir, catalog, root))
        .filter((state) => !state.valid)
        .map((state) => state.name);
}

export async function installModels(names, config, root = process.cwd()) {
    const catalog = visionCatalog(root);
    const results = await ensureModels(names, modelsDirFor(config), { catalog, root });

    for (const result of results) {
        if (result.status === 'failed') log.warn('model install failed', { model: result.name, error: result.error });
        else log.info('model ready', { model: result.name, status: result.status, source: result.source });
    }

    return results;
}
