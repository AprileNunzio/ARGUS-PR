import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from './paths.js';

let cached = null;

export function readPackageVersion() {
    if (cached) return cached;

    cached = (() => {
        try {
            const raw = fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8');
            return JSON.parse(raw).version ?? '0.0.0';
        } catch {
            return '0.0.0';
        }
    })();

    return cached;
}
