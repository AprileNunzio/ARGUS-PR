import { getSession } from './stream_hub.js';
import { can, Permission } from '../../security/rbac.js';
import { createLogger } from '../../kernel/logger.js';

const log = createLogger('stream-socket');

const CONTROL = Object.freeze({ INIT: 1, FRAGMENT: 2 });

function frame(kind, payload) {
    const header = Buffer.alloc(1);
    header.writeUInt8(kind, 0);
    return Buffer.concat([header, payload]);
}

class SocketViewer {
    constructor(socket) {
        this.socket = socket;
        this.gotInit = false;
    }

    sendInit(segment) {
        if (this.socket.readyState !== this.socket.OPEN) return;
        this.gotInit = true;
        this.socket.send(frame(CONTROL.INIT, segment));
    }

    sendFragment(fragment) {
        if (!this.gotInit) return;
        if (this.socket.readyState !== this.socket.OPEN) return;
        if (this.socket.bufferedAmount > 4 * 1024 * 1024) return;
        this.socket.send(frame(CONTROL.FRAGMENT, fragment));
    }

    close() {
        if (this.socket.readyState === this.socket.OPEN) this.socket.close(1000, 'stream closed');
    }
}

export function isStreamPath(pathname) {
    return pathname.startsWith('/api/stream/');
}

export function cameraIdFromPath(pathname) {
    return decodeURIComponent(pathname.slice('/api/stream/'.length));
}

export function qualityFromQuery(value) {
    return value === 'main' ? 'main' : 'sub';
}

export function authoriseStream(actor) {
    return Boolean(actor) && can(actor.role, Permission.LIVE_VIEW);
}

export function attachStreamViewer(socket, actor, cameraId, quality = 'sub') {
    const session = (() => {
        try {
            return getSession(cameraId, quality);
        } catch (error) {
            socket.close(1011, error.message.slice(0, 100));
            return null;
        }
    })();

    if (!session) return;

    const viewer = new SocketViewer(socket);
    session.addViewer(viewer);

    log.info('viewer attached', { camera: cameraId, quality: session.quality, user: actor.username, viewers: session.viewers.size });

    socket.on('close', () => {
        session.removeViewer(viewer);
        log.debug('viewer detached', { camera: cameraId, viewers: session.viewers.size });
    });

    socket.on('error', () => session.removeViewer(viewer));

    session.start().catch((error) => {
        log.error('session start failed', { camera: cameraId, message: error.message });
        socket.close(1011, 'stream unavailable');
    });
}
