import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { createLogger, describeError } from '../kernel/logger.js';
import { AppError, ErrorCode, fromUnknown, unauthenticated, forbidden } from '../kernel/errors.js';
import { onShutdown } from '../kernel/process_guard.js';
import { projectRoot } from '../platform/paths.js';
import { ensureTlsMaterial, secureContextOptions } from '../platform/tls.js';
import { resolveSession } from '../security/sessions.js';
import { can, Permission } from '../security/rbac.js';
import { classify, allowsZone, Zone, Exposure, isTrustedZone } from '../security/net_zones.js';
import { emitSecurityEvent, SecurityEvent } from '../security/security_events.js';
import { remoteAccessEnabled, trustedNetworksFor } from '../features/settings/settings_service.js';
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
const WAN_RATE_DIVISOR = 4;
const WAN_REQUEST_LIMIT = Object.freeze({ limit: 240, windowMs: 60000 });
const PROBE_PATTERN = /(\.env|\.git|wp-|\.php|cgi-bin|\.asp|\.ssh|passwd|shadow|xmlrpc|phpmyadmin|\.\.)/i;

function applyBaseHeaders(req, res) {
    for (const [name, value] of Object.entries(securityHeaders(req.socket.encrypted === true))) {
        res.setHeader(name, value);
    }
}

function authenticate(req) {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    if (!token) return null;
    const actor = resolveSession(token);
    return actor ? { actor, token } : null;
}

function enforceRateLimit(route, address, zone) {
    if (!route.rateLimit) return;

    const limit = zone === Zone.WAN
        ? Math.max(1, Math.floor(route.rateLimit.limit / WAN_RATE_DIVISOR))
        : route.rateLimit.limit;

    const key = `${route.method}:${route.segments.map((segment) => segment.literal ?? ':').join('/')}:${address}`;
    const outcome = consume(key, limit, route.rateLimit.windowMs);
    if (outcome.allowed) return;

    emitSecurityEvent(SecurityEvent.RATE_LIMITED, { address, zone });
    throw new AppError(ErrorCode.RATE_LIMITED, 'Too many attempts. Try again later.', {
        details: { retryAfterSeconds: Math.ceil(outcome.retryAfterMs / 1000) }
    });
}

function enforceWanBudget(address, zone) {
    if (zone !== Zone.WAN) return;

    const outcome = consume(`wan:${address}`, WAN_REQUEST_LIMIT.limit, WAN_REQUEST_LIMIT.windowMs);
    if (outcome.allowed) return;

    emitSecurityEvent(SecurityEvent.RATE_LIMITED, { address, zone, detail: 'wan budget' });
    throw new AppError(ErrorCode.RATE_LIMITED, 'Too many requests from this address', {
        details: { retryAfterSeconds: Math.ceil(outcome.retryAfterMs / 1000) }
    });
}

function enforceZone(route, zone, actor, address, method, pathname) {
    if (allowsZone(route.exposure, zone)) return;

    if (!actor) {
        emitSecurityEvent(SecurityEvent.ZONE_DENIED, { address, zone, method, path: pathname });
    }

    throw forbidden('This function is not reachable from outside the local network');
}

function enforceSessionZone(actor, zone, address) {
    if (!actor || zone !== Zone.WAN) return;

    if (isTrustedZone(actor.issuedZone)) {
        emitSecurityEvent(SecurityEvent.ZONE_DENIED, {
            address,
            zone,
            username: actor.username,
            detail: 'session issued on the local network'
        });
        throw unauthenticated('Session not valid from this network');
    }

    if (can(actor.role, Permission.SYSTEM_MANAGE)) {
        emitSecurityEvent(SecurityEvent.ADMIN_FROM_WAN, { address, zone, username: actor.username });
        throw forbidden('Administrative accounts cannot be used from outside the local network');
    }
}

export function resolveZone(req, config) {
    const address = clientAddress(req, config.trustProxy);
    return { address, zone: classify(address, trustedNetworksFor(config)) };
}

