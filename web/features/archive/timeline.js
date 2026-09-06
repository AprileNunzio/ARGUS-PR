const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const TICK_STEPS = [
    SECOND, 2 * SECOND, 5 * SECOND, 10 * SECOND, 15 * SECOND, 30 * SECOND,
    MINUTE, 2 * MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE,
    HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR
];

const MIN_SPAN = 6 * SECOND;
const MIN_TICK_GAP = 68;
const HEIGHT = 92;
const TRACK_TOP = 34;
const TRACK_HEIGHT = 26;
const EVENT_TOP = 64;
const EVENT_HEIGHT = 14;
const DRAG_SLOP = 4;

const EVENT_COLOURS = {
    plate: '--info',
    person: '--brand',
    face: '--violet',
    car: '--ok',
    truck: '--ok',
    bus: '--ok',
    motorcycle: '--ok',
    motion: '--muted'
};

function pad(value) {
    return String(value).padStart(2, '0');
}

function clockLabel(time, step) {
    const date = new Date(time);
    if (step < MINUTE) return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    if (step < HOUR) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return `${pad(date.getHours())}:00`;
}

function preciseLabel(time) {
    const date = new Date(time);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function stepFor(span, width) {
    for (const step of TICK_STEPS) {
        if ((step / span) * width >= MIN_TICK_GAP) return step;
    }
    return TICK_STEPS[TICK_STEPS.length - 1];
}

export function createTimeline(onSeek) {
    const canvas = document.createElement('canvas');
    canvas.className = 'timeline__canvas';

    const cursor = document.createElement('div');
    cursor.className = 'timeline__cursor';

    const scale = document.createElement('span');
    scale.className = 'timeline__scale';

    const surface = document.createElement('div');
    surface.className = 'timeline';
    surface.append(canvas, cursor);

    let segments = [];
    let events = [];
    let dayStart = 0;
    let dayEnd = 0;
    let viewStart = 0;
    let viewEnd = 0;
    let marker = null;
    let hover = null;
    let dragging = null;

    const token = (name, fallback) => {
        const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return value || fallback;
    };

    const span = () => Math.max(1, viewEnd - viewStart);
    const timeToX = (time, width) => ((time - viewStart) / span()) * width;
    const xToTime = (x, width) => viewStart + (x / width) * span();

    function clampView(start, end) {
        const total = dayEnd - dayStart;
        let width = Math.min(Math.max(end - start, MIN_SPAN), total);
        let from = Math.min(Math.max(start, dayStart), dayEnd - width);
        viewStart = from;
        viewEnd = from + width;
    }

    function draw() {
        const ratio = window.devicePixelRatio || 1;
        const width = surface.clientWidth;
        if (width <= 0 || dayEnd <= dayStart) return;

        canvas.width = Math.max(1, Math.floor(width * ratio));
        canvas.height = Math.floor(HEIGHT * ratio);
        canvas.style.height = `${HEIGHT}px`;

        const ctx = canvas.getContext('2d');
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, HEIGHT);

        const visible = span();
        const step = stepFor(visible, width);

        ctx.fillStyle = token('--surface-3', '#e9eff6');
        ctx.fillRect(0, TRACK_TOP, width, TRACK_HEIGHT);

        ctx.strokeStyle = token('--rule', '#dce4ee');
        ctx.fillStyle = token('--muted', '#64748b');
        ctx.font = '10px ui-monospace, monospace';
        ctx.lineWidth = 1;

        const first = Math.ceil(viewStart / step) * step;
        for (let time = first; time <= viewEnd; time += step) {
            const x = Math.round(timeToX(time, width)) + 0.5;
            ctx.beginPath();
            ctx.moveTo(x, TRACK_TOP - 6);
            ctx.lineTo(x, TRACK_TOP + TRACK_HEIGHT + 4);
            ctx.stroke();
            ctx.fillText(clockLabel(time, step), x + 4, TRACK_TOP - 10);
        }

        ctx.fillStyle = token('--accent', '#1a7fbd');
        for (const segment of segments) {
            const start = Math.max(segment.startedAt, viewStart);
            const end = Math.min(segment.startedAt + segment.durationMs, viewEnd);
            if (end <= start) continue;
            const x = timeToX(start, width);
            const w = Math.max(1.5, timeToX(end, width) - x);
            ctx.fillRect(x, TRACK_TOP, w, TRACK_HEIGHT);
        }

        for (const event of events) {
            if (event.at < viewStart || event.at > viewEnd) continue;
            const x = Math.round(timeToX(event.at, width)) + 0.5;
            ctx.strokeStyle = token(EVENT_COLOURS[event.className] ?? '--brand', '#1a7fbd');
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, EVENT_TOP);
            ctx.lineTo(x, EVENT_TOP + EVENT_HEIGHT);
            ctx.stroke();
        }

        if (hover !== null) {
            const x = Math.round(timeToX(hover, width)) + 0.5;
            ctx.strokeStyle = token('--muted', '#64748b');
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(x, TRACK_TOP - 8);
            ctx.lineTo(x, EVENT_TOP + EVENT_HEIGHT);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        if (marker !== null && marker >= viewStart && marker <= viewEnd) {
            const x = Math.round(timeToX(marker, width)) + 0.5;
            ctx.strokeStyle = token('--bad', '#c62828');
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, TRACK_TOP - 10);
            ctx.lineTo(x, EVENT_TOP + EVENT_HEIGHT + 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x - 5, TRACK_TOP - 10);
            ctx.lineTo(x + 5, TRACK_TOP - 10);
            ctx.lineTo(x, TRACK_TOP - 4);
            ctx.closePath();
            ctx.fillStyle = token('--bad', '#c62828');
            ctx.fill();
        }

        const seconds = Math.round(visible / SECOND);
        scale.textContent = seconds < 120
            ? `finestra ${seconds} s`
            : `finestra ${(visible / MINUTE).toFixed(visible < HOUR ? 0 : 1)} ${visible < HOUR ? 'min' : 'min'}`;
    }

    function zoomAround(anchorTime, factor) {
        const current = span();
        const next = Math.min(Math.max(current * factor, MIN_SPAN), dayEnd - dayStart);
        const ratio = (anchorTime - viewStart) / current;
        clampView(anchorTime - ratio * next, anchorTime - ratio * next + next);
        draw();
    }

    canvas.addEventListener('wheel', (event) => {
        if (dayEnd <= dayStart) return;
        event.preventDefault();
        const width = surface.clientWidth;
        const rect = canvas.getBoundingClientRect();
        const anchor = xToTime(event.clientX - rect.left, width);
        zoomAround(anchor, event.deltaY > 0 ? 1.3 : 1 / 1.3);
    }, { passive: false });

    canvas.addEventListener('pointerdown', (event) => {
        if (dayEnd <= dayStart) return;
        canvas.setPointerCapture(event.pointerId);
        dragging = { x: event.clientX, start: viewStart, end: viewEnd, moved: 0 };
    });

    canvas.addEventListener('pointermove', (event) => {
        if (dayEnd <= dayStart) return;
        const width = surface.clientWidth;
        const rect = canvas.getBoundingClientRect();

        if (dragging) {
            const delta = event.clientX - dragging.x;
            dragging.moved = Math.max(dragging.moved, Math.abs(delta));
            const shift = (delta / width) * (dragging.end - dragging.start);
            clampView(dragging.start - shift, dragging.end - shift);
            draw();
            return;
        }

        hover = xToTime(event.clientX - rect.left, width);
        cursor.textContent = preciseLabel(hover);
        draw();
    });

    const endDrag = (event) => {
        if (!dragging) return;
        const moved = dragging.moved;
        const width = surface.clientWidth;
        const rect = canvas.getBoundingClientRect();
        dragging = null;
        if (moved <= DRAG_SLOP) {
            const time = xToTime(event.clientX - rect.left, width);
            marker = time;
            draw();
            onSeek(time);
        }
    };

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', () => { dragging = null; });

    canvas.addEventListener('pointerleave', () => {
        hover = null;
        cursor.textContent = '';
        draw();
    });

    canvas.addEventListener('dblclick', (event) => {
        const width = surface.clientWidth;
        const rect = canvas.getBoundingClientRect();
        zoomAround(xToTime(event.clientX - rect.left, width), 1 / 2.5);
    });

    window.addEventListener('resize', draw);

    const button = (label, title, handler) => {
        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'btn btn--sm btn--ghost';
        node.textContent = label;
        node.title = title;
        node.addEventListener('click', handler);
        return node;
    };

    const controls = document.createElement('div');
    controls.className = 'row row--tight timeline__controls';
    controls.append(
        button('−', 'Allarga la finestra', () => zoomAround((viewStart + viewEnd) / 2, 2)),
        button('+', 'Restringi la finestra', () => zoomAround((viewStart + viewEnd) / 2, 0.5)),
        button('Giornata', 'Mostra tutta la giornata', () => { clampView(dayStart, dayEnd); draw(); }),
        button('Al segnaposto', 'Centra sul punto riprodotto', () => {
            if (marker === null) return;
            const width = Math.max(MIN_SPAN, span());
            clampView(marker - width / 2, marker + width / 2);
            draw();
        }),
        scale
    );

    const element = document.createElement('div');
    element.className = 'stack stack--tight';
    element.append(surface, controls);

    return {
        element,
        update(nextSegments, start, end, nextEvents = []) {
            const firstLoad = dayEnd <= dayStart;
            segments = nextSegments ?? [];
            events = nextEvents ?? [];
            dayStart = start;
            dayEnd = end;
            if (firstLoad || viewEnd <= viewStart) clampView(start, end);
            else clampView(viewStart, viewEnd);
            draw();
        },
        setEvents(nextEvents) {
            events = nextEvents ?? [];
            draw();
        },
        setMarker(time) {
            marker = time;
            draw();
        },
        focus(time, windowMs = 60 * SECOND) {
            marker = time;
            clampView(time - windowMs / 2, time + windowMs / 2);
            draw();
        },
        redraw: draw
    };
}
