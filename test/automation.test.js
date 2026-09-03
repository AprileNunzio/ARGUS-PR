import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { evaluateRule, nextState, describeEvent, TriggerKind } from '../src/features/automation/rule_matcher.js';
import { encodeLength, buildConnect, buildPublish, readConnack } from '../src/features/automation/channels/mqtt_client.js';
import { buildMessage, encodeHeader, sendMail } from '../src/features/automation/channels/smtp_client.js';
import { passwordDigest, buildRelayEnvelope, serviceUrl, escapeXml } from '../src/features/automation/channels/onvif_relay.js';
import { signPayload, assertHttpTarget } from '../src/features/automation/channels/http_channels.js';

const BASE_RULE = {
    id: 'r1',
    name: 'Persona di notte',
    enabled: true,
    triggerKind: TriggerKind.DETECTION,
    cameraId: null,
    className: 'person',
    minConfidence: 0.5,
    plateScope: 'any',
    personScope: 'any',
    weekMask: null,
    cooldownSeconds: 60,
    dailyLimit: null,
    actions: [{ channelId: 'c1' }]
};

const MONDAY_10 = new Date(2026, 7, 31, 10, 15, 0).getTime();

test('una regola scatta quando classe, telecamera e confidenza corrispondono', () => {
    const verdict = evaluateRule(BASE_RULE, {
        kind: TriggerKind.DETECTION,
        className: 'person',
        confidence: 0.8,
        cameraId: 'cam-1',
        timestamp: MONDAY_10
    });

    assert.equal(verdict.fires, true);
});

test('classe, tipo di evento e confidenza filtrano davvero', () => {
    const event = { kind: TriggerKind.DETECTION, className: 'car', confidence: 0.9, timestamp: MONDAY_10 };
    assert.equal(evaluateRule(BASE_RULE, event).fires, false);

    const lowConfidence = { kind: TriggerKind.DETECTION, className: 'person', confidence: 0.2, timestamp: MONDAY_10 };
    assert.equal(evaluateRule(BASE_RULE, lowConfidence).fires, false);

    const otherKind = { kind: TriggerKind.MOTION, className: 'person', confidence: 0.9, timestamp: MONDAY_10 };
    assert.equal(evaluateRule(BASE_RULE, otherKind).fires, false);
});

test('la regola legata a una telecamera ignora le altre', () => {
    const rule = { ...BASE_RULE, cameraId: 'cam-1' };
    assert.equal(evaluateRule(rule, { kind: TriggerKind.DETECTION, className: 'person', confidence: 0.9, cameraId: 'cam-2', timestamp: MONDAY_10 }).fires, false);
    assert.equal(evaluateRule(rule, { kind: TriggerKind.DETECTION, className: 'person', confidence: 0.9, cameraId: 'cam-1', timestamp: MONDAY_10 }).fires, true);
});

test('il cooldown blocca la seconda esecuzione ravvicinata', () => {
    const state = { lastFiredAt: MONDAY_10 - 10000, day: '2026-08-31', count: 1 };
    const event = { kind: TriggerKind.DETECTION, className: 'person', confidence: 0.9, timestamp: MONDAY_10 };

    assert.equal(evaluateRule(BASE_RULE, event, { state }).fires, false);
    assert.equal(evaluateRule(BASE_RULE, event, { state: { ...state, lastFiredAt: MONDAY_10 - 120000 } }).fires, true);
});

test('il limite giornaliero si azzera al cambio di giorno', () => {
    const rule = { ...BASE_RULE, cooldownSeconds: 0, dailyLimit: 2 };
    const event = { kind: TriggerKind.DETECTION, className: 'person', confidence: 0.9, timestamp: MONDAY_10 };
    const day = new Date(MONDAY_10).toISOString().slice(0, 10);

    assert.equal(evaluateRule(rule, event, { state: { day, count: 2, lastFiredAt: 0 } }).fires, false);
    assert.equal(evaluateRule(rule, event, { state: { day: '2020-01-01', count: 99, lastFiredAt: 0 } }).fires, true);

    const advanced = nextState({ day, count: 1, lastFiredAt: 0 }, MONDAY_10);
    assert.equal(advanced.count, 2);
    assert.equal(nextState({ day: '2020-01-01', count: 9, lastFiredAt: 0 }, MONDAY_10).count, 1);
});

