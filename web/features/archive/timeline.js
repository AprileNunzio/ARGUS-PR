const HOUR_MS = 3600000;

export function createTimeline(onSeek) {
    const canvas = document.createElement('canvas');
    canvas.className = 'timeline__canvas';

    const label = document.createElement('div');
    label.className = 'timeline__cursor';

    const wrapper = document.createElement('div');
    wrapper.className = 'timeline';
    wrapper.append(canvas, label);

    let segments = [];
    let dayStart = 0;
    let dayEnd = 0;
    let marker = null;

    const styles = () => getComputedStyle(document.documentElement);

    const draw = () => {
        const ratio = window.devicePixelRatio || 1;
        const width = wrapper.clientWidth;
        const height = 56;

        canvas.width = Math.max(1, Math.floor(width * ratio));
        canvas.height = Math.floor(height * ratio);
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext('2d');
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const theme = styles();
        const span = dayEnd - dayStart;
        if (span <= 0) return;

        ctx.fillStyle = theme.getPropertyValue('--surface-3').trim() || '#e9eff6';
        ctx.fillRect(0, 18, width, 22);

        ctx.strokeStyle = theme.getPropertyValue('--rule').trim() || '#dce4ee';
        ctx.fillStyle = theme.getPropertyValue('--muted').trim() || '#64748b';
        ctx.font = '10px ui-monospace, monospace';
        ctx.lineWidth = 1;

        for (let hour = 0; hour <= 24; hour += 2) {
            const x = Math.round((hour * HOUR_MS / span) * width) + 0.5;
            ctx.beginPath();
            ctx.moveTo(x, 14);
            ctx.lineTo(x, 44);
            ctx.stroke();
            if (hour < 24) ctx.fillText(String(hour).padStart(2, '0'), x + 3, 11);
        }

        const accent = theme.getPropertyValue('--accent').trim() || '#1a7fbd';
        ctx.fillStyle = accent;

        for (const segment of segments) {
            const start = Math.max(segment.startedAt, dayStart);
            const end = Math.min(segment.startedAt + segment.durationMs, dayEnd);
            if (end <= start) continue;

            const x = ((start - dayStart) / span) * width;
            const w = Math.max(2, ((end - start) / span) * width);
            ctx.fillRect(x, 18, w, 22);
        }

        if (marker !== null) {
            const x = ((marker - dayStart) / span) * width;
            ctx.strokeStyle = theme.getPropertyValue('--bad').trim() || '#c62828';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 12);
            ctx.lineTo(x, 46);
            ctx.stroke();
        }
    };

    const positionToTime = (clientX) => {
        const rect = wrapper.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        return dayStart + ratio * (dayEnd - dayStart);
    };

    wrapper.addEventListener('click', (event) => {
        if (dayEnd <= dayStart) return;
        const time = positionToTime(event.clientX);
        marker = time;
        draw();
        onSeek(time);
    });

    wrapper.addEventListener('mousemove', (event) => {
        if (dayEnd <= dayStart) return;
        const time = positionToTime(event.clientX);
        label.textContent = new Date(time).toLocaleTimeString();
    });

    wrapper.addEventListener('mouseleave', () => { label.textContent = ''; });

    window.addEventListener('resize', draw);

    return {
        element: wrapper,
        update(nextSegments, start, end) {
            segments = nextSegments;
            dayStart = start;
            dayEnd = end;
            draw();
        },
        setMarker(time) {
            marker = time;
            draw();
        },
        redraw: draw
    };
}
