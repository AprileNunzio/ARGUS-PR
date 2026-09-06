import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../../platform/paths.js';
import { AppError, ErrorCode } from '../../kernel/errors.js';

const LOCALES_ROOT = path.join(projectRoot, 'locales');
const LOCALE_REGEX = /^[a-z]{2}(-[A-Z]{2})?$/;
const NAMESPACE_REGEX = /^[a-z0-9_-]+$/;

const cache = new Map();

function assertValidLocale(locale) {
    if (typeof locale !== 'string' || !LOCALE_REGEX.test(locale)) {
        throw new AppError(ErrorCode.VALIDATION, 'Invalid locale code', { status: 400, exposable: true });
    }
}

function assertValidNamespace(namespace) {
    if (typeof namespace !== 'string' || !NAMESPACE_REGEX.test(namespace)) {
        throw new AppError(ErrorCode.VALIDATION, 'Invalid namespace identifier', { status: 400, exposable: true });
    }
}

function resolveSafeFile(targetPath) {
    const resolved = path.resolve(targetPath);
    const rootWithSep = LOCALES_ROOT.endsWith(path.sep) ? LOCALES_ROOT : LOCALES_ROOT + path.sep;
    if (resolved !== LOCALES_ROOT && !resolved.startsWith(rootWithSep)) {
        throw new AppError(ErrorCode.FORBIDDEN, 'Access denied', { status: 403, exposable: true });
    }
    return resolved;
}

export function readManifest() {
    const manifestPath = resolveSafeFile(path.join(LOCALES_ROOT, 'manifest.json'));
    if (!fs.existsSync(manifestPath)) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Locales manifest not found', { status: 404, exposable: true });
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (Array.isArray(manifest.supportedLocales)) {
        manifest.supportedLocales = manifest.supportedLocales.filter(loc => fs.existsSync(path.join(LOCALES_ROOT, loc.code)));
    }
    return manifest;
}

export function readCatalog(locale, namespace) {
    assertValidLocale(locale);
    assertValidNamespace(namespace);

    const cacheKey = locale + ':' + namespace;
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    const targetFile = resolveSafeFile(path.join(LOCALES_ROOT, locale, namespace + '.json'));
    if (!fs.existsSync(targetFile)) {
        const manifest = readManifest();
        if (locale !== manifest.fallbackLocale) {
            const fallbackFile = resolveSafeFile(path.join(LOCALES_ROOT, manifest.fallbackLocale, namespace + '.json'));
            if (fs.existsSync(fallbackFile)) {
                const data = JSON.parse(fs.readFileSync(fallbackFile, 'utf8'));
                cache.set(cacheKey, data);
                return data;
            }
        }
        throw new AppError(ErrorCode.NOT_FOUND, 'Translation catalog not found', { status: 404, exposable: true });
    }

    const catalog = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
    cache.set(cacheKey, catalog);
    return catalog;
}

export function clearCatalogCache() {
    cache.clear();
}