test('la maschera oraria spegne la regola fuori fascia', () => {
    const always = '1'.repeat(336);
    const never = '0'.repeat(336);
    const event = { kind: TriggerKind.DETECTION, className: 'person', confidence: 0.9, timestamp: MONDAY_10 };

    assert.equal(evaluateRule({ ...BASE_RULE, weekMask: always }, event).fires, true);
    assert.equal(evaluateRule({ ...BASE_RULE, weekMask: never }, event).fires, false);
});

test('gli ambiti di targa e persona discriminano gli eventi', () => {
    const accessRule = { ...BASE_RULE, triggerKind: TriggerKind.ACCESS, className: null, plateScope: 'denied' };
    const denied = { kind: TriggerKind.ACCESS, plate: 'AB123CD', decision: 'deny', confidence: 0.9, timestamp: MONDAY_10 };
    const allowed = { ...denied, decision: 'allow' };

    assert.equal(evaluateRule(accessRule, denied).fires, true);
    assert.equal(evaluateRule(accessRule, allowed).fires, false);

    const faceRule = { ...BASE_RULE, className: 'face', personScope: 'unknown' };
    assert.equal(evaluateRule(faceRule, { kind: TriggerKind.DETECTION, className: 'face', confidence: 0.9, personId: null, timestamp: MONDAY_10 }).fires, true);
    assert.equal(evaluateRule(faceRule, { kind: TriggerKind.DETECTION, className: 'face', confidence: 0.9, personId: 'p1', timestamp: MONDAY_10 }).fires, false);

    assert.equal(describeEvent(denied).includes('AB123CD'), true);
});

test('i pacchetti MQTT rispettano il formato 3.1.1', () => {
    assert.deepEqual([...encodeLength(0)], [0]);
    assert.deepEqual([...encodeLength(127)], [127]);
    assert.deepEqual([...encodeLength(128)], [0x80, 0x01]);
    assert.deepEqual([...encodeLength(321)], [0xc1, 0x02]);

    const connect = buildConnect({ clientId: 'argus', username: 'u', password: 'p' });
    assert.equal(connect[0], 0x10);
    assert.equal(connect.includes(Buffer.from('MQTT')), true);
    assert.equal(connect[connect.indexOf(Buffer.from('MQTT')) + 4], 4);

    const publish = buildPublish({ topic: 'argus/eventi', payload: 'ciao' });
    assert.equal(publish[0], 0x30);
    assert.equal(publish.toString('utf8').includes('argus/eventi'), true);
    assert.equal(publish.toString('utf8').endsWith('ciao'), true);
    assert.equal(buildPublish({ topic: 'a', payload: 'b', retain: true })[0], 0x31);

    assert.deepEqual(readConnack(Buffer.from([0x20, 0x02, 0x00, 0x00])), { ok: true, code: 0 });
    assert.deepEqual(readConnack(Buffer.from([0x20, 0x02, 0x00, 0x05])), { ok: false, code: 5 });
});

test('il messaggio SMTP protegge intestazioni e punti a inizio riga', () => {
    const message = buildMessage({
        from: 'argus@example.com',
        to: ['destinatario@example.com'],
        subject: 'Rilevata persona',
        text: 'prima riga\n.punto iniziale\nultima riga',
        date: new Date(Date.UTC(2026, 8, 3, 10, 0, 0))
    });

    assert.equal(message.includes('\r\n..punto iniziale'), true);
    assert.equal(message.endsWith('\r\n.'), true);
    assert.equal(message.includes('Content-Type: text/plain; charset=utf-8'), true);
    assert.equal(encodeHeader('Attenzione: persona'), 'Attenzione: persona');
    assert.equal(encodeHeader('citta perche accento e').startsWith('citta'), true);
    assert.equal(encodeHeader('rilevata persona\r\nBcc: altro@example.com').includes('\r\n'), false);
});

