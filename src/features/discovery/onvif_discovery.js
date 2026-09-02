import dgram from 'node:dgram';
import os from 'node:os';
import crypto from 'node:crypto';
import { createLogger } from '../../kernel/logger.js';

const log = createLogger('discovery');

const MULTICAST_ADDRESS = '239.255.255.250';
const MULTICAST_PORT = 3702;
const DEFAULT_TIMEOUT_MS = 4000;

function probeMessage() {
    const messageId = `uuid:${crypto.randomUUID()}`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>${messageId}</w:MessageID>
    <w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe>
  </e:Body>
</e:Envelope>`;
}

function extractAll(xml, tag) {
    const pattern = new RegExp(`<[^>]*${tag}[^>]*>([\\s\\S]*?)<\\/[^>]*${tag}>`, 'gi');
    const found = [];
    let match = pattern.exec(xml);
    while (match !== null) {
        found.push(match[1].trim());
        match = pattern.exec(xml);
    }
    return found;
}

function parseScopes(xml) {
    const raw = extractAll(xml, 'Scopes').join(' ');
    const scopes = raw.split(/\s+/).filter((entry) => entry.startsWith('onvif://'));

    const read = (prefix) => {
        const entry = scopes.find((scope) => scope.includes(`/${prefix}/`));
        if (!entry) return null;
        const value = entry.split(`/${prefix}/`)[1] ?? '';
        return decodeURIComponent(value) || null;
    };

    return {
        name: read('name'),
        hardware: read('hardware'),
        location: read('location')
    };
}

function parseResponse(xml, remoteAddress) {
    const addresses = extractAll(xml, 'XAddrs')
        .join(' ')
        .split(/\s+/)
        .filter((entry) => entry.startsWith('http'));

    if (addresses.length === 0) return null;

    const serviceUrl = addresses[0];
    const parsed = (() => {
        try {
            return new URL(serviceUrl);
        } catch {
            return null;
        }
    })();

    const scopes = parseScopes(xml);
    const uuid = extractAll(xml, 'Address')[0] ?? null;

    return {
        id: uuid ?? serviceUrl,
        host: parsed?.hostname ?? remoteAddress,
        onvifPort: parsed?.port ? Number.parseInt(parsed.port, 10) : 80,
        serviceUrl,
        name: scopes.name,
        hardware: scopes.hardware,
        location: scopes.location
    };
}

function localBroadcastInterfaces() {
    const found = [];
    for (const entries of Object.values(os.networkInterfaces())) {
        for (const entry of entries ?? []) {
            if (entry.family !== 'IPv4' || entry.internal) continue;
            found.push(entry.address);
        }
    }
    return found;
}

export function discoverOnvifDevices(timeoutMs = DEFAULT_TIMEOUT_MS) {
    return new Promise((resolve) => {
        const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        const devices = new Map();
        const interfaces = localBroadcastInterfaces();

        const finish = () => {
            socket.removeAllListeners();
            socket.close(() => resolve({
                devices: Array.from(devices.values()),
                interfaces
            }));
        };

        socket.on('error', (error) => {
            log.warn('discovery socket error', { message: error.message });
            finish();
        });

        socket.on('message', (buffer, remote) => {
            const device = parseResponse(buffer.toString('utf8'), remote.address);
            if (device) devices.set(device.id, device);
        });

        socket.bind(() => {
            socket.setBroadcast(true);
            const payload = Buffer.from(probeMessage());
            socket.send(payload, 0, payload.length, MULTICAST_PORT, MULTICAST_ADDRESS, (error) => {
                if (error) log.warn('probe send failed', { message: error.message });
            });
        });

        setTimeout(finish, timeoutMs).unref();
    });
}
