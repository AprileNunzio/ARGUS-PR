import { validationError } from '../../kernel/errors.js';

const ALLOWED = new Set(['rtsp:', 'rtsps:', 'http:', 'https:']);

export function authenticatedStreamUrl(rawUrl, username, password) {
    if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
        throw validationError('Stream URL is missing');
    }

    const parsed = (() => {
        try {
            return new URL(rawUrl);
        } catch {
            return null;
        }
    })();

    if (!parsed) throw validationError('Stream URL is malformed');
    if (!ALLOWED.has(parsed.protocol)) throw validationError('Stream URL uses an unsupported scheme');

    if (username) {
        parsed.username = encodeURIComponent(username);
        parsed.password = password ? encodeURIComponent(password) : '';
    }

    return parsed.toString();
}
