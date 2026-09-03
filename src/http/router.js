import { notFound } from '../kernel/errors.js';
import { Exposure } from '../security/net_zones.js';

function compile(pattern) {
    const segments = pattern.split('/').filter((segment) => segment.length > 0);
    return segments.map((segment) => (
        segment.startsWith(':')
            ? { param: segment.slice(1) }
            : { literal: segment }
    ));
}

export function createRouter() {
    const routes = [];

    function register(method, pattern, handler, options = {}) {
        routes.push({
            method,
            segments: compile(pattern),
            handler,
            permission: options.permission ?? null,
            anonymous: options.anonymous === true,
            rateLimit: options.rateLimit ?? null,
            exposure: options.exposure ?? Exposure.PRIVATE,
            allowWhilePasswordPending: options.allowWhilePasswordPending === true
        });
    }

    function match(method, pathname) {
        const parts = pathname.split('/').filter((segment) => segment.length > 0);

        for (const route of routes) {
            if (route.method !== method) continue;
            if (route.segments.length !== parts.length) continue;

            const params = {};
            let matched = true;

            for (let index = 0; index < route.segments.length; index += 1) {
                const segment = route.segments[index];
                const value = decodeURIComponent(parts[index]);
                if (segment.literal !== undefined) {
                    if (segment.literal !== value) {
                        matched = false;
                        break;
                    }
                    continue;
                }
                params[segment.param] = value;
            }

            if (matched) return { route, params };
        }

        return null;
    }

    return {
        get: (pattern, handler, options) => register('GET', pattern, handler, options),
        post: (pattern, handler, options) => register('POST', pattern, handler, options),
        put: (pattern, handler, options) => register('PUT', pattern, handler, options),
        patch: (pattern, handler, options) => register('PATCH', pattern, handler, options),
        delete: (pattern, handler, options) => register('DELETE', pattern, handler, options),
        resolve: (method, pathname) => {
            const found = match(method, pathname);
            if (!found) throw notFound('Route');
            return found;
        },
        has: (method, pathname) => match(method, pathname) !== null
    };
}
