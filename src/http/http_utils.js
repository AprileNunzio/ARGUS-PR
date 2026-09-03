import { validationError } from '../kernel/errors.js';

const MAX_BODY_BYTES = 1024 * 1024;

export function securityHeaders(isSecure) {
    const headers = {
        'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self'",
            "img-src 'self' data: blob:",
            "media-src 'self' blob:",
            "connect-src 'self' wss:",
            "font-src 'self'",
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'self'",
            "frame-ancestors 'none'"
        ].join('; '),
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'X-Permitted-Cross-Domain-Policies': 'none',
        'X-DNS-Prefetch-Control': 'off',
        'Origin-Agent-Cluster': '?1'
    };
    if (isSecure) {
        headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains';
    }
    return headers;
}

export function clientAddress(req, trustProxy) {
    if (trustProxy) {
        const forwarded = req.headers['x-forwarded-for'];
        if (typeof forwarded === 'string' && forwarded.length > 0) {
            return forwarded.split(',')[0].trim();
        }
    }
    return req.socket.remoteAddress ?? 'unknown';
}

export function parseCookies(header) {
    const jar = {};
    if (typeof header !== 'string') return jar;

    for (const part of header.split(';')) {
        const separator = part.indexOf('=');
        if (separator < 1) continue;
        jar[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim());
    }
    return jar;
}

export function buildCookie(name, value, options = {}) {
    const bits = [`${name}=${encodeURIComponent(value)}`];
    bits.push('Path=/');
    bits.push('HttpOnly');
    bits.push('SameSite=Strict');
    if (options.secure) bits.push('Secure');
    if (options.maxAge !== undefined) bits.push(`Max-Age=${options.maxAge}`);
    if (options.expires) bits.push(`Expires=${options.expires}`);
    return bits.join('; ');
}

export async function readJsonBody(req) {
    const chunks = [];
    let size = 0;

    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) throw validationError('Request body too large');
        chunks.push(chunk);
    }

    if (size === 0) return {};

    const raw = Buffer.concat(chunks).toString('utf8');
    try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw validationError('Request body must be a JSON object');
        }
        return parsed;
    } catch (error) {
        if (error.code === 'VALIDATION') throw error;
        throw validationError('Request body is not valid JSON');
    }
}

export function sendJson(res, status, payload, extraHeaders = {}) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
        ...extraHeaders
    });
    res.end(body);
}

export function sameOriginOk(req) {
    const fetchSite = req.headers['sec-fetch-site'];
    if (typeof fetchSite === 'string' && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;

    const origin = req.headers.origin;
    if (!origin) return true;

    const host = req.headers.host;
    if (!host) return false;

    const parsed = (() => {
        try {
            return new URL(origin);
        } catch {
            return null;
        }
    })();

    return parsed !== null && parsed.host === host;
}
