import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';

const DEFAULT_TIMEOUT_MS = 15000;

export function encodeHeader(value) {
    const clean = String(value ?? '').replace(/[\r\n]/g, ' ');
    return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}

export function buildMessage({ from, to, subject, text, date = new Date() }) {
    const body = String(text ?? '').replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');

    return [
        `From: ${encodeHeader(from)}`,
        `To: ${to.map((address) => encodeHeader(address)).join(', ')}`,
        `Subject: ${encodeHeader(subject)}`,
        `Date: ${date.toUTCString()}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        body,
        '.'
    ].join('\r\n');
}

function createConversation(socket, timeoutMs) {
    let buffer = '';
    let pending = null;

    const fail = (error) => {
        if (!pending) return;
        const { reject, timer } = pending;
        pending = null;
        clearTimeout(timer);
        reject(error);
    };

    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
        buffer += chunk;
        if (!pending) return;

        const lines = buffer.split(/\r?\n/);
        const complete = lines.findIndex((line) => /^\d{3} /.test(line));
        if (complete < 0) return;

        const response = lines.slice(0, complete + 1).join('\n');
        buffer = lines.slice(complete + 1).join('\n');

        const { resolve, timer } = pending;
        pending = null;
        clearTimeout(timer);
        resolve({ code: Number.parseInt(response.slice(0, 3), 10), text: response });
    });

    socket.on('error', fail);
    socket.on('close', () => fail(new Error('connessione SMTP chiusa dal server')));

    return {
        read() {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    pending = null;
                    reject(new Error('il server SMTP non ha risposto entro il tempo previsto'));
                }, timeoutMs);
                pending = { resolve, reject, timer };
            });
        },
        write(line) {
            socket.write(`${line}\r\n`);
        },
        rest() {
            return buffer;
        }
    };
}

function openSocket(options) {
    return new Promise((resolve, reject) => {
        const socket = options.secure
            ? tlsConnect({ host: options.host, port: options.port, servername: options.host, rejectUnauthorized: options.rejectUnauthorized !== false })
            : netConnect({ host: options.host, port: options.port });

        const onError = (error) => reject(error);
        socket.once('error', onError);
        socket.once(options.secure ? 'secureConnect' : 'connect', () => {
            socket.removeListener('error', onError);
            resolve(socket);
        });
    });
}

function upgrade(socket, options) {
    return new Promise((resolve, reject) => {
        const secure = tlsConnect({
            socket,
            servername: options.host,
            rejectUnauthorized: options.rejectUnauthorized !== false
        });
        secure.once('error', reject);
        secure.once('secureConnect', () => resolve(secure));
    });
}

async function expect(conversation, codes, step) {
    const response = await conversation.read();
    if (!codes.includes(response.code)) {
        throw new Error(`SMTP ${step}: risposta inattesa ${response.text.split('\n')[0]}`);
    }
    return response;
}

export async function sendMail(options) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const recipients = Array.isArray(options.to) ? options.to : [options.to];
    const secure = options.secure === true || options.port === 465;

    let socket = await openSocket({ ...options, secure });
    let conversation = createConversation(socket, timeoutMs);

    await expect(conversation, [220], 'saluto');
    conversation.write(`EHLO ${options.clientName ?? 'argus-pr'}`);
    let greeting = await expect(conversation, [250], 'EHLO');

    if (!secure && /STARTTLS/i.test(greeting.text) && options.startTls !== false) {
        conversation.write('STARTTLS');
        await expect(conversation, [220], 'STARTTLS');
        socket = await upgrade(socket, options);
        conversation = createConversation(socket, timeoutMs);
        conversation.write(`EHLO ${options.clientName ?? 'argus-pr'}`);
        greeting = await expect(conversation, [250], 'EHLO dopo STARTTLS');
    }

    if (options.username) {
        conversation.write('AUTH LOGIN');
        await expect(conversation, [334], 'AUTH');
        conversation.write(Buffer.from(options.username, 'utf8').toString('base64'));
        await expect(conversation, [334], 'utente');
        conversation.write(Buffer.from(options.password ?? '', 'utf8').toString('base64'));
        await expect(conversation, [235], 'autenticazione');
    }

    conversation.write(`MAIL FROM:<${options.from}>`);
    await expect(conversation, [250], 'MAIL FROM');

    for (const recipient of recipients) {
        conversation.write(`RCPT TO:<${recipient}>`);
        await expect(conversation, [250, 251], 'RCPT TO');
    }

    conversation.write('DATA');
    await expect(conversation, [354], 'DATA');

    socket.write(`${buildMessage({ ...options, to: recipients })}\r\n`);
    await expect(conversation, [250], 'invio');

    conversation.write('QUIT');
    socket.end();

    return { delivered: recipients.length };
}