async function dispatch(router, req, res, config) {
    const url = new URL(req.url, `https://${req.headers.host ?? 'localhost'}`);
    const { address, zone } = resolveZone(req, config);

    if (zone === Zone.WAN && !remoteAccessEnabled(config)) {
        emitSecurityEvent(SecurityEvent.ZONE_DENIED, {
            address,
            zone,
            method: req.method,
            path: url.pathname,
            detail: 'remote access disabled'
        });
        throw forbidden('Remote access is disabled');
    }

    enforceWanBudget(address, zone);

    if (MUTATING_METHODS.has(req.method) && !sameOriginOk(req)) {
        emitSecurityEvent(SecurityEvent.ORIGIN_REJECTED, { address, zone, method: req.method, path: url.pathname });
        throw forbidden('Cross-origin request rejected');
    }

    if (!url.pathname.startsWith('/api/')) {
        const relative = PAGE_ALIASES.get(url.pathname) ?? url.pathname.slice(1);
        if (serveFile(req, res, WEB_ROOT, relative)) return;

        if (PROBE_PATTERN.test(url.pathname)) {
            emitSecurityEvent(SecurityEvent.PROBE, { address, zone, method: req.method, path: url.pathname });
            throw new AppError(ErrorCode.NOT_FOUND, 'Not found');
        }

        if (serveFile(req, res, WEB_ROOT, 'index.html')) return;
        throw new AppError(ErrorCode.NOT_FOUND, 'Not found');
    }

    const { route, params } = router.resolve(req.method, url.pathname);

    const session = authenticate(req);
    const actor = session?.actor ?? null;

    enforceSessionZone(actor, zone, address);
    enforceZone(route, zone, actor, address, req.method, url.pathname);
    enforceRateLimit(route, address, zone);

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
        zone,
        config
    };

    const outcome = await route.handler(context);
    if (res.writableEnded) return;
    if (outcome && outcome.raw === true) return;

    sendJson(res, outcome?.status ?? 200, outcome?.body ?? { ok: true }, outcome?.headers ?? {});
}

function handleFailure(res, error, address, method, pathname) {
    const appError = fromUnknown(error);

    if (appError.status >= 500) {
        log.error('request failed', { method, path: pathname, address, error: describeError(appError) });
    } else {
        log.warn('request rejected', { method, path: pathname, address, code: appError.code, message: appError.message });
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

    const material = ensureTlsMaterial(config);

    const server = https.createServer(secureContextOptions(material), (req, res) => {
        applyBaseHeaders(req, res);
        const pathname = (req.url ?? '/').split('?')[0];

        dispatch(router, req, res, config).catch((error) => {
            handleFailure(res, error, clientAddress(req, config.trustProxy), req.method, pathname);
        });
    });

    server.headersTimeout = 20000;
    server.requestTimeout = 60000;
    server.maxHeadersCount = 64;

    onShutdown('http-server', () => new Promise((resolve) => {
        server.close(() => resolve());
        setTimeout(resolve, 3000).unref();
    }));

    return { server, router, tls: material };
}

function redirectTarget(req, config) {
    const rawHost = String(req.headers.host ?? '').split(':')[0];
    if (!/^[a-z0-9.-]{1,253}$/i.test(rawHost)) return null;

    const suffix = config.port === 443 ? '' : `:${config.port}`;
    return `https://${rawHost}${suffix}${req.url ?? '/'}`;
}

export function createRedirectServer(config) {
    const server = http.createServer((req, res) => {
        const { address, zone } = resolveZone(req, config);

        if (PROBE_PATTERN.test(req.url ?? '')) {
            emitSecurityEvent(SecurityEvent.PROBE, { address, zone, method: req.method, path: req.url });
        }

        const target = redirectTarget(req, config);

        if (!target) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
            res.end('Bad request\n');
            return;
        }

        res.writeHead(308, {
            Location: target,
            'Content-Length': '0',
            'Cache-Control': 'no-store',
            Connection: 'close'
        });
        res.end();
    });

    server.headersTimeout = 5000;
    server.requestTimeout = 10000;

    onShutdown('http-redirect', () => new Promise((resolve) => {
        server.close(() => resolve());
        setTimeout(resolve, 2000).unref();
    }));

    return server;
}

export function listen(server, config) {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, () => {
            server.off('error', reject);
            log.info('listening', { host: config.host, port: config.port, tls: true });
            resolve();
        });
    });
}

export function listenRedirect(server, config) {
    return new Promise((resolve) => {
        server.once('error', (error) => {
            log.warn('redirect port unavailable', { port: config.httpPort, message: error.message });
            resolve(false);
        });
        server.listen(config.httpPort, config.host, () => {
            log.info('redirect listening', { host: config.host, port: config.httpPort });
            resolve(true);
        });
    });
}

export { Exposure };
