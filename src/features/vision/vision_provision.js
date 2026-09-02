import { createHash } from 'node:crypto';
import { createWriteStream, readFileSync, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
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

export async function ensureModel(model, modelsDir) {
    await mkdir(modelsDir, { recursive: true });
    const targetPath = join(modelsDir, model.filename);

    if (existsSync(targetPath)) {
        const actualHash = computeFileSha256(targetPath);
        if (actualHash === model.sha256.toLowerCase()) {
            return { name: model.name, path: targetPath, status: 'verified' };
        }
    }

    const res = await fetch(model.url);
    if (!res.ok) {
        throw new Error(`Failed to download ${model.name} (${res.status} ${res.statusText})`);
    }

    const tempPath = `${targetPath}.tmp`;
    const hash = createHash('sha256');
    const fileStream = createWriteStream(tempPath);

    const reader = res.body.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
        fileStream.write(value);
    }
    fileStream.end();

    const downloadedHash = hash.digest('hex').toLowerCase();
    if (downloadedHash !== model.sha256.toLowerCase()) {
        throw new Error(`Checksum mismatch for ${model.name}: expected ${model.sha256}, got ${downloadedHash}`);
    }

    const { rename } = await import('node:fs/promises');
    await rename(tempPath, targetPath);
    return { name: model.name, path: targetPath, status: 'downloaded' };
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
