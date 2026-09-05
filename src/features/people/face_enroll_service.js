import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { validationError } from '../../kernel/errors.js';
import { resolvePythonBin } from '../vision/vision_process.js';

const execFileAsync = promisify(execFile);

const ENROLL_TIMEOUT_MS = 45000;
const ENROLL_MAX_BUFFER = 24 * 1024 * 1024;

function parseWorkerPayload(raw) {
    if (typeof raw !== 'string') return null;
    const start = raw.indexOf('{');
    if (start < 0) return null;
    try {
        return JSON.parse(raw.slice(start));
    } catch {
        return null;
    }
}

function describeFailure(error) {
    const payload = parseWorkerPayload(error?.stdout);
    if (payload && typeof payload.error === 'string') return payload.error;
    if (error?.code === 'ENOENT') return 'Interprete Python del motore vision non trovato: completa il provisioning in Impostazioni > Vision.';
    if (error?.killed) return 'Analisi biometrica interrotta per timeout.';
    const stderr = String(error?.stderr ?? '').trim();
    if (stderr.length > 0) return stderr.slice(0, 300);
    return 'Analisi biometrica non riuscita.';
}

export function createFaceEnrollService({ config }) {
    const dataDir = config?.dataDir ?? process.env.ARGUS_DATA_DIR ?? join(process.cwd(), 'data');
    const modelsDir = join(dataDir, 'models');
    const workerScript = join(process.cwd(), 'vision', 'worker.py');

    async function runWorker(imagePath) {
        const pythonBin = resolvePythonBin(dataDir);
        const args = [workerScript, '--models-dir', modelsDir, '--enroll', imagePath];
        const options = { timeout: ENROLL_TIMEOUT_MS, maxBuffer: ENROLL_MAX_BUFFER, shell: false };

        const outcome = await execFileAsync(pythonBin, args, options).catch((error) => ({ failure: error }));
        if (outcome.failure) throw validationError(describeFailure(outcome.failure));

        const payload = parseWorkerPayload(outcome.stdout);
        if (!payload) throw validationError('Il motore vision ha restituito una risposta non valida.');
        if (!payload.ok) throw validationError(payload.error ?? 'Rilevamento volto non riuscito.');
        return payload;
    }

    return {
        async extractFromBase64(imageBase64) {
            const cleanBase64 = imageBase64.replace(/^data:image\/[a-z0-9.+]+;base64,/, '');
            const buffer = Buffer.from(cleanBase64, 'base64');
            if (buffer.length === 0) throw validationError('Immagine non valida.');

            const tempPath = join(dataDir, `face_enroll_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
            await writeFile(tempPath, buffer);
            try {
                return await runWorker(tempPath);
            } finally {
                await unlink(tempPath).catch(() => undefined);
            }
        }
    };
}
