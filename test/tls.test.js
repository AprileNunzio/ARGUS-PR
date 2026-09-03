import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import tls from 'node:tls';
import { ensureTlsMaterial, secureContextOptions, desiredAltNames } from '../src/platform/tls.js';
import { generateKeyPair, issueCertificate } from '../src/platform/x509.js';

function scratchConfig() {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-tls-'));
    const secretsDir = path.join(dataDir, 'secrets');
    fs.mkdirSync(secretsDir, { recursive: true });

    return {
        dataDir,
        secretsDir,
        tlsCertFile: '',
        tlsKeyFile: '',
        tlsCaFile: '',
        publicHostnames: ['nvr.esempio.it']
    };
}

test('genera una autorita interna e un certificato server firmato da essa', () => {
    const config = scratchConfig();
    const material = ensureTlsMaterial(config);

    assert.equal(material.source, 'self-signed');
    assert.equal(material.trusted, false);
    assert.match(material.fingerprint, /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/);

    const authority = new crypto.X509Certificate(material.authority);
    const server = new crypto.X509Certificate(material.certificate);

    assert.equal(authority.ca, true);
    assert.equal(server.ca, false);
    assert.equal(server.verify(authority.publicKey), true);
    assert.equal(server.checkIssued(authority), true);
});

test('il certificato copre localhost, gli indirizzi locali e i nomi pubblici', () => {
    const config = scratchConfig();
    const material = ensureTlsMaterial(config);
    const server = new crypto.X509Certificate(material.certificate);

    assert.ok(server.checkHost('localhost'));
    assert.ok(server.checkIP('127.0.0.1'));
    assert.ok(server.checkHost('nvr.esempio.it'));
    assert.ok(desiredAltNames(config).includes('nvr.esempio.it'));
});

test('la chiave privata non e leggibile da altri utenti su sistemi POSIX', { skip: process.platform === 'win32' }, () => {
    const config = scratchConfig();
    ensureTlsMaterial(config);

    const keyFile = path.join(config.secretsDir, 'pki', 'server.key');
    assert.equal(fs.statSync(keyFile).mode & 0o077, 0);

    const authorityKey = path.join(config.secretsDir, 'pki', 'ca.key');
    assert.equal(fs.statSync(authorityKey).mode & 0o077, 0);
});

test('un secondo avvio riusa lo stesso certificato senza rigenerarlo', () => {
    const config = scratchConfig();
    const first = ensureTlsMaterial(config);
    const second = ensureTlsMaterial(config);

    assert.equal(first.fingerprint, second.fingerprint);
});

test('un certificato fornito dall utente ha la precedenza', () => {
    const config = scratchConfig();
    const keys = generateKeyPair();
    const name = { commonName: 'fornito.esempio.it', organization: 'Cliente' };

    const issued = issueCertificate({
        subject: name,
        issuer: name,
        publicKey: keys.publicKey,
        signingKey: keys.privateKey,
        signingPublicKey: keys.publicKey,
        validDays: 30,
        altNames: ['fornito.esempio.it']
    });

    const certFile = path.join(config.dataDir, 'fornito.crt');
    const keyFile = path.join(config.dataDir, 'fornito.key');
    fs.writeFileSync(certFile, issued.pem);
    fs.writeFileSync(keyFile, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }));

    const material = ensureTlsMaterial({ ...config, tlsCertFile: certFile, tlsKeyFile: keyFile });

    assert.equal(material.source, 'provided');
    assert.equal(material.trusted, true);
    assert.match(material.subject, /fornito\.esempio\.it/);
});

test('il materiale generato regge un handshake TLS reale', async () => {
    const config = scratchConfig();
    const material = ensureTlsMaterial(config);

    const server = https.createServer(secureContextOptions(material), (req, res) => {
        res.writeHead(200);
        res.end('ok');
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const response = await new Promise((resolve, reject) => {
        const request = https.request({
            host: '127.0.0.1',
            port,
            path: '/',
            ca: material.authority,
            servername: 'localhost',
            checkServerIdentity: (host, certificate) => tls.checkServerIdentity('localhost', certificate)
        }, (res) => {
            const protocol = res.socket.getProtocol();
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve({ protocol, body, status: res.statusCode }));
        });
        request.on('error', reject);
        request.end();
    });

    server.close();

    assert.equal(response.status, 200);
    assert.equal(response.body, 'ok');
    assert.ok(response.protocol === 'TLSv1.3' || response.protocol === 'TLSv1.2');
});

test('un client che non conosce l autorita viene rifiutato', async () => {
    const config = scratchConfig();
    const material = ensureTlsMaterial(config);

    const server = https.createServer(secureContextOptions(material), (req, res) => {
        res.writeHead(200);
        res.end('ok');
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const failure = await new Promise((resolve) => {
        const request = https.request({ host: '127.0.0.1', port, path: '/', servername: 'localhost' }, () => resolve(null));
        request.on('error', (error) => resolve(error));
        request.end();
    });

    server.close();

    assert.ok(failure);
    assert.match(String(failure.code), /SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO/);
});
