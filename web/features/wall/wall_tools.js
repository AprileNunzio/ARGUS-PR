import { icon } from '/assets/icons.js';

const PLAYBACK_WINDOW_MS = 5 * 60 * 1000;

function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined) continue;
        if (key === 'className' || key === 'textContent') node[key] = value;
        else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
        else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) {
        if (child) node.append(child);
    }
    return node;
}

async function request(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message ?? `${path} -> ${response.status}`);
    return payload;
}

function send(path, body) {
    return request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {})
    });
}

export function captureFrame(video, cameraName) {
    if (!video.videoWidth || !video.videoHeight) throw new Error('Fotogramma non ancora disponibile');

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeName = String(cameraName ?? 'telecamera').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

    const link = el('a', {
        href: canvas.toDataURL('image/png'),
        download: `${safeName}-${stamp}.png`
    });

    document.body.append(link);
    link.click();
    link.remove();
}

export async function latestSegment(cameraId) {
    const now = Date.now();
    const payload = await request(`/api/archive/${encodeURIComponent(cameraId)}/segments?from=${now - PLAYBACK_WINDOW_MS}&to=${now}`);
    const segments = payload.segments ?? [];
    if (segments.length === 0) return null;
    return segments[segments.length - 1];
}

export function createToolbar({ camera, video, onQuality, onSpotlight, onRestart, onNotice, onPlayback, isSpotlight }) {
    const buttons = [];

    const make = (id, label, glyph, handler, { toggle = false } = {}) => {
        const button = el('button', {
            type: 'button',
            className: 'console__tool-btn',
            title: label,
            onclick: async (event) => {
                event.stopPropagation();
                button.disabled = true;
                try {
                    await handler(button);
                } catch (error) {
                    onNotice(`${label}: ${error.message}`);
                } finally {
                    button.disabled = false;
                }
            }
        }, [icon(glyph), el('span', { className: 'console__tool-label', textContent: label })]);

        button.dataset.tool = id;
        if (toggle) button.classList.add('console__tool-btn--toggle');
        buttons.push(button);
        return button;
    };

    make('playback', 'Ultimi 5 minuti', 'timeline', async () => {
        const segment = await latestSegment(camera.id);
        if (!segment) throw new Error('nessuna registrazione recente');
        onPlayback(segment);
    });

    const qualityButton = make(
        'quality',
        camera.quality === 'main' ? 'Passa a Sub SD' : 'Passa a Main HD',
        camera.quality === 'main' ? 'zap' : 'sparkles',
        () => onQuality(camera.quality === 'main' ? 'sub' : 'main')
    );

    make('snapshot', 'Scatta foto', 'camera', () => {
        captureFrame(video, camera.name);
        onNotice('Fotogramma salvato');
    });

    const recordButton = make('record', 'Registrazione', 'record', async (button) => {
        const active = button.classList.contains('console__tool-btn--active');
        await send(`/api/recording/${encodeURIComponent(camera.id)}`, { enabled: !active });
        button.classList.toggle('console__tool-btn--active', !active);
        onNotice(active ? 'Registrazione interrotta' : 'Registrazione avviata');
    }, { toggle: true });

    const automationButton = make('automation', 'Automazioni', 'zap', async (button) => {
        const active = button.classList.contains('console__tool-btn--active');
        const outcome = await send(`/api/automation/cameras/${encodeURIComponent(camera.id)}/enabled`, { enabled: !active });
        button.classList.toggle('console__tool-btn--active', !active);
        onNotice(`${outcome.rules} regole ${active ? 'disattivate' : 'attivate'}`);
    }, { toggle: true });

    make('restart', 'Riavvia il flusso', 'refresh', async () => {
        await request(`/api/streams/${encodeURIComponent(camera.id)}`, { method: 'DELETE' });
        onRestart();
        onNotice('Flusso riavviato');
    });

    make('fullscreen', 'Schermo intero', 'monitor', async (button) => {
        const cell = button.closest('.console__cell');
        if (document.fullscreenElement) await document.exitFullscreen();
        else await cell?.requestFullscreen?.();
    });

    make('detail', 'Apri scheda telecamera', 'settings', () => {
        window.open(`/#/cameras/${encodeURIComponent(camera.id)}`, '_blank');
    });

    make('archive', 'Apri archivio', 'archive', () => {
        window.open(`/#/archive/${encodeURIComponent(camera.id)}`, '_blank');
    });

    make('spotlight', isSpotlight ? 'Torna alla griglia' : 'Ingrandisci', 'crop', () => onSpotlight());

    const element = el('div', { className: 'console__tools' }, buttons);

    const syncState = async () => {
        const recorders = await request('/api/recording').catch(() => null);
        const entry = recorders?.recorders?.find((item) => item.cameraId === camera.id);
        recordButton.classList.toggle('console__tool-btn--active', entry?.state === 'recording');

        const automation = await request(`/api/automation/cameras/${encodeURIComponent(camera.id)}`).catch(() => null);
        automationButton.classList.toggle('console__tool-btn--active', (automation?.enabled ?? 0) > 0);
        automationButton.hidden = (automation?.total ?? 0) === 0;
    };

    syncState();

    return { element, qualityButton, syncState };
}
