export const CLASS_LABELS = {
    person: 'Persona',
    vehicle: 'Veicolo',
    car: 'Auto',
    truck: 'Camion',
    bus: 'Autobus',
    motorcycle: 'Moto',
    bicycle: 'Bicicletta',
    train: 'Treno',
    boat: 'Imbarcazione',
    airplane: 'Aeromobile',
    animal: 'Animale',
    dog: 'Cane',
    cat: 'Gatto',
    bird: 'Uccello',
    horse: 'Cavallo',
    sheep: 'Pecora',
    cow: 'Bovino',
    bear: 'Orso',
    elephant: 'Elefante',
    zebra: 'Zebra',
    giraffe: 'Giraffa',
    backpack: 'Zaino',
    handbag: 'Borsa',
    suitcase: 'Valigia',
    face: 'Volto',
    plate: 'Targa'
};

const CLASS_COLOURS = {
    person: '#38bdf8',
    vehicle: '#a78bfa',
    car: '#a78bfa',
    truck: '#a78bfa',
    bus: '#a78bfa',
    motorcycle: '#c084fc',
    bicycle: '#c084fc',
    train: '#8b5cf6',
    boat: '#818cf8',
    airplane: '#818cf8',
    animal: '#fbbf24',
    dog: '#fbbf24',
    cat: '#fb923c',
    bird: '#facc15',
    horse: '#f59e0b',
    sheep: '#fcd34d',
    cow: '#f59e0b',
    bear: '#d97706',
    elephant: '#eab308',
    zebra: '#fde047',
    giraffe: '#f59e0b',
    backpack: '#f87171',
    handbag: '#f87171',
    suitcase: '#ef4444',
    face: '#34d399',
    plate: '#f472b6'
};

const FALLBACK_COLOUR = '#94a3b8';

export function labelFor(className) {
    return CLASS_LABELS[className] ?? className;
}

export function colourFor(className) {
    return CLASS_COLOURS[className] ?? FALLBACK_COLOUR;
}

function drawCorners(context, x, y, width, height, colour) {
    const arm = Math.max(10, Math.min(width, height) * 0.22);

    context.strokeStyle = colour;
    context.lineWidth = 2.5;
    context.lineCap = 'round';
    context.beginPath();

    context.moveTo(x, y + arm);
    context.lineTo(x, y);
    context.lineTo(x + arm, y);

    context.moveTo(x + width - arm, y);
    context.lineTo(x + width, y);
    context.lineTo(x + width, y + arm);

    context.moveTo(x + width, y + height - arm);
    context.lineTo(x + width, y + height);
    context.lineTo(x + width - arm, y + height);

    context.moveTo(x + arm, y + height);
    context.lineTo(x, y + height);
    context.lineTo(x, y + height - arm);

    context.stroke();
}

function drawCaption(context, x, y, text, colour) {
    context.font = '600 12px ui-monospace, "Cascadia Mono", Consolas, monospace';
    const metrics = context.measureText(text);
    const paddingX = 6;
    const boxHeight = 18;
    const boxY = y - boxHeight < 2 ? y + 2 : y - boxHeight - 2;

    context.fillStyle = 'rgba(7, 11, 18, .78)';
    context.fillRect(x, boxY, metrics.width + paddingX * 2, boxHeight);
    context.fillStyle = colour;
    context.fillRect(x, boxY, 3, boxHeight);
    context.fillStyle = '#e8eef7';
    context.fillText(text, x + paddingX, boxY + 13);
}

function contentRect(video, width, height) {
    const sourceWidth = video?.videoWidth ?? 0;
    const sourceHeight = video?.videoHeight ?? 0;

    if (sourceWidth === 0 || sourceHeight === 0) return { left: 0, top: 0, width, height };

    const scale = Math.min(width / sourceWidth, height / sourceHeight);
    const drawnWidth = sourceWidth * scale;
    const drawnHeight = sourceHeight * scale;

    return {
        left: (width - drawnWidth) / 2,
        top: (height - drawnHeight) / 2,
        width: drawnWidth,
        height: drawnHeight
    };
}

export function createOverlay(video = null) {
    const element = document.createElement('canvas');
    element.className = 'console__overlay';

    const context = element.getContext('2d');
    let boxes = [];
    let receivedAt = 0;
    let settings = null;
    let frame = null;

    const paint = () => {
        frame = null;
        const width = element.clientWidth;
        const height = element.clientHeight;
        if (width === 0 || height === 0) return;

        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
            element.width = Math.round(width * ratio);
            element.height = Math.round(height * ratio);
        }

        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);

        if (!settings?.enabled || boxes.length === 0) return;
        if (Date.now() - receivedAt > settings.holdMs) {
            boxes = [];
            return;
        }

        const rect = contentRect(video, width, height);

        for (const entry of boxes) {
            const colour = colourFor(entry.className);
            const x = rect.left + entry.box[0] * rect.width;
            const y = rect.top + entry.box[1] * rect.height;
            const boxWidth = entry.box[2] * rect.width;
            const boxHeight = entry.box[3] * rect.height;

            if (settings.style === 'glow') {
                context.shadowColor = colour;
                context.shadowBlur = 14;
            } else {
                context.shadowBlur = 0;
            }

            if (settings.style === 'corner') {
                drawCorners(context, x, y, boxWidth, boxHeight, colour);
            } else {
                context.strokeStyle = colour;
                context.lineWidth = 2;
                context.strokeRect(x, y, boxWidth, boxHeight);
            }

            context.shadowBlur = 0;

            const parts = [];
            if (settings.showLabel) parts.push(entry.plate ?? labelFor(entry.className));
            if (settings.showConfidence) parts.push(`${Math.round(entry.confidence * 100)}%`);
            if (settings.showTrackId) parts.push(`#${entry.id}`);
            if (parts.length > 0) drawCaption(context, x, y, parts.join('  '), colour);
        }
    };

    const schedule = () => {
        if (frame !== null) return;
        frame = requestAnimationFrame(paint);
    };

    return {
        element,
        configure(overlay) {
            settings = overlay;
            element.hidden = !overlay?.enabled;
            schedule();
        },
        apply(payload) {
            if (!settings?.enabled) return;

            boxes = (payload.boxes ?? []).filter((entry) => (
                settings.classes.includes(entry.className) && entry.confidence >= settings.minConfidence
            ));

            receivedAt = Date.now();
            schedule();
        },
        refresh: schedule,
        destroy() {
            if (frame !== null) cancelAnimationFrame(frame);
            boxes = [];
        }
    };
}
