import { validationError } from '../kernel/errors.js';

export const Zone = Object.freeze({
    LOCAL: 'local',
    LAN: 'lan',
    WAN: 'wan'
});

export const Exposure = Object.freeze({
    LOCAL: 'local',
    PRIVATE: 'private',
    PUBLIC: 'public'
});

const PRIVATE_NETWORKS = Object.freeze([
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '169.254.0.0/16',
    '100.64.0.0/10',
    'fc00::/7',
    'fe80::/10'
]);

const LOOPBACK_NETWORKS = Object.freeze(['127.0.0.0/8', '::1/128']);

function stripZone(address) {
    const index = address.indexOf('%');
    return index === -1 ? address : address.slice(0, index);
}

export function normaliseAddress(value) {
    const raw = stripZone(String(value ?? '').trim().toLowerCase());
    if (raw.length === 0) return null;
    if (raw.startsWith('[') && raw.endsWith(']')) return normaliseAddress(raw.slice(1, -1));
    if (raw.startsWith('::ffff:') && raw.includes('.')) return raw.slice(7);
    if (raw === 'localhost') return '127.0.0.1';
    return raw;
}

function ipv4ToBytes(address) {
    const parts = address.split('.');
    if (parts.length !== 4) return null;

    const bytes = new Uint8Array(4);
    for (let index = 0; index < 4; index += 1) {
        if (!/^\d{1,3}$/.test(parts[index])) return null;
        const octet = Number.parseInt(parts[index], 10);
        if (octet > 255) return null;
        bytes[index] = octet;
    }
    return bytes;
}

function ipv6ToBytes(address) {
    const halves = address.split('::');
    if (halves.length > 2) return null;

    const expand = (text) => (text.length === 0 ? [] : text.split(':'));
    const head = expand(halves[0]);
    const tail = halves.length === 2 ? expand(halves[1]) : [];

    const trailing = tail.length > 0 && tail[tail.length - 1].includes('.') ? tail.pop() : null;
    const embedded = trailing ? ipv4ToBytes(trailing) : null;
    if (trailing && !embedded) return null;

    const groupCount = 8 - (embedded ? 1 : 0);
    const missing = groupCount - head.length - tail.length;
    if (halves.length === 1 && missing !== 0) return null;
    if (missing < 0) return null;

    const groups = [...head, ...new Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
    const bytes = new Uint8Array(16);

    let offset = 0;
    for (const group of groups) {
        if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
        const value = Number.parseInt(group, 16);
        bytes[offset] = value >> 8;
        bytes[offset + 1] = value & 0xff;
        offset += 2;
    }

    if (embedded) bytes.set(embedded, offset);
    return bytes;
}

export function toBytes(address) {
    const normalised = normaliseAddress(address);
    if (!normalised) return null;
    return normalised.includes(':') ? ipv6ToBytes(normalised) : ipv4ToBytes(normalised);
}

export function parseCidr(text) {
    const [address, prefixText] = String(text).trim().split('/');
    const bytes = toBytes(address);
    if (!bytes) throw validationError('Invalid network address: ' + text);

    const maxBits = bytes.length * 8;
    const prefix = prefixText === undefined ? maxBits : Number.parseInt(prefixText, 10);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxBits) {
        throw validationError('Invalid network prefix: ' + text);
    }

    return { bytes, prefix };
}

export function parseNetworks(list) {
    const entries = Array.isArray(list) ? list : String(list ?? '').split(',');
    return entries
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0)
        .map(parseCidr);
}

export function inNetwork(addressBytes, network) {
    if (!addressBytes || addressBytes.length !== network.bytes.length) return false;

    const fullBytes = network.prefix >> 3;
    for (let index = 0; index < fullBytes; index += 1) {
        if (addressBytes[index] !== network.bytes[index]) return false;
    }

    const remainder = network.prefix & 7;
    if (remainder === 0) return true;

    const mask = 0xff << (8 - remainder) & 0xff;
    return (addressBytes[fullBytes] & mask) === (network.bytes[fullBytes] & mask);
}

const LOOPBACK = parseNetworks(LOOPBACK_NETWORKS);
const PRIVATE = parseNetworks(PRIVATE_NETWORKS);

export function classify(address, trustedNetworks = []) {
    const bytes = toBytes(address);
    if (!bytes) return Zone.WAN;

    if (LOOPBACK.some((network) => inNetwork(bytes, network))) return Zone.LOCAL;
    if (PRIVATE.some((network) => inNetwork(bytes, network))) return Zone.LAN;
    if (trustedNetworks.some((network) => inNetwork(bytes, network))) return Zone.LAN;

    return Zone.WAN;
}

export function isTrustedZone(zone) {
    return zone === Zone.LOCAL || zone === Zone.LAN;
}

export function allowsZone(exposure, zone) {
    if (exposure === Exposure.PUBLIC) return true;
    if (exposure === Exposure.LOCAL) return zone === Zone.LOCAL;
    return isTrustedZone(zone);
}
