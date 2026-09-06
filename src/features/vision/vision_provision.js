import { createHash } from 'node:crypto';
import { createWriteStream, readFileSync, existsSync, statSync } from 'node:fs';
import { mkdir, rename, copyFile, unlink } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function loadCatalog(catalogPath) {
    const raw = readFileSync(catalogPath, 'utf8');
    return JSON.parse(raw);
}

export function computeFileSha256(filePath) {
    if (!existsSync(filePath)) return null;
    const buffer = readFileSync(filePath);
    return createHash('sha256').update(buffer).digest('hex').toLowerCase();
}

export function modelSources(model, catalog = {}) {
    const listed = Array.isArray(model.sources) ? model.sources : [];
    const legacy = typeof model.url === 'string' ? [model.url] : [];
    const mirror = typeof catalog.mirror === 'string' ? [`${catalog.mirror}/${model.filename}`] : [];
    return [...new Set([...listed, ...legacy, ...mirror])];
}

export function bundlePath(model, catalog = {}, root = process.cwd()) {
    if (typeof catalog.bundleDir !== 'string' || catalog.bundleDir.length === 0) return null;
    const dir = isAbsolute(catalog.bundleDir) ? catalog.bundleDir : join(root, catalog.bundleDir);
    return join(dir, model.filename);
}

export function modelState(model, modelsDir, catalog = {}, root = process.cwd()) {
    const target = join(modelsDir, model.filename);
    const bundle = bundlePath(model, catalog, root);

    const installedHash = computeFileSha256(target);
    const installed = installedHash !== null;
    const valid = installed && installedHash === model.sha256.toLowerCase();

    return {
        name: model.name,
        filename: model.filename,
        license: model.license ?? 'sconosciuta',
        size: model.size ?? (installed ? statSync(target).size : null),
        installed,
        valid,
        corrupted: installed && !valid,
        bundled: bundle !== null && existsSync(bundle),
        sources: modelSources(model, catalog),
        path: target
    };
}

async function downloadTo(url, tempPath, expected) {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

    const hash = createHash('sha256');
    const stream = createWriteStream(tempPath);
    const reader = response.body.getReader();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
        stream.write(value);
    }

    await new Promise((resolve, reject) => {
        stream.end();
        stream.on('finish', resolve);
        stream.on('error', reject);
    });

    const actual = hash.digest('hex').toLowerCase();
    if (actual !== expected) throw new Error(`impronta non corrispondente (attesa ${expected.slice(0, 12)}, ottenuta ${actual.slice(0, 12)})`);
}

export async function ensureModel(model, modelsDir, options = {}) {
    const catalog = options.catalog ?? {};
    const root = options.root ?? process.cwd();
    const expected = model.sha256.toLowerCase();

    await mkdir(modelsDir, { recursive: true });
    const targetPath = join(modelsDir, model.filename);

    if (computeFileSha256(targetPath) === expected) {
        return { name: model.name, path: targetPath, status: 'verified', source: 'locale' };
    }

    const bundle = bundlePath(model, catalog, root);
    if (bundle && computeFileSha256(bundle) === expected) {
        await copyFile(bundle, targetPath);
        return { name: model.name, path: targetPath, status: 'installed', source: 'incluso' };
    }

    const tempPath = `${targetPath}.tmp`;
    const failures = [];

    for (const url of modelSources(model, catalog)) {
        const outcome = await downloadTo(url, tempPath, expected)
            .then(() => null)
            .catch((error) => error);

        if (!outcome) {
            await rename(tempPath, targetPath);
            return { name: model.name, path: targetPath, status: 'downloaded', source: url };
        }

        failures.push(`${url}: ${outcome.message}`);
        await unlink(tempPath).catch(() => undefined);
    }

    throw new Error(`Nessuna origine disponibile per ${model.name}. ${failures.join(' | ')}`);
}

export async function ensureModels(names, modelsDir, options = {}) {
    const catalog = options.catalog ?? {};
    const wanted = Array.isArray(names) && names.length > 0
        ? catalog.models.filter((model) => names.includes(model.name))
        : catalog.models;

    const results = [];
    for (const model of wanted) {
        const outcome = await ensureModel(model, modelsDir, options)
            .then((result) => result)
            .catch((error) => ({ name: model.name, status: 'failed', error: error.message }));
        results.push(outcome);
    }
    return results;
}

export async function probePythonEnvironment(pythonBin = 'python') {
    try {
        const workerScript = join(process.cwd(), 'vision', 'worker.py');
        const { stdout } = await execFileAsync(pythonBin, [workerScript, '--probe']);
        const res = JSON.parse(stdout);
        return { available: Boolean(res.ok), providers: res.providers ?? [], error: res.error ?? null };
    } catch (err) {
        return { available: false, providers: [], error: err.message };
    }
}
