const JSON_HEADERS = { 'Content-Type': 'application/json' };

export class ApiError extends Error {
    constructor(status, payload) {
        super(payload?.error?.message ?? `Request failed (${status})`);
        this.name = 'ApiError';
        this.status = status;
        this.code = payload?.error?.code ?? 'UNKNOWN';
        this.details = payload?.error?.details ?? null;
    }
}

async function request(method, path, body) {
    const response = await fetch(path, {
        method,
        headers: body ? JSON_HEADERS : undefined,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin'
    });

    const text = await response.text();
    const payload = text.length > 0 ? JSON.parse(text) : {};

    if (!response.ok) throw new ApiError(response.status, payload);
    return payload;
}

export const api = {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body ?? {}),
    put: (path, body) => request('PUT', path, body ?? {}),
    remove: (path) => request('DELETE', path, {})
};

export function connectEvents(onEvent, onStateChange) {
    let socket = null;
    let attempt = 0;
    let closed = false;

    const open = () => {
        if (closed) return;
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${location.host}/api/events`);

        socket.addEventListener('open', () => {
            attempt = 0;
            onStateChange?.('online');
        });

        socket.addEventListener('message', (event) => {
            const parsed = JSON.parse(event.data);
            onEvent(parsed);
        });

        socket.addEventListener('close', () => {
            onStateChange?.('offline');
            if (closed) return;
            attempt += 1;
            const delay = Math.min(1000 * 2 ** Math.min(attempt, 5), 30000);
            setTimeout(open, delay);
        });

        socket.addEventListener('error', () => socket?.close());
    };

    open();

    return () => {
        closed = true;
        socket?.close();
    };
}
