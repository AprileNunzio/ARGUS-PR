import { el, chip, empty, notice, formatBytes } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { createTimeline } from './timeline.js';

function dayBounds(dayKey) {
    const [year, month, day] = dayKey.split('-').map(Number);
    const start = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    return { start, end: start + 86400000 };
}

function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export async function renderArchive({ api }) {
    const { cameras } = await api.get('/api/cameras');

    const video = el('video', { className: 'archive__video', controls: 'controls', preload: 'metadata' });
    const stats = el('div', { className: 'row row--tight' });
    const feedback = el('div', {});

    const cameraSelect = el('select', { className: 'select' },
        cameras.map((camera) => el('option', { value: camera.id, textContent: camera.name })));

    const daySelect = el('select', { className: 'select' });

    let segments = [];
    let bounds = dayBounds(todayKey());

    const timeline = createTimeline((time) => playAt(time));

    const playAt = (time) => {
        const target = segments.find((segment) =>
            time >= segment.startedAt && time < segment.startedAt + segment.durationMs);

        if (!target) {
            feedback.replaceChildren(notice('warn', 'Nessuna registrazione in questo istante.'));
            return;
        }

        feedback.replaceChildren();
        const offset = Math.max(0, (time - target.startedAt) / 1000);
        const cameraId = encodeURIComponent(cameraSelect.value);
        video.src = `/api/archive/${cameraId}/media?file=${encodeURIComponent(target.file)}`;
        video.currentTime = 0;

        video.addEventListener('loadedmetadata', () => {
            video.currentTime = Math.min(offset, Math.max(0, video.duration - 0.2));
            video.play().catch(() => undefined);
        }, { once: true });
    };

    const loadDays = async () => {
        const cameraId = encodeURIComponent(cameraSelect.value);
        const { days } = await api.get(`/api/archive/${cameraId}/days`);
        const options = days.length > 0 ? days : [todayKey()];

        daySelect.replaceChildren(...options
            .slice()
            .reverse()
            .map((day) => el('option', { value: day, textContent: day })));

        return options[options.length - 1];
    };

    const loadSegments = async () => {
        bounds = dayBounds(daySelect.value || todayKey());
        const cameraId = encodeURIComponent(cameraSelect.value);

        const result = await api
            .get(`/api/archive/${cameraId}/segments?from=${bounds.start}&to=${bounds.end}`)
            .catch(() => ({ segments: [], totalBytes: 0 }));

        segments = result.segments;
        timeline.update(segments, bounds.start, bounds.end);

        const covered = segments.reduce((sum, item) => sum + item.durationMs, 0);

        stats.replaceChildren(
            chip(`${segments.length} segmenti`, 'info'),
            chip(formatBytes(result.totalBytes ?? 0), 'violet'),
            chip(`${(covered / 3600000).toFixed(1)} ore`, 'ok')
        );

        if (segments.length === 0) {
            feedback.replaceChildren(notice('info', 'Nessuna registrazione per questo giorno. Attiva la registrazione dalla scheda Telecamere.'));
            return;
        }

        feedback.replaceChildren();
        playAt(segments[0].startedAt);
    };

    cameraSelect.addEventListener('change', async () => {
        daySelect.value = await loadDays();
        await loadSegments();
    });

    daySelect.addEventListener('change', loadSegments);

    video.addEventListener('timeupdate', () => {
        const cameraId = cameraSelect.value;
        const current = segments.find((segment) => video.src.includes(encodeURIComponent(segment.file)));
        if (!current || !cameraId) return;
        timeline.setMarker(current.startedAt + video.currentTime * 1000);
    });

    const view = el('div', { className: 'view' }, [
        el('div', { className: 'section__head' }, [
            el('span', { className: 'section__title' }, [icon('archive'), 'Archivio']),
            el('div', { className: 'row row--tight' }, [cameraSelect, daySelect])
        ]),
        cameras.length === 0
            ? el('div', { className: 'panel' }, [empty('Nessuna telecamera configurata.')])
            : el('div', { className: 'stack' }, [
                el('div', { className: 'panel archive__stage' }, [video]),
                el('section', { className: 'panel' }, [
                    el('div', { className: 'panel__head' }, [
                        el('span', { className: 'panel__title' }, [icon('timeline'), 'Linea temporale']),
                        stats
                    ]),
                    el('div', { className: 'panel__body' }, [timeline.element, feedback])
                ])
            ])
    ]);

    if (cameras.length > 0) {
        queueMicrotask(async () => {
            daySelect.value = await loadDays();
            await loadSegments();
            timeline.redraw();
        });
    }

    return view;
}
