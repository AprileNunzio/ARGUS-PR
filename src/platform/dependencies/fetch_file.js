import fs from 'node:fs';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { AppError, ErrorCode } from '../../kernel/errors.js';

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 120000;

function assertHttps(url) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
        throw new AppError(ErrorCode.DEPENDENCY, 'Only HTTPS downloads are allowed');
    }
    return parsed;
}

async function openStream(url, redirects = 0) {
    if (redirects > MAX_REDIRECTS) {
        throw new AppError(ErrorCode.DEPENDENCY, 'Too many redirects while downloading');
    }

    assertHttps(url);

    const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { 'User-Agent': 'ARGUS-PR' }
    });

    if (!response.ok) {
        throw new AppError(ErrorCode.DEPENDENCY, `Download failed with status ${response.status}`);
    }

    return response;
}

export async function fetchText(url, maxBytes = 1024 * 1024) {
    const response = await openStream(url);
    const text = await response.text();
    if (text.length > maxBytes) {
        throw new AppError(ErrorCode.DEPENDENCY, 'Remote file is larger than expected');
    }
    return text;
}

export async function downloadToFile(url, destination, options = {}) {
    const maxBytes = options.maxBytes ?? 512 * 1024 * 1024;
    const onProgress = options.onProgress ?? null;

    const response = await openStream(url);
    const expectedTotal = Number.parseInt(response.headers.get('content-length') ?? '0', 10);

    const hash = crypto.createHash('sha256');
    let received = 0;
    let lastReport = 0;

    const meter = new Transform({
        transform(chunk, _encoding, callback) {
            received += chunk.length;
            if (received > maxBytes) {
                callback(new AppError(ErrorCode.DEPENDENCY, 'Download exceeded the maximum allowed size'));
                return;
            }
            hash.update(chunk);

            if (onProgress && Date.now() - lastReport > 400) {
                lastReport = Date.now();
                onProgress({ received, total: expectedTotal || null });
            }

            callback(null, chunk);
        }
    });

    await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(destination));

    if (onProgress) onProgress({ received, total: expectedTotal || received });

    return { bytes: received, sha256: hash.digest('hex') };
}

export function parseChecksumList(text, targetName) {
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;

        const parts = trimmed.split(/\s+/);
        if (parts.length < 2) continue;

        const name = parts[parts.length - 1].replace(/^\*/, '');
        if (name === targetName) return parts[0].toLowerCase();
    }
    return null;
}
