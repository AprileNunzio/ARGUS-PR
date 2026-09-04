const LIVE_TOPICS = new Set([
    'wall.config',
    'time.config',
    'settings.changed',
    'camera.created',
    'camera.updated',
    'camera.deleted'
]);

export function connectWallEvents(onChange, onLinkState) {
    let socket = null;
    let attempt = 0;
    let closed = false;

    const open = () => {
        if (closed) return;

        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${location.host}/api/events`);

        socket.addEventListener('open', () => {
            attempt = 0;
            onLinkState?.('online');
        });

        socket.addEventListener('message', (event) => {
            const parsed = (() => {
                try {
                    return JSON.parse(event.data);
                } catch {
                    return null;
                }
            })();

            if (parsed && LIVE_TOPICS.has(parsed.topic)) onChange(parsed.topic);
        });

        socket.addEventListener('close', () => {
            onLinkState?.('offline');
            if (closed) return;
            attempt += 1;
            setTimeout(open, Math.min(1000 * 2 ** Math.min(attempt, 5), 30000));
        });

        socket.addEventListener('error', () => socket?.close());
    };

    open();

    return () => {
        closed = true;
        socket?.close();
    };
}
