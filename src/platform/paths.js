import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP_DIR_NAME = 'argus-pr';

export const projectRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

function isWritable(target) {
    const probe = path.join(target, '.argus-write-test');
    const outcome = (() => {
        try {
            fs.mkdirSync(target, { recursive: true });
            fs.writeFileSync(probe, 'ok');
            fs.unlinkSync(probe);
            return true;
        } catch {
            return false;
        }
    })();
    return outcome;
}

function windowsDataDir() {
    const programData = process.env.PROGRAMDATA;
    if (programData) {
        const candidate = path.join(programData, 'ARGUS-PR');
        if (isWritable(candidate)) return candidate;
    }
    return path.join(process.env.APPDATA ?? os.homedir(), 'ARGUS-PR');
}

function linuxDataDir() {
    const systemDir = path.join('/var/lib', APP_DIR_NAME);
    if (isWritable(systemDir)) return systemDir;
    const xdg = process.env.XDG_DATA_HOME;
    if (xdg) return path.join(xdg, APP_DIR_NAME);
    return path.join(os.homedir(), '.local', 'share', APP_DIR_NAME);
}

function darwinDataDir() {
    return path.join(os.homedir(), 'Library', 'Application Support', 'ARGUS-PR');
}

export function defaultDataDir() {
    if (process.platform === 'win32') return windowsDataDir();
    if (process.platform === 'darwin') return darwinDataDir();
    return linuxDataDir();
}

export function defaultMediaDir(dataDir) {
    return path.join(dataDir, 'media');
}

export function ensureDir(target) {
    fs.mkdirSync(target, { recursive: true });
    return target;
}

export function ensureSecureDir(target) {
    fs.mkdirSync(target, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') {
        fs.chmodSync(target, 0o700);
    }
    return target;
}

export function resolveInside(root, ...segments) {
    const base = path.resolve(root);
    const candidate = path.resolve(base, ...segments);
    const normalisedBase = base.endsWith(path.sep) ? base : base + path.sep;
    if (candidate !== base && !candidate.startsWith(normalisedBase)) return null;
    return candidate;
}
