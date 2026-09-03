const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6 = /^[0-9a-f:]{2,45}$/i;

export function normalise(value) {
    const raw = String(value ?? '').trim().toLowerCase().split('%')[0];
    if (raw.length === 0) return null;
    if (raw.startsWith('::ffff:') && raw.includes('.')) return normalise(raw.slice(7));
    return raw;
}

export function family(value) {
    const address = normalise(value);
    if (!address) return null;

    if (IPV4.test(address)) {
        const octets = address.split('.').map((part) => Number.parseInt(part, 10));
        return octets.every((octet) => octet >= 0 && octet <= 255) ? 'ipv4' : null;
    }

    if (address.includes(':') && IPV6.test(address) && !address.includes(':::')) return 'ipv6';

    return null;
}

export function isAddress(value) {
    return family(value) !== null;
}

function toBytes(address, kind) {
    if (kind === 'ipv4') {
        return Uint8Array.from(address.split('.').map((part) => Number.parseInt(part, 10)));
    }

    const halves = address.split('::');
    const head = halves[0].length > 0 ? halves[0].split(':') : [];
    const tail = halves.length === 2 && halves[1].length > 0 ? halves[1].split(':') : [];
    const missing = 8 - head.length - tail.length;
    if (halves.length === 1 && missing !== 0) return null;
    if (missing < 0) return null;

    const groups = [...head, ...new Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
    const bytes = new Uint8Array(16);

    for (let index = 0; index < groups.length; index += 1) {
        if (!/^[0-9a-f]{1,4}$/.test(groups[index])) return null;
        const value = Number.parseInt(groups[index], 16);
        bytes[index * 2] = value >> 8;
        bytes[index * 2 + 1] = value & 0xff;
    }

    return bytes;
}

export function parseNetwork(text) {
    const [addressText, prefixText] = String(text).trim().split('/');
    const address = normalise(addressText);
    const kind = family(address);
    if (!kind) return null;

    const bytes = toBytes(address, kind);
    if (!bytes) return null;

    const maxBits = bytes.length * 8;
    const prefix = prefixText === undefined ? maxBits : Number.parseInt(prefixText, 10);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxBits) return null;

    return { bytes, prefix, family: kind };
}

export function parseNetworks(entries) {
    return (entries ?? []).map(parseNetwork).filter((entry) => entry !== null);
}

export function inNetwork(address, network) {
    const kind = family(address);
    if (!kind || kind !== network.family) return false;

    const bytes = toBytes(normalise(address), kind);
    if (!bytes) return false;

    const fullBytes = network.prefix >> 3;
    for (let index = 0; index < fullBytes; index += 1) {
        if (bytes[index] !== network.bytes[index]) return false;
    }

    const remainder = network.prefix & 7;
    if (remainder === 0) return true;

    const mask = (0xff << (8 - remainder)) & 0xff;
    return (bytes[fullBytes] & mask) === (network.bytes[fullBytes] & mask);
}

export function inAnyNetwork(address, networks) {
    return networks.some((network) => inNetwork(address, network));
}
