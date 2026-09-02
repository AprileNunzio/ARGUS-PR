import { WebSocketServer } from 'ws';
import { createLogger } from '../kernel/logger.js';
import { onShutdown } from '../kernel/process_guard.js';
import { subscribeAll } from '../kernel/event_bus.js';
import { resolveSession } from '../security/sessions.js';
import { can, Permission } from '../security/rbac.js';
import { parseCookies } from './http_utils.js';
import { SESSION_COOKIE } from './server.js';
import { isStreamPath, cameraIdFromPath, authoriseStream, attachStreamViewer } from '../features/streaming/stream_socket.js';

const log = createLogger('websocket');
const HEARTBEAT_MS = 30000;

function authorise(req) {
    const cookies = parseCookies(req.headers.cookie);
    const actor = resolveSession(cookies[SESSION_COOKIE]);
    if (!actor) return null;
    if (actor.mustChangePassword) return null;
    if (!can(actor.role, Permission.LIVE_VIEW)) return null;
    return actor;
}

function reject(socket, status, message) {
    socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
}

export function attachEventSocket(server) {
    const events = new WebSocketServer({ noServer: true });
    const streams = new WebSocketServer({ noServer: true });
    const clients = new Set();

    server.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
        const actor = authorise(req);

        if (url.pathname === '/api/events') {
            if (!actor) {
                reject(socket, 401, 'Unauthorized');
                return;
            }

            events.handleUpgrade(req, socket, head, (ws) => {
                ws.isAlive = true;
                clients.add(ws);
                log.info('event client connected', { user: actor.username, clients: clients.size });

                ws.on('pong', () => { ws.isAlive = true; });
                ws.on('close', () => clients.delete(ws));
                ws.on('error', () => clients.delete(ws));

                ws.send(JSON.stringify({
                    topic: 'session.ready',
                    at: Date.now(),
                    payload: { username: actor.username, role: actor.role }
                }));
            });
            return;
        }

        if (isStreamPath(url.pathname)) {
            if (!authoriseStream(actor)) {
                reject(socket, 401, 'Unauthorized');
                return;
            }

            streams.handleUpgrade(req, socket, head, (ws) => {
                attachStreamViewer(ws, actor, cameraIdFromPath(url.pathname));
            });
            return;
        }

        socket.destroy();
    });

    const unsubscribe = subscribeAll((event) => {
        if (clients.size === 0) return;
        const message = JSON.stringify(event);
        for (const client of clients) {
            if (client.readyState === client.OPEN) client.send(message);
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
        events.close();
        streams.close();
    });

    return { clientCount: () => clients.size };
}
