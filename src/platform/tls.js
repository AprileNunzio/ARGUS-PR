import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createLogger } from '../kernel/logger.js';
import { internal } from '../kernel/errors.js';
import { ensureSecureDir } from './paths.js';
import { generateKeyPair, issueCertificate, privateKeyPem, fingerprintOf } from './x509.js';

const log = createLogger('tls');

const CA_VALID_DAYS = 3650;
const LEAF_VALID_DAYS = 397;
const RENEW_BEFORE_DAYS = 30;
const ORGANIZATION = 'ARGUS-PR';

let cached = null;

function pkiDir(config) {
    return path.join(config.secretsDir, 'pki');
}

function writeSecret(target, content) {
    fs.writeFileSync(target, content, { mode: 0o600 });
    if (process.platform !== 'win32') fs.chmodSync(target, 0o600);
}

function writePublic(target, content) {
    fs.writeFileSync(target, content, { mode: 0o644 });
}

function localAddresses() {
    const found = new Set();
    for (const entries of Object.values(os.networkInterfaces())) {
        for (const entry of entries ?? []) {
            if (entry.family !== 'IPv4') continue;
            found.add(entry.address);
        }
    }
    return [...found];
}

export function desiredAltNames(config) {
    const hostname = os.hostname().toLowerCase();
    const names = new Set(['localhost', '127.0.0.1']);

    if (hostname.length > 0) {
        names.add(hostname);
        if (!hostname.includes('.')) names.add(hostname + '.local');
    }

    for (const address of localAddresses()) names.add(address);
    for (const extra of config.publicHostnames) names.add(extra.toLowerCase());

    return [...names].sort();
}

function readMeta(target) {
    if (!fs.existsSync(target)) return null;
    try {
        return JSON.parse(fs.readFileSync(target, 'utf8'));
    } catch {
        return null;
    }
}

function loadCa(directory) {
    const certFile = path.join(directory, 'ca.crt');
    const keyFile = path.join(directory, 'ca.key');

    if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
        const certificate = fs.readFileSync(certFile, 'utf8');
        const privateKey = crypto.createPrivateKey(fs.readFileSync(keyFile, 'utf8'));
        const parsed = new crypto.X509Certificate(certificate);

        if (parsed.validToDate.getTime() > Date.now()) {
            return { certificate, privateKey, publicKey: parsed.publicKey };
        }
        log.warn('internal certificate authority expired, issuing a new one');
    }

    const keys = generateKeyPair();
    const name = { commonName: 'ARGUS-PR Internal Authority', organization: ORGANIZATION };

    const issued = issueCertificate({
        subject: name,
        issuer: name,
        publicKey: keys.publicKey,
        signingKey: keys.privateKey,
        signingPublicKey: keys.publicKey,
        validDays: CA_VALID_DAYS,
        ca: true
    });

    writePublic(certFile, issued.pem);
    writeSecret(keyFile, privateKeyPem(keys.privateKey));
    log.warn('internal certificate authority created', { fingerprint: issued.fingerprint, file: certFile });

    return { certificate: issued.pem, privateKey: keys.privateKey, publicKey: keys.publicKey };
}

function leafIsUsable(directory, altNames) {
    const certFile = path.join(directory, 'server.crt');
    const keyFile = path.join(directory, 'server.key');
    if (!fs.existsSync(certFile) || !fs.existsSync(keyFile)) return null;

    const meta = readMeta(path.join(directory, 'server.json'));
    if (!meta || meta.altNames?.join('|') !== altNames.join('|')) return null;

    const certificate = fs.readFileSync(certFile, 'utf8');
    const parsed = new crypto.X509Certificate(certificate);
    const remainingMs = parsed.validToDate.getTime() - Date.now();
    if (remainingMs < RENEW_BEFORE_DAYS * 86400 * 1000) return null;

    return {
        key: fs.readFileSync(keyFile, 'utf8'),
        certificate,
        fingerprint: fingerprintOf(parsed.raw),
        notAfter: parsed.validToDate.toISOString()
    };
}

