const CONTROL = Object.freeze({ INIT: 1, FRAGMENT: 2 });
const MIME_CANDIDATES = [
    'video/mp4; codecs="avc1.640029"',
    'video/mp4; codecs="avc1.4d402a"',
    'video/mp4; codecs="avc1.42E01E"'
];
const MAX_BUFFER_SECONDS = 12;

function pickMime() {
    if (typeof MediaSource === 'undefined') return null;
    return MIME_CANDIDATES.find((mime) => MediaSource.isTypeSupported(mime)) ?? null;
}

export function isPlaybackSupported() {
    return pickMime() !== null;
}

export function createLivePlayer(video, cameraId, callbacks = {}) {
    const mime = pickMime();
    if (!mime) {
        callbacks.onState?.('unsupported');
        return { destroy: () => {} };
    }

    let socket = null;
    let mediaSource = null;
    let sourceBuffer = null;
    let queue = [];
    let destroyed = false;
    let attempt = 0;

    const flush = () => {
        if (!sourceBuffer || sourceBuffer.updating || queue.length === 0) return;
        const chunk = queue.shift();
        const appended = (() => {
            try {
                sourceBuffer.appendBuffer(chunk);
                return true;
            } catch {
                return false;
            }
        })();
        if (!appended) queue = [];
    };

    const trim = () => {
        if (!sourceBuffer || sourceBuffer.updating) return;
        const buffered = sourceBuffer.buffered;
        if (buffered.length === 0) return;

        const end = buffered.end(buffered.length - 1);
        const start = buffered.start(0);
        if (end - start <= MAX_BUFFER_SECONDS) return;

        try {
            sourceBuffer.remove(start, end - MAX_BUFFER_SECONDS);
        } catch {
            return;
        }
    };

    const keepLive = () => {
        if (!video.buffered.length) return;
        const end = video.buffered.end(video.buffered.length - 1);
        if (end - video.currentTime > 3) video.currentTime = end - 0.4;
    };

    const openMedia = () => new Promise((resolve) => {
        mediaSource = new MediaSource();
        video.src = URL.createObjectURL(mediaSource);
        mediaSource.addEventListener('sourceopen', () => {
            sourceBuffer = mediaSource.addSourceBuffer(mime);
            sourceBuffer.mode = 'segments';
            sourceBuffer.addEventListener('updateend', () => {
                flush();
                trim();
                keepLive();
            });
            resolve();
        }, { once: true });
    });

    const connect = async () => {
        if (destroyed) return;

        callbacks.onState?.(attempt === 0 ? 'connecting' : 'reconnecting');
        await openMedia();

        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const quality = callbacks.quality === 'main' ? 'main' : 'sub';
        socket = new WebSocket(`${protocol}//${location.host}/api/stream/${encodeURIComponent(cameraId)}?quality=${quality}`);
        socket.binaryType = 'arraybuffer';

        socket.addEventListener('message', (event) => {
            const view = new Uint8Array(event.data);
            const kind = view[0];
            const payload = view.subarray(1);

            if (kind === CONTROL.INIT) {
                queue = [payload];
                attempt = 0;
                callbacks.onState?.('live');
            } else if (kind === CONTROL.FRAGMENT) {
                queue.push(payload);
                if (queue.length > 40) queue.splice(0, queue.length - 40);
            }

            flush();
            video.play().catch(() => undefined);
        });

        socket.addEventListener('close', () => {
            if (destroyed) return;
            attempt += 1;
            callbacks.onState?.('reconnecting');
            const delay = Math.min(1000 * 2 ** Math.min(attempt, 4), 15000);
            setTimeout(connect, delay);
        });

        socket.addEventListener('error', () => socket?.close());
    };

    connect();

    return {
        destroy: () => {
            destroyed = true;
            socket?.close();
            queue = [];
            if (mediaSource && mediaSource.readyState === 'open') {
                try {
                    mediaSource.endOfStream();
                } catch {
                    return;
                }
            }
            video.removeAttribute('src');
            video.load();
        }
    };
}
