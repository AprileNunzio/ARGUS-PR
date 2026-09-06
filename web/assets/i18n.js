import { api } from './api.js';

const catalogs = new Map();
let activeLocale = 'it';
let fallbackLocale = 'en';
let availableLocales = [];

export function getLocale() {
    return activeLocale;
}

export function getAvailableLocales() {
    return [...availableLocales];
}

export async function initI18n() {
    const saved = localStorage.getItem('argus_locale');
    const browserLang = (navigator.language || '').slice(0, 2).toLowerCase();

    try {
        const manifest = await api.get('/api/i18n/manifest');
        availableLocales = manifest.supportedLocales ?? [];
        fallbackLocale = manifest.fallbackLocale ?? 'en';
        
        const candidate = saved || (availableLocales.some((l) => l.code === browserLang) ? browserLang : manifest.defaultLocale);
        activeLocale = candidate || 'it';
    } catch {
        activeLocale = 'it';
    }

    await Promise.allSettled([
        loadNamespace('common'),
        loadNamespace('shell')
    ]);
}

export async function setLocale(locale) {
    if (locale === activeLocale) return;
    activeLocale = locale;
    localStorage.setItem('argus_locale', locale);
    catalogs.clear();

    await Promise.allSettled([
        loadNamespace('common'),
        loadNamespace('shell')
    ]);

    window.dispatchEvent(new CustomEvent('argus:locale-changed', { detail: { locale } }));
}

export async function loadNamespace(namespace) {
    const key = activeLocale + ':' + namespace;
    if (catalogs.has(key)) {
        return catalogs.get(key);
    }

    try {
        const data = await api.get('/api/i18n/' + encodeURIComponent(activeLocale) + '/' + encodeURIComponent(namespace));
        catalogs.set(key, data);
        return data;
    } catch {
        if (activeLocale !== fallbackLocale) {
            try {
                const fallbackData = await api.get('/api/i18n/' + encodeURIComponent(fallbackLocale) + '/' + encodeURIComponent(namespace));
                catalogs.set(key, fallbackData);
                return fallbackData;
            } catch {
                catalogs.set(key, {});
                return {};
            }
        }
        catalogs.set(key, {});
        return {};
    }
}

export function t(path, defaultOrParams, paramsObj) {
    if (!path || typeof path !== 'string') return '';
    const dotIndex = path.indexOf('.');
    const namespace = dotIndex !== -1 ? path.slice(0, dotIndex) : 'common';
    const key = dotIndex !== -1 ? path.slice(dotIndex + 1) : path;

    let fallback = null;
    let params = {};
    if (typeof defaultOrParams === 'string') {
        fallback = defaultOrParams;
        params = paramsObj || {};
    } else if (defaultOrParams && typeof defaultOrParams === 'object') {
        params = defaultOrParams;
    }

    const catalogKey = activeLocale + ':' + namespace;
    const catalog = catalogs.get(catalogKey);
    let value = catalog ? catalog[key] : null;

    if (!value && activeLocale !== fallbackLocale) {
        const fallbackCatalog = catalogs.get(fallbackLocale + ':' + namespace);
        value = fallbackCatalog ? fallbackCatalog[key] : null;
    }

    if (typeof value !== 'string') {
        if (fallback !== null) return fallback.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, placeholder) => {
            return params[placeholder] !== undefined ? String(params[placeholder]) : '{' + placeholder + '}';
        });
        return path;
    }

    return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, placeholder) => {
        return params[placeholder] !== undefined ? String(params[placeholder]) : '{' + placeholder + '}';
    });
}
