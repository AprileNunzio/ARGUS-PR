import { createHash, randomBytes } from 'node:crypto';

const TIMEOUT_MS = 10000;

export function passwordDigest(nonce, created, password) {
    const hash = createHash('sha1');
    hash.update(Buffer.concat([nonce, Buffer.from(created, 'utf8'), Buffer.from(password ?? '', 'utf8')]));
    return hash.digest('base64');
}

export function escapeXml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function securityHeader(username, password, now = new Date(), nonce = randomBytes(16)) {
    if (!username) return '';

    const created = now.toISOString();
    const digest = passwordDigest(nonce, created, password);

    return [
        '<s:Header>',
        '<Security s:mustUnderstand="1" xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">',
        '<UsernameToken>',
        `<Username>${escapeXml(username)}</Username>`,
        `<Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</Password>`,
        `<Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonce.toString('base64')}</Nonce>`,
        `<Created xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">${created}</Created>`,
        '</UsernameToken>',
        '</Security>',
        '</s:Header>'
    ].join('');
}

export function buildRelayEnvelope({ username, password, token, state, now, nonce }) {
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">',
        securityHeader(username, password, now, nonce),
        '<s:Body xmlns:tds="http://www.onvif.org/ver10/device/wsdl">',
        '<tds:SetRelayOutputState>',
        `<tds:RelayOutputToken>${escapeXml(token)}</tds:RelayOutputToken>`,
        `<tds:LogicalState>${state === 'inactive' ? 'inactive' : 'active'}</tds:LogicalState>`,
        '</tds:SetRelayOutputState>',
        '</s:Body>',
        '</s:Envelope>'
    ].join('');
}

export function serviceUrl(config) {
    const host = String(config.host ?? '').trim();
    if (host.length === 0) throw new Error('Indirizzo della telecamera mancante');
    if (!/^[A-Za-z0-9._:-]+$/.test(host)) throw new Error('Indirizzo della telecamera non valido');

    const port = Number.parseInt(config.port, 10);
    const resolved = Number.isInteger(port) && port > 0 && port <= 65535 ? port : 80;
    return `http://${host}:${resolved}${config.path ?? '/onvif/device_service'}`;
}

async function callDevice(url, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/soap+xml; charset=utf-8' },
        body,
        signal: controller.signal,
        redirect: 'error'
    }).catch((error) => {
        throw new Error(error.name === 'AbortError' ? 'la telecamera non ha risposto' : error.message);
    }).finally(() => clearTimeout(timer));

    const text = await response.text();

    if (!response.ok || /Fault>/i.test(text)) {
        const reason = /<[^>]*Text[^>]*>([^<]{0,160})</i.exec(text)?.[1] ?? `risposta ${response.status}`;
        throw new Error(`ONVIF: ${reason}`);
    }

    return text;
}

export async function operateRelay(config, secret) {
    const url = serviceUrl(config);
    const token = config.token ?? 'RelayOutputToken';

    await callDevice(url, buildRelayEnvelope({
        username: config.username,
        password: secret,
        token,
        state: 'active'
    }));

    const holdMs = Math.min(Math.max(Number.parseInt(config.holdMs, 10) || 1500, 200), 30000);

    if (config.mode !== 'bistable') {
        await new Promise((resolve) => setTimeout(resolve, holdMs));
        await callDevice(url, buildRelayEnvelope({
            username: config.username,
            password: secret,
            token,
            state: 'inactive'
        }));
    }

    return { relay: token, held: config.mode === 'bistable' ? null : holdMs };
}
