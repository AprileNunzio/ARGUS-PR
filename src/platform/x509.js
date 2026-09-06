import crypto from 'node:crypto';

const TAG = Object.freeze({
    BOOLEAN: 0x01,
    INTEGER: 0x02,
    BIT_STRING: 0x03,
    OCTET_STRING: 0x04,
    OID: 0x06,
    UTF8_STRING: 0x0c,
    SEQUENCE: 0x30,
    SET: 0x31,
    UTC_TIME: 0x17
});

const OID = Object.freeze({
    commonName: '2.5.4.3',
    organizationName: '2.5.4.10',
    ecdsaWithSha256: '1.2.840.10045.4.3.2',
    basicConstraints: '2.5.29.19',
    keyUsage: '2.5.29.15',
    extKeyUsage: '2.5.29.37',
    subjectAltName: '2.5.29.17',
    subjectKeyIdentifier: '2.5.29.14',
    authorityKeyIdentifier: '2.5.29.35',
    serverAuth: '1.3.6.1.5.5.7.3.1',
    clientAuth: '1.3.6.1.5.5.7.3.2'
});

function encodeLength(length) {
    if (length < 0x80) return Buffer.from([length]);

    const bytes = [];
    let remaining = length;
    while (remaining > 0) {
        bytes.unshift(remaining & 0xff);
        remaining >>>= 8;
    }
    return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function encode(tag, content) {
    const body = Buffer.isBuffer(content) ? content : Buffer.concat(content);
    return Buffer.concat([Buffer.from([tag]), encodeLength(body.length), body]);
}

function contextual(number, content) {
    return encode(0xa0 | number, content);
}

function integer(value) {
    const raw = Buffer.isBuffer(value) ? value : Buffer.from([value]);
    const needsPad = raw.length === 0 || (raw[0] & 0x80) !== 0;
    return encode(TAG.INTEGER, needsPad ? Buffer.concat([Buffer.from([0x00]), raw]) : raw);
}

function boolean(value) {
    return encode(TAG.BOOLEAN, Buffer.from([value ? 0xff : 0x00]));
}

function objectIdentifier(dotted) {
    const parts = dotted.split('.').map((part) => Number.parseInt(part, 10));
    const bytes = [parts[0] * 40 + parts[1]];

    for (const part of parts.slice(2)) {
        const chunks = [];
        let remaining = part;
        do {
            chunks.unshift(remaining & 0x7f);
            remaining = Math.floor(remaining / 128);
        } while (remaining > 0);

        for (let index = 0; index < chunks.length - 1; index += 1) chunks[index] |= 0x80;
        bytes.push(...chunks);
    }

    return encode(TAG.OID, Buffer.from(bytes));
}

function bitString(content, unusedBits = 0) {
    return encode(TAG.BIT_STRING, Buffer.concat([Buffer.from([unusedBits]), content]));
}

function utcTime(date) {
    const pad = (value) => String(value).padStart(2, '0');
    const text = [
        pad(date.getUTCFullYear() % 100),
        pad(date.getUTCMonth() + 1),
        pad(date.getUTCDate()),
        pad(date.getUTCHours()),
        pad(date.getUTCMinutes()),
        pad(date.getUTCSeconds())
    ].join('') + 'Z';
    return encode(TAG.UTC_TIME, Buffer.from(text, 'ascii'));
}

function attribute(oid, value) {
    return encode(TAG.SET, [
        encode(TAG.SEQUENCE, [objectIdentifier(oid), encode(TAG.UTF8_STRING, Buffer.from(value, 'utf8'))])
    ]);
}

function distinguishedName(name) {
    const parts = [attribute(OID.commonName, name.commonName)];
    if (name.organization) parts.push(attribute(OID.organizationName, name.organization));
    return encode(TAG.SEQUENCE, parts);
}

function extension(oid, critical, valueDer) {
    const parts = [objectIdentifier(oid)];
    if (critical) parts.push(boolean(true));
    parts.push(encode(TAG.OCTET_STRING, valueDer));
    return encode(TAG.SEQUENCE, parts);
}

function ipToBuffer(address) {
    const octets = address.split('.').map((part) => Number.parseInt(part, 10));
    if (octets.length !== 4) return null;
    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
    return Buffer.from(octets);
}

function subjectAltName(names) {
    const entries = [];

    for (const name of names) {
        const asIp = ipToBuffer(name);
        if (asIp) entries.push(encode(0x87, asIp));
        else entries.push(encode(0x82, Buffer.from(name, 'ascii')));
    }

    return encode(TAG.SEQUENCE, entries);
}

function keyIdentifier(publicKey) {
    const spki = publicKey.export({ type: 'spki', format: 'der' });
    return crypto.createHash('sha1').update(spki.subarray(spki.length - 65)).digest();
}

function algorithmIdentifier() {
    return encode(TAG.SEQUENCE, [objectIdentifier(OID.ecdsaWithSha256)]);
}

function buildExtensions(options, publicKey, authorityKey) {
    const extensions = [];

    extensions.push(extension(OID.basicConstraints, true, encode(TAG.SEQUENCE, options.ca ? [boolean(true)] : [])));

    extensions.push(extension(OID.keyUsage, true, options.ca
        ? bitString(Buffer.from([0x06]), 1)
        : bitString(Buffer.from([0xa0]), 5)));

    if (!options.ca) {
        extensions.push(extension(OID.extKeyUsage, false, encode(TAG.SEQUENCE, [
            objectIdentifier(OID.serverAuth),
            objectIdentifier(OID.clientAuth)
        ])));
    }

    if (Array.isArray(options.altNames) && options.altNames.length > 0) {
        extensions.push(extension(OID.subjectAltName, false, subjectAltName(options.altNames)));
    }

    extensions.push(extension(OID.subjectKeyIdentifier, false, encode(TAG.OCTET_STRING, keyIdentifier(publicKey))));
    extensions.push(extension(OID.authorityKeyIdentifier, false, encode(TAG.SEQUENCE, [
        encode(0x80, authorityKey)
    ])));

    return contextual(3, [encode(TAG.SEQUENCE, extensions)]);
}

function toPem(der, label) {
    const base64 = der.toString('base64');
    const lines = [];
    for (let index = 0; index < base64.length; index += 64) lines.push(base64.slice(index, index + 64));
    return '-----BEGIN ' + label + '-----\n' + lines.join('\n') + '\n-----END ' + label + '-----\n';
}

export function fingerprintOf(der) {
    return crypto.createHash('sha256').update(der).digest('hex').toUpperCase().match(/.{2}/g).join(':');
}

export function generateKeyPair() {
    return crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
}

export function privateKeyPem(key) {
    return key.export({ type: 'pkcs8', format: 'pem' });
}

export function issueCertificate(options) {
    const validFrom = options.validFrom ?? new Date();
    const notBefore = new Date(validFrom.getTime() - 3600 * 1000);
    const notAfter = new Date(validFrom.getTime() + options.validDays * 86400 * 1000);

    const tbs = encode(TAG.SEQUENCE, [
        contextual(0, [integer(Buffer.from([0x02]))]),
        integer(crypto.randomBytes(16)),
        algorithmIdentifier(),
        distinguishedName(options.issuer),
        encode(TAG.SEQUENCE, [utcTime(notBefore), utcTime(notAfter)]),
        distinguishedName(options.subject),
        options.publicKey.export({ type: 'spki', format: 'der' }),
        buildExtensions(
            { ca: options.ca === true, altNames: options.altNames ?? [] },
            options.publicKey,
            keyIdentifier(options.signingPublicKey)
        )
    ]);

    const der = encode(TAG.SEQUENCE, [
        tbs,
        algorithmIdentifier(),
        bitString(crypto.sign('sha256', tbs, options.signingKey))
    ]);

    return {
        der,
        pem: toPem(der, 'CERTIFICATE'),
        notBefore,
        notAfter,
        fingerprint: fingerprintOf(der)
    };
}
