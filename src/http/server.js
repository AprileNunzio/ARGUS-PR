import http from 'node:http';
import path from 'node:path';
import { createLogger, describeError } from '../kernel/logger.js';
import { AppError, ErrorCode, fromUnknown, unauthenticated, forbidden } from '../kernel/errors.js';
import { onShutdown } from '../kernel/process_guard.js';
import { projectRoot } from '../platform/paths.js';
import { resolveSession } from '../security/sessions.js';
import { can } from '../security/rbac.js';
import { createRouter } from './router.js';
import { serveFile } from './static_files.js';
import { consume } from './rate_limit.js';
import {
    securityHeaders,
    clientAddress,
    parseCookies,
    readJsonBody,
    sendJson,
    sameOriginOk
} from './http_utils.js';

const log = createLogger('http');

export const SESSION_COOKIE = 'argus_session';

const WEB_ROOT = path.join(projectRoot, 'web');
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PAGE_ALIASES = new Map([['/', 'index.html'], ['/wall', 'wall.html'], ['/wall/', 'wall.html']]);

function applyBaseHeaders(req, res) {
    const secure = req.socket.encrypted === true;
    for (const [name, value] of Object.entries(securityHeaders(secure))) {
        res.setHeader(name, value);
    }
}

function authenticate(req) {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    if (!token) return null;
    return { actor: resolveSession(token), token };
}

function enforceRateLimit(route, req, address) {
    if (!route.rateLimit) return;
    const key = `${route.method}:${route.segments.map((s) => s.literal ?? ':').join('/')}:${address}`;
    const outcome = consume(key, route.rateLimit.limit, route.rateLimit.windowMs);
    if (outcome.allowed) return;
    throw new AppError(ErrorCode.RATE_LIMITED, 'Too many attempts. Try again later.', {
        details: { retryAfterSeconds: Math.ceil(outcome.retryAfterMs / 1000) }
    });
}

async function dispatch(router, req, res, config) {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const address = clientAddress(req, config.trustProxy);

    if (MUTATING_METHODS.has(req.method) && !sameOriginOk(req)) {
        throw forbidden('Cross-origin request rejected');
    }

    const isApi = url.pathname.startsWith('/api/');

    if (!isApi) {
        const relative = PAGE_ALIASES.get(url.pathname) ?? url.pathname.slice(1);
        if (serveFile(req, res, WEB_ROOT, relative)) return;
        if (serveFile(req, res, WEB_ROOT, 'index.html')) return;
        throw new AppError(ErrorCode.NOT_FOUND, 'Not found');
    }

    const { route, params } = router.resolve(req.method, url.pathname);

    enforceRateLimit(route, req, address);

    const session = authenticate(req);
    const actor = session?.actor ?? null;

    if (!route.anonymous) {
        if (!actor) throw unauthenticated();
        if (actor.mustChangePassword && !route.allowWhilePasswordPending) {
            throw new AppError(ErrorCode.FORBIDDEN, 'Change the initial password before using the system');
        }
        if (route.permission && !can(actor.role, route.permission)) {
            throw forbidden(`Missing permission: ${route.permission}`);
        }
    }

    const body = MUTATING_METHODS.has(req.method) ? await readJsonBody(req) : {};

    const context = {
        req,
        res,
        params,
        query: Object.fromEntries(url.searchParams),
        body,
        actor,
        sessionToken: session?.token ?? null,
        address,
        config
    };

    const outcome = await route.handler(context);
    if (res.writableEnded) return;

    if (outcome && outcome.raw === true) return;

    const status = outcome?.status ?? 200;
    const headers = outcome?.headers ?? {};
    sendJson(res, status, outcome?.body ?? { ok: true }, headers);
}

function handleFailure(res, error, address, method, pathname) {
    const appError = fromUnknown(error);

    if (appError.status >= 500) {
        log.error('request failed', {
            method,
            path: pathname,
            address,
            error: describeError(appError)
        });
    } else {
        log.warn('request rejected', {
            method,
            path: pathname,
            address,
            code: appError.code,
            message: appError.message
        });
    }

    if (res.writableEnded) return;

    const extra = appError.code === ErrorCode.RATE_LIMITED && appError.details?.retryAfterSeconds
        ? { 'Retry-After': String(appError.details.retryAfterSeconds) }
        : {};

    sendJson(res, appError.status, { error: appError.toPublic() }, extra);
}

export function createHttpServer(config, registerRoutes) {
    const router = createRouter();
    registerRoutes(router);

    const server = http.createServer((req, res) => {
        applyBaseHeaders(req, res);
        const pathname = (req.url ?? '/').split('?')[0];

        dispatch(router, req, res, config).catch((error) => {
            handleFailure(res, error, clientAddress(req, config.trustProxy), req.method, pathname);
        });
    });

    server.headersTimeout = 20000;
    server.requestTimeout = 60000;

    onShutdown('http-server', () => new Promise((resolve) => {
        server.close(() => resolve());
        setTimeout(resolve, 3000).unref();
    }));

    return { server, router };
}

export function listen(server, config) {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, () => {
            server.off('error', reject);
            log.info('listening', { host: config.host, port: config.port });
            resolve();
        });
    });
}
