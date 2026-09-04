import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateStreamPaths, testTcpPort } from '../src/features/cameras/stream_discovery.js';

test('candidateStreamPaths genera percorsi vendor ordinati con ruoli main e sub', () => {
    const paths = candidateStreamPaths();
    assert.equal(paths.length > 10, true);

    const hikvisionMain = paths.find((p) => p.vendor === 'Hikvision' && p.role === 'main');
    assert.equal(hikvisionMain.path, '/Streaming/Channels/101');

    const hikvisionSub = paths.find((p) => p.vendor === 'Hikvision' && p.role === 'sub');
    assert.equal(hikvisionSub.path, '/Streaming/Channels/102');

    const dahuaMain = paths.find((p) => p.vendor === 'Dahua' && p.role === 'main');
    assert.equal(dahuaMain.path.includes('channel=1&subtype=0'), true);
});

test('testTcpPort rifiuta porte chiuse o inesistenti', async () => {
    const closed = await testTcpPort('127.0.0.1', 65530, 200);
    assert.equal(closed, false);
});
