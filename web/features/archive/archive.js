import { t } from '/assets/i18n.js';
import { el, chip, empty, notice, formatBytes } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { createTimeline } from './timeline.js';
import { renderExportPanel } from './export_panel.js';
import { createTransport } from './transport.js';

const DAY_MS = 86400000;
const FOCUS_WINDOW_MS = 40000;

function pad(value) {
    return String(value).padStart(2, '0');
}

export function dayKeyOf(milliseconds) {
    const date = new Date(milliseconds);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayBounds(dayKey) {
    const [year, month, day] = dayKey.split('-').map(Number);
    const start = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    return { start, end: start + DAY_MS };
}

function stamp(milliseconds) {
    const date = new Date(milliseconds);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

export async function renderArchive({ api, session, params = [] }) {
    const { cameras } = await api.get('/api/cameras');

    const video = el('video', { className: 'archive__video', controls: 'controls', preload: 'metadata' });
    const stats = el('div', { className: 'row row--tight' });
    const feedback = el('div', {});
    const readout = el('div', { className: 'archive__readout mono' });
    const segmentInfo = el('div', { className: 'section__hint mono' });

    const targetCameraId = params[0] || null;
    const targetTimestamp = params[1] ? Number(params[1]) : null;

    const cameraSelect = el('select', { className: 'select' },
        cameras.map((camera) => el('option', {
            value: camera.id,
            textContent: camera.name,
            selected: camera.id === targetCameraId
        })));

    const daySelect = el('select', { className: 'select' });

    let segments = [];
    let currentSegment = null;
    let bounds = dayBounds(dayKeyOf(Date.now()));

    const mediaUrl = (segment) =>
        `/api/archive/${encodeURIComponent(cameraSelect.value)}/media?file=${encodeURIComponent(segment.file)}`;

    const playAt = (time, { autoplay = true } = {}) => {
        const target = segments.find((segment) =>
            time >= segment.startedAt && time < segment.startedAt + segment.durationMs);

        if (!target) {
            feedback.replaceChildren(notice('warn', 'Nessuna registrazione in questo istante.'));
            return;
        }

        feedback.replaceChildren();
        const offset = Math.max(0, (time - target.startedAt) / 1000);

        if (currentSegment && currentSegment.file === target.file && video.readyState >= 1) {
            video.currentTime = Math.min(offset, Math.max(0, video.duration - 0.05));
            if (autoplay) video.play().catch(() => undefined);
            return;
        }

        currentSegment = target;
        segmentInfo.textContent = `${target.file} · ${(target.durationMs / 1000).toFixed(1)} s · ${formatBytes(target.bytes ?? 0)}`;
        video.src = mediaUrl(target);

        video.addEventListener('loadedmetadata', () => {
            video.currentTime = Math.min(offset, Math.max(0, video.duration - 0.05));
            if (autoplay) video.play().catch(() => undefined);
        }, { once: true });
    };

    const currentWallClock = () => {
        if (!currentSegment) return null;
        return currentSegment.startedAt + video.currentTime * 1000;
    };

    const timeline = createTimeline((time) => playAt(time));
    const transport = createTransport({
        video,
        onNudge: () => {
            const time = currentWallClock();
            if (time !== null) timeline.setMarker(time);
        }
    });

    const exportPanel = renderExportPanel({
        api,
        session,
        getContext: () => ({ cameraId: cameraSelect.value })
    });

    const loadDays = async () => {
        const cameraId = encodeURIComponent(cameraSelect.value);
        const { days } = await api.get(`/api/archive/${cameraId}/days`).catch(() => ({ days: [] }));
        const options = days.length > 0 ? days : [dayKeyOf(Date.now())];

        daySelect.replaceChildren(...options
            .slice()
            .reverse()
            .map((day) => el('option', { value: day, textContent: day })));

        return options[options.length - 1];
    };

    const loadEvents = async () => {
        const params = new URLSearchParams({
            cameraId: cameraSelect.value,
            from: new Date(bounds.start).toISOString(),
            to: new Date(bounds.end).toISOString(),
            limit: '500'
        });

        const data = await api.get(`/api/detections?${params.toString()}`).catch(() => ({ events: [] }));
        return (data.events ?? [])
            .map((event) => ({ at: new Date(event.startedAt).getTime(), className: event.className }))
            .filter((event) => Number.isFinite(event.at));
    };

    const loadSegments = async () => {
        bounds = dayBounds(daySelect.value || dayKeyOf(Date.now()));
        const cameraId = encodeURIComponent(cameraSelect.value);

        const result = await api
            .get(`/api/archive/${cameraId}/segments?from=${bounds.start}&to=${bounds.end}`)
            .catch(() => ({ segments: [], totalBytes: 0 }));

        segments = result.segments ?? [];
        currentSegment = null;

        const events = await loadEvents();
        timeline.update(segments, bounds.start, bounds.end, events);

        const covered = segments.reduce((sum, item) => sum + item.durationMs, 0);
        stats.replaceChildren(
            chip(`${segments.length} segmenti`, 'info'),
            chip(formatBytes(result.totalBytes ?? 0), 'violet'),
            chip(`${(covered / 3600000).toFixed(1)} ore`, 'ok'),
            chip(`${events.length} eventi`, events.length > 0 ? 'brand' : 'info')
        );

        if (segments.length === 0) {
            feedback.replaceChildren(notice('info', 'Nessuna registrazione per questo giorno. Attiva la registrazione dalla scheda Telecamere.'));
            return;
        }

        feedback.replaceChildren();
        const last = segments[segments.length - 1];
        exportPanel.setRange?.(segments[0].startedAt, last.startedAt + last.durationMs);
        playAt(segments[0].startedAt, { autoplay: false });
    };

    cameraSelect.addEventListener('change', async () => {
        daySelect.value = await loadDays();
        await loadSegments();
    });

    daySelect.addEventListener('change', loadSegments);

    video.addEventListener('timeupdate', () => {
        const time = currentWallClock();
        if (time === null) return;
        timeline.setMarker(time);
        readout.textContent = stamp(time);
    });

    video.addEventListener('ended', () => {
        if (!currentSegment) return;
        const next = segments.find((segment) => segment.startedAt >= currentSegment.startedAt + currentSegment.durationMs);
        if (next) playAt(next.startedAt);
    });

    const view = el('div', { className: 'view' }, [
        el('div', { className: 'section__head' }, [
            el('span', { className: 'section__title' }, [icon('archive'), 'Archivio']),
            el('div', { className: 'row row--tight' }, [cameraSelect, daySelect])
        ]),
        cameras.length === 0
            ? el('div', { className: 'panel' }, [empty('Nessuna telecamera configurata.')])
            : el('div', { className: 'stack' }, [
                el('div', { className: 'panel archive__stage' }, [video, readout]),
                transport.element,
                el('section', { className: 'panel' }, [
                    el('div', { className: 'panel__head' }, [
                        el('span', { className: 'panel__title' }, [icon('timeline'), 'Timeline']),
                        stats
                    ]),
                    el('div', { className: 'panel__body stack stack--tight' }, [
                        timeline.element,
                        segmentInfo,
                        el('p', { className: 'section__hint', textContent: t('archive.rotellaPerIngrandireTrasci', 'Rotella per ingrandire, trascina per scorrere, doppio clic per stringere sul punto. Spazio riproduce, frecce spostano di un secondo, virgola e punto di un fotogramma.') }),
                        feedback
                    ])
                ]),
                exportPanel.hidden ? null : exportPanel.element
            ])
    ]);

    if (cameras.length > 0) {
        queueMicrotask(async () => {
            const fallbackDay = await loadDays();
            daySelect.value = targetTimestamp ? dayKeyOf(targetTimestamp) : fallbackDay;
            if (!daySelect.value) daySelect.value = fallbackDay;

            await loadSegments();

            if (targetTimestamp) {
                timeline.focus(targetTimestamp, FOCUS_WINDOW_MS);
                playAt(targetTimestamp);
            }

            timeline.redraw();
            await exportPanel.refresh();
        });
    }

    return view;
}