function issueLeaf(directory, authority, altNames) {
    const keys = generateKeyPair();

    const issued = issueCertificate({
        subject: { commonName: os.hostname().toLowerCase() || 'argus-nvr', organization: ORGANIZATION },
        issuer: { commonName: 'ARGUS-PR Internal Authority', organization: ORGANIZATION },
        publicKey: keys.publicKey,
        signingKey: authority.privateKey,
        signingPublicKey: authority.publicKey,
        validDays: LEAF_VALID_DAYS,
        altNames
    });

    const key = privateKeyPem(keys.privateKey);

    writePublic(path.join(directory, 'server.crt'), issued.pem);
    writeSecret(path.join(directory, 'server.key'), key);
    writePublic(path.join(directory, 'server.json'), JSON.stringify({
        altNames,
        fingerprint: issued.fingerprint,
        notAfter: issued.notAfter.toISOString()
    }, null, 2));

    log.warn('server certificate issued', { fingerprint: issued.fingerprint, altNames: altNames.length });

    return {
        key,
        certificate: issued.pem,
        fingerprint: issued.fingerprint,
        notAfter: issued.notAfter.toISOString()
    };
}

function loadProvided(config) {
    const certificate = fs.readFileSync(config.tlsCertFile, 'utf8');
    const key = fs.readFileSync(config.tlsKeyFile, 'utf8');
    const parsed = new crypto.X509Certificate(certificate);

    return {
        key,
        certificate,
        authority: config.tlsCaFile && fs.existsSync(config.tlsCaFile)
            ? fs.readFileSync(config.tlsCaFile, 'utf8')
            : null,
        fingerprint: fingerprintOf(parsed.raw),
        notAfter: parsed.validToDate.toISOString(),
        subject: parsed.subject.replace(/\n/g, ', '),
        source: 'provided',
        trusted: true
    };
}

export function ensureTlsMaterial(config) {
    if (config.tlsCertFile && config.tlsKeyFile) {
        if (!fs.existsSync(config.tlsCertFile) || !fs.existsSync(config.tlsKeyFile)) {
            throw internal('The configured TLS certificate or key does not exist');
        }
        cached = loadProvided(config);
        log.info('using the provided certificate', { subject: cached.subject, notAfter: cached.notAfter });
        return cached;
    }

    const directory = pkiDir(config);
    ensureSecureDir(directory);

    const altNames = desiredAltNames(config);
    const authority = loadCa(directory);
    const leaf = leafIsUsable(directory, altNames) ?? issueLeaf(directory, authority, altNames);

    cached = {
        key: leaf.key,
        certificate: leaf.certificate,
        authority: authority.certificate,
        authorityFile: path.join(directory, 'ca.crt'),
        fingerprint: leaf.fingerprint,
        notAfter: leaf.notAfter,
        subject: altNames.join(', '),
        source: 'self-signed',
        trusted: false
    };

    return cached;
}

export function tlsStatus() {
    if (!cached) return { ready: false };

    return {
        ready: true,
        source: cached.source,
        trusted: cached.trusted,
        fingerprint: cached.fingerprint,
        notAfter: cached.notAfter,
        authorityFile: cached.authorityFile ?? null
    };
}

export function secureContextOptions(material) {
    return {
        key: material.key,
        cert: material.certificate,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3',
        honorCipherOrder: true,
        ciphers: [
            'TLS_AES_256_GCM_SHA384',
            'TLS_CHACHA20_POLY1305_SHA256',
            'TLS_AES_128_GCM_SHA256',
            'ECDHE-ECDSA-AES256-GCM-SHA384',
            'ECDHE-RSA-AES256-GCM-SHA384',
            'ECDHE-ECDSA-CHACHA20-POLY1305',
            'ECDHE-RSA-CHACHA20-POLY1305',
            'ECDHE-ECDSA-AES128-GCM-SHA256',
            'ECDHE-RSA-AES128-GCM-SHA256'
        ].join(':'),
        ecdhCurve: 'X25519:prime256v1:secp384r1',
        sessionTimeout: 300
    };
}
