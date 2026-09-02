import fs from 'node:fs';
import path from 'node:path';
import { resolveInside } from '../platform/paths.js';

const MIME = Object.freeze({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.mp4': 'video/mp4',
    '.m4s': 'video/iso.segment',
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.txt': 'text/plain; charset=utf-8'
});

function mimeFor(target) {
    return MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream';
}

function parseRange(header, size) {
    if (typeof header !== 'string' || !header.startsWith('bytes=')) return null;

    const spec = header.slice(6).split(',')[0].trim();
    const dash = spec.indexOf('-');
    if (dash < 0) return null;

    const startText = spec.slice(0, dash).trim();
    const endText = spec.slice(dash + 1).trim();

    if (startText.length === 0) {
        const suffix = Number.parseInt(endText, 10);
        if (!Number.isInteger(suffix) || suffix <= 0) return null;
        const start = Math.max(0, size - suffix);
        return { start, end: size - 1 };
    }

    const start = Number.parseInt(startText, 10);
    if (!Number.isInteger(start) || start >= size) return null;

    const end = endText.length === 0 ? size - 1 : Number.parseInt(endText, 10);
    if (!Number.isInteger(end) || end < start) return null;

    return { start, end: Math.min(end, size - 1) };
}

export function serveFile(req, res, root, relativePath, options = {}) {
    const absolute = resolveInside(root, relativePath);
    if (!absolute) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return true;
    }

    const stat = (() => {
        try {
            const found = fs.statSync(absolute);
            return found.isFile() ? found : null;
        } catch {
            return null;
        }
    })();

    if (!stat) return false;

    const headers = {
        'Content-Type': mimeFor(absolute),
        'Accept-Ranges': 'bytes',
        'Cache-Control': options.cacheControl ?? 'no-cache',
        'Last-Modified': stat.mtime.toUTCString()
    };

    const range = parseRange(req.headers.range, stat.size);

    if (range) {
        headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
        headers['Content-Length'] = range.end - range.start + 1;
        res.writeHead(206, headers);
        if (req.method === 'HEAD') {
            res.end();
            return true;
        }
        fs.createReadStream(absolute, { start: range.start, end: range.end }).pipe(res);
        return true;
    }

    if (req.headers.range && !range) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return true;
    }

    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
        res.end();
        return true;
    }
    fs.createReadStream(absolute).pipe(res);
    return true;
}
