import { createHash, randomBytes } from 'node:crypto';

function md5(value) {
    return createHash('md5').update(value).digest('hex');
}

export function parseChallenge(header) {
    if (!header) return null;

    const scheme = /^\s*(\w+)/.exec(header)?.[1]?.toLowerCase() ?? '';
    const fields = {};
    const pattern = /(\w+)="?([^",]*)"?/g;
    let match = pattern.exec(header);

    while (match !== null) {
        fields[match[1].toLowerCase()] = match[2];
        match = pattern.exec(header);
    }

    return { scheme, fields };
}

export function basicHeader(username, password) {
    return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

export function digestHeader({ username, password, method, uri, challenge, nonceCount = 1 }) {
    const realm = challenge.fields.realm ?? '';
    const nonce = challenge.fields.nonce ?? '';
    const qop = (challenge.fields.qop ?? '').split(',').map((entry) => entry.trim()).find((entry) => entry === 'auth');

    const ha1 = md5(`${username}:${realm}:${password}`);
    const ha2 = md5(`${method}:${uri}`);

    const parts = [
        `username="${username}"`,
        `realm="${realm}"`,
        `nonce="${nonce}"`,
        `uri="${uri}"`
    ];

    if (!qop) {
        parts.push(`response="${md5(`${ha1}:${nonce}:${ha2}`)}"`);
    } else {
        const cnonce = randomBytes(8).toString('hex');
        const nc = String(nonceCount).padStart(8, '0');
        parts.push(`qop=auth`, `nc=${nc}`, `cnonce="${cnonce}"`);
        parts.push(`response="${md5(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`)}"`);
    }

    if (challenge.fields.opaque) parts.push(`opaque="${challenge.fields.opaque}"`);

    return `Digest ${parts.join(', ')}`;
}

export function authorisationFor({ challenge, username, password, method, uri, nonceCount }) {
    if (!username) return null;
    if (!challenge) return null;
    if (challenge.scheme === 'basic') return basicHeader(username, password);
    if (challenge.scheme === 'digest') return digestHeader({ username, password, method, uri, challenge, nonceCount });
    return null;
}
