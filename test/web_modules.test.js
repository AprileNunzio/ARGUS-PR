import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const WEB_ROOT = resolve(process.cwd(), 'web');

function walk(directory) {
    const found = [];
    for (const entry of readdirSync(directory)) {
        const full = join(directory, entry);
        if (statSync(full).isDirectory()) found.push(...walk(full));
        else if (entry.endsWith('.js')) found.push(full);
    }
    return found;
}

function exportedNames(source) {
    const names = new Set();

    for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)) names.add(match[1]);
    for (const match of source.matchAll(/export\s+(?:const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) names.add(match[1]);

    for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
        for (const entry of match[1].split(',')) {
            const parts = entry.trim().split(/\s+as\s+/);
            const name = (parts[1] ?? parts[0]).trim();
            if (name.length > 0) names.add(name);
        }
    }

    return names;
}

function importsOf(source) {
    const found = [];

    for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
        const names = match[1]
            .split(',')
            .map((entry) => entry.trim().split(/\s+as\s+/)[0].trim())
            .filter((entry) => entry.length > 0);
        found.push({ names, specifier: match[2] });
    }

    return found;
}

function resolveSpecifier(specifier, fromFile) {
    if (specifier.startsWith('/')) return join(WEB_ROOT, specifier.slice(1));
    if (specifier.startsWith('.')) return resolve(dirname(fromFile), specifier);
    return null;
}

const files = walk(WEB_ROOT);
const cache = new Map();

function exportsFor(file) {
    if (!cache.has(file)) cache.set(file, exportedNames(readFileSync(file, 'utf8')));
    return cache.get(file);
}

test('ogni modulo dell interfaccia importa simboli che esistono davvero', () => {
    const problems = [];

    for (const file of files) {
        const source = readFileSync(file, 'utf8');

        for (const entry of importsOf(source)) {
            const target = resolveSpecifier(entry.specifier, file);
            if (!target) continue;

            if (!existsSync(target)) {
                problems.push(`${file}: modulo assente ${entry.specifier}`);
                continue;
            }

            const available = exportsFor(target);
            for (const name of entry.names) {
                if (!available.has(name)) problems.push(`${file}: ${entry.specifier} non esporta ${name}`);
            }
        }
    }

    assert.deepEqual(problems, []);
});

test('nessuna finestra di dialogo del browser nell interfaccia', () => {
    const offenders = [];

    for (const file of files) {
        const source = readFileSync(file, 'utf8');
        const masked = source.replace(/confirmPanel|confirmHost|confirmButton|confirmLabel|confirmSlot/g, 'x');
        if (/(?:window\s*\.\s*)?\b(confirm|alert|prompt)\s*\(/.test(masked)) {
            offenders.push(file);
        }
    }

    assert.deepEqual(offenders, []);
});

test('nessun file dell interfaccia supera le 500 righe', () => {
    const oversized = files
        .map((file) => ({ file, lines: readFileSync(file, 'utf8').split('\n').length }))
        .filter((entry) => entry.lines > 500)
        .map((entry) => `${entry.file}: ${entry.lines}`);

    assert.deepEqual(oversized, []);
});
