import { createHmac } from 'node:crypto';

const TIMEOUT_MS = 10000;
const ALLOWED_PROTOCOLS = Object.freeze(['http:', 'https:']);
const ALLOWED_METHODS = Object.freeze(['GET', 'POST', 'PUT']);

export function assertHttpTarget(url) {
    const parsed = (() => {
        try {
            return new URL(url);
        } catch {
            return null;
        }
    })();

    if (!parsed) throw new Error('Indirizzo non valido');
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) throw new Error('Sono ammessi solo http e https');
    if (parsed.hostname.length === 0) throw new Error('Indirizzo senza host');
    return parsed;
}

async function request(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(url, { ...init, signal: controller.signal, redirect: 'error' })
        .catch((error) => {
            throw new Error(error.name === 'AbortError' ? 'tempo scaduto' : error.message);
        })
        .finally(() => clearTimeout(timer));

    if (!response.ok) throw new Error(`risposta ${response.status}`);
    return response;
}

export function signPayload(secret, body) {
    return createHmac('sha256', secret).update(body).digest('hex');
}

export async function sendWebhook(config, secret, message) {
    assertHttpTarget(config.url);

    const body = JSON.stringify({
        event: message.event,
        rule: message.rule,
        camera: message.camera,
        text: message.text,
        at: new Date(message.timestamp ?? Date.now()).toISOString()
    });

    const headers = { 'content-type': 'application/json' };
    if (secret) headers['x-argus-signature'] = signPayload(secret, body);

    await request(config.url, { method: 'POST', headers, body });
    return { sent: true };
}

export async function sendTelegram(config, secret, message) {
    const token = secret ?? config.token;
    if (!token) throw new Error('Token Telegram mancante');
    if (!config.chatId) throw new Error('Identificativo della chat mancante');

    const body = JSON.stringify({
        chat_id: String(config.chatId),
        text: message.text,
        disable_notification: config.silent === true
    });

    await request(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body
    });

    return { sent: true };
}

export async function triggerGate(config, secret) {
    const target = assertHttpTarget(config.url);
    const method = ALLOWED_METHODS.includes(config.method) ? config.method : 'GET';

    const headers = {};
    if (config.username) {
        const basic = Buffer.from(`${config.username}:${secret ?? ''}`, 'utf8').toString('base64');
        headers.authorization = `Basic ${basic}`;
    }
    if (config.headerName && config.headerValue) headers[String(config.headerName).toLowerCase()] = String(config.headerValue);

    const init = { method, headers };
    if (method !== 'GET' && config.body) {
        init.body = String(config.body);
        init.headers['content-type'] = config.contentType ?? 'application/json';
    }

    await request(target.toString(), init);
    return { triggered: true };
}