test('la firma del webhook e stabile e gli indirizzi sono limitati a http', () => {
    assert.equal(signPayload('chiave', 'corpo'), signPayload('chiave', 'corpo'));
    assert.notEqual(signPayload('chiave', 'corpo'), signPayload('altra', 'corpo'));
    assert.throws(() => assertHttpTarget('file:///etc/passwd'));
    assert.throws(() => assertHttpTarget('non un url'));
    assert.equal(assertHttpTarget('https://esempio.local/hook').protocol, 'https:');
});

test('il digest ONVIF segue lo standard WS-Security', () => {
    const nonce = Buffer.from('0123456789abcdef', 'utf8');
    const created = '2026-09-03T12:00:00.000Z';

    assert.equal(passwordDigest(nonce, created, 'segreta'), 'RYmUb2KVpYVyPbxiAIjcgvL0dXg=');

    const envelope = buildRelayEnvelope({
        username: 'admin',
        password: 'segreta',
        token: 'RelayOutputToken',
        state: 'active',
        now: new Date(created),
        nonce
    });

    assert.equal(envelope.includes('RYmUb2KVpYVyPbxiAIjcgvL0dXg='), true);
    assert.equal(envelope.includes('<tds:LogicalState>active</tds:LogicalState>'), true);
    assert.equal(escapeXml('<a & "b">'), '&lt;a &amp; &quot;b&quot;&gt;');
    assert.equal(serviceUrl({ host: '192.168.1.64', port: 8000 }), 'http://192.168.1.64:8000/onvif/device_service');
    assert.throws(() => serviceUrl({ host: 'host; rm -rf /' }));
});

test('il client SMTP completa una consegna vera contro un server locale', async () => {
    const received = { lines: [], body: '' };

    const server = createServer((socket) => {
        let inData = false;
        socket.write('220 prova ESMTP\r\n');

        socket.on('data', (chunk) => {
            for (const line of chunk.toString('utf8').split('\r\n')) {
                if (line.length === 0) continue;

                if (inData) {
                    if (line === '.') {
                        inData = false;
                        socket.write('250 accettato\r\n');
                        continue;
                    }
                    received.body += `${line}\n`;
                    continue;
                }

                received.lines.push(line);

                if (line.startsWith('EHLO')) socket.write('250-prova\r\n250 AUTH LOGIN\r\n');
                else if (line === 'AUTH LOGIN') socket.write('334 VXNlcm5hbWU6\r\n');
                else if (line === 'DATA') { inData = true; socket.write('354 avanti\r\n'); }
                else if (line === 'QUIT') socket.write('221 arrivederci\r\n');
                else if (/^[A-Za-z0-9+/=]+$/.test(line) && received.lines.includes('AUTH LOGIN')) {
                    const step = received.lines.filter((entry) => /^[A-Za-z0-9+/=]+$/.test(entry)).length;
                    socket.write(step === 1 ? '334 UGFzc3dvcmQ6\r\n' : '235 autenticato\r\n');
                } else socket.write('250 ok\r\n');
            }
        });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const outcome = await sendMail({
        host: '127.0.0.1',
        port,
        secure: false,
        startTls: false,
        username: 'utente',
        password: 'segreta',
        from: 'argus@example.com',
        to: ['destinatario@example.com'],
        subject: 'Prova',
        text: 'corpo del messaggio'
    });

    server.close();

    assert.equal(outcome.delivered, 1);
    assert.equal(received.lines.includes('MAIL FROM:<argus@example.com>'), true);
    assert.equal(received.lines.includes('RCPT TO:<destinatario@example.com>'), true);
    assert.equal(received.body.includes('corpo del messaggio'), true);
    assert.equal(received.body.includes('Subject: Prova'), true);
});
