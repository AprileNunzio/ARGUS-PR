import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { loadConfig } from '../src/kernel/config.js';
import { createHttpServer, createRedirectServer } from '../src/http/server.js';
import { initSecurityEvents, securityEventFile } from '../src/security/security_events.js';
import { Exposure } from '../src/security/net_zones.js';
import { setLogLevel } from '../src/kernel/logger.js';

setLogLevel('error');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-exposure-'));

const config = loadConfig({
    ARGUS_DATA_DIR: dataDir,
    ARGUS_PORT: '8443',
    ARGUS_HTTP_PORT: '0',
    ARGUS_HOST: '127.0.0.1',
    ARGUS_TRUST_PROXY: 'true',
    ARGUS_PUBLIC_ACCESS: 'true'
});

initSecurityEvents(config);

const { server, tls } = createHttpServer(config, (router) => {
    router.get('/api/pubblica', async (ctx) => ({ body: { zone: ctx.zone } }), {
        anonymous: true,
        exposure: Exposure.PUBLIC
    });

    router.get('/api/gestione', async (ctx) => ({ body: { zone: ctx.zone } }), {
        anonymous: true
    });

    router.get('/api/console', async (ctx) => ({ body: { zone: ctx.zone } }), {
        anonymous: true,
        exposure: Exposure.LOCAL
    });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const httpsPort = server.address().port;

function call(pathname, forwardedFor) {
    return new Promise((resolve, reject) => {
        const headers = forwardedFor ? { 'x-forwarded-for': forwardedFor } : {};

        const request = https.request({
            host: '127.0.0.1',
            port: httpsPort,
            path: pathname,
            headers,
            ca: tls.authority,
            servername: 'localhost',
            checkServerIdentity: () => undefined
        }, (response) => {
            let body = '';
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => resolve({
                status: response.statusCode,
                headers: response.headers,
                body: body.length > 0 ? JSON.parse(body) : null
            }));
        });

        request.on('error', reject);
        request.end();
    });
}

test.after(() => server.close());

test('il server parla solo TLS e dichiara HSTS', async () => {
    const response = await call('/api/pubblica');

    assert.equal(response.status, 200);
    assert.match(response.headers['strict-transport-security'], /max-age=63072000/);
    assert.equal(response.headers['x-frame-options'], 'DENY');
    assert.match(response.headers['content-security-policy'], /script-src 'self'/);
    assert.ok(!response.headers['content-security-policy'].includes('unsafe-inline'));
});

test('dalla rete locale ogni rotta risponde', async () => {
    assert.equal((await call('/api/pubblica', '192.168.1.30')).status, 200);
    assert.equal((await call('/api/gestione', '192.168.1.30')).status, 200);
});

test('da internet la visione passa e la gestione viene rifiutata', async () => {
    const pubblica = await call('/api/pubblica', '203.0.113.40');
    const gestione = await call('/api/gestione', '203.0.113.40');

    assert.equal(pubblica.status, 200);
    assert.equal(pubblica.body.zone, 'wan');
    assert.equal(gestione.status, 403);
    assert.match(gestione.body.error.message, /not reachable from outside the local network/);
});

test('la console locale non e raggiungibile nemmeno dalla rete locale', async () => {
    assert.equal((await call('/api/console', '192.168.1.30')).status, 403);
    assert.equal((await call('/api/console', '203.0.113.40')).status, 403);
    assert.equal((await call('/api/console')).status, 200);
});

test('i rifiuti finiscono nel flusso eventi che alimenta ARGUS-SHIELD', async () => {
    await call('/api/gestione', '203.0.113.41');

    const lines = fs.readFileSync(securityEventFile(), 'utf8')
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));

    const denied = lines.find((entry) => entry.kind === 'zone.denied' && entry.address === '203.0.113.41');

    assert.ok(denied, 'evento di rifiuto assente');
    assert.equal(denied.zone, 'wan');
    assert.equal(denied.path, '/api/gestione');
    assert.ok(denied.weight > 0);
});

test('le scansioni di percorsi noti vengono registrate come sondaggi', async () => {
    await call('/.env', '203.0.113.42');
    await call('/wp-login.php', '203.0.113.42');

    const lines = fs.readFileSync(securityEventFile(), 'utf8')
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));

    const probes = lines.filter((entry) => entry.kind === 'route.probe' && entry.address === '203.0.113.42');
    assert.ok(probes.length >= 1);
});

test('la porta in chiaro reindirizza a HTTPS senza servire contenuti', async () => {
    const redirect = createRedirectServer({ ...config, port: 443 });
    await new Promise((resolve) => redirect.listen(0, '127.0.0.1', resolve));
    const port = redirect.address().port;

    const response = await new Promise((resolve, reject) => {
        const request = http.request({
            host: '127.0.0.1',
            port,
            path: '/api/gestione',
            headers: { host: 'nvr.esempio.it' }
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body }));
        });
        request.on('error', reject);
        request.end();
    });

    redirect.close();

    assert.equal(response.status, 308);
    assert.equal(response.location, 'https://nvr.esempio.it/api/gestione');
    assert.equal(response.body, '');
});
