import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppError, ErrorCode } from '../../kernel/errors.js';

const run = promisify(execFile);
const EXTRACT_TIMEOUT_MS = 180000;

async function extractZipWindows(archive, destination) {
    await run('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath '${archive.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`
    ], { timeout: EXTRACT_TIMEOUT_MS, windowsHide: true, shell: false });
}

async function extractTar(archive, destination) {
    await run('tar', ['-xf', archive, '-C', destination], {
        timeout: EXTRACT_TIMEOUT_MS,
        windowsHide: true,
        shell: false
    });
}

export async function extractArchive(archive, destination) {
    fs.mkdirSync(destination, { recursive: true });

    const isZip = archive.toLowerCase().endsWith('.zip');

    const outcome = await (isZip && process.platform === 'win32'
        ? extractZipWindows(archive, destination)
        : extractTar(archive, destination))
        .then(() => null)
        .catch((error) => error);

    if (outcome) {
        throw new AppError(ErrorCode.DEPENDENCY, 'Archive extraction failed', { cause: outcome });
    }

    return destination;
}

export function findBinary(root, name, maxDepth = 4) {
    const wanted = process.platform === 'win32' ? `${name}.exe` : name;
    const queue = [{ dir: root, depth: 0 }];

    while (queue.length > 0) {
        const { dir, depth } = queue.shift();
        if (depth > maxDepth) continue;

        const entries = (() => {
            try {
                return fs.readdirSync(dir, { withFileTypes: true });
            } catch {
                return [];
            }
        })();

        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                queue.push({ dir: full, depth: depth + 1 });
                continue;
            }
            if (entry.name.toLowerCase() === wanted.toLowerCase()) return full;
        }
    }

    return null;
}
