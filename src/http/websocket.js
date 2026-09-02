import { WebSocketServer } from 'ws';
import { createLogger } from '../kernel/logger.js';
import { onShutdown } from '../kernel/process_guard.js';
import { subscribeAll } from '../kernel/event_bus.js';
import { resolveSession } from '../security/sessions.js';
import { can, Permission } from '../security/rbac.js';
import { parseCookies } from './http_utils.js';
import { SESSION_COOKIE } from './server.js';

const log = createLogger('websocket');
const HEARTBEAT_MS = 30000;

function authoriseUpgrade(req) {
    const cookies = parseCookies(req.headers.cookie);
    const actor = resolveSession(cookies[SESSION_COOKIE]);
    if (!actor) return null;
    if (!can(actor.role, Permission.LIVE_VIEW)) return null;
    return actor;
}

export function attachEventSocket(server) {
    const wss = new WebSocketServer({ noServer: true });
    const clients = new Set();

    server.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
        if (url.pathname !== '/api/events') {
            socket.destroy();
            return;
        }

        const actor = authoriseUpgrade(req);
        if (!actor) {
            socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
            socket.destroy();
            return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
            ws.actor = actor;
            ws.isAlive = true;
            clients.add(ws);
            log.info('client connected', { user: actor.username, clients: clients.size });

            ws.on('pong', () => { ws.isAlive = true; });
            ws.on('close', () => {
                clients.delete(ws);
                log.debug('client disconnected', { user: actor.username, clients: clients.size });
            });
            ws.on('error', (error) => {
                log.warn('client error', { user: actor.username, message: error.message });
            });

            ws.send(JSON.stringify({ topic: 'session.ready', at: Date.now(), payload: { username: actor.username, role: actor.role } }));
        });
    });

    const unsubscribe = subscribeAll((event) => {
        const message = JSON.stringify(event);
        for (const client of clients) {
            if (client.readyState !== client.OPEN) continue;
            client.send(message);
        }
    });

    const heartbeat = setInterval(() => {
        for (const client of clients) {
            if (!client.isAlive) {
                client.terminate();
                clients.delete(client);
                continue;
            }
            client.isAlive = false;
            client.ping();
        }
    }, HEARTBEAT_MS);
    heartbeat.unref();

    onShutdown('websocket', () => {
        clearInterval(heartbeat);
        unsubscribe();
        for (const client of clients) client.close(1001, 'server shutting down');
        wss.close();
    });

    return { clientCount: () => clients.size };
}
