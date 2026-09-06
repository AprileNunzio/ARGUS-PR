import { t } from '/assets/i18n.js';
import { el } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

const FRAME_SECONDS = 1 / 25;
const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4];

function isTyping(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
}

export function createTransport({ video, onNudge }) {
    const nudge = (seconds) => {
        if (!Number.isFinite(video.duration)) return;
        const next = Math.min(Math.max(0, video.currentTime + seconds), Math.max(0, video.duration - 0.02));
        video.currentTime = next;
        if (onNudge) onNudge();
    };

    const toggle = () => {
        if (video.paused) video.play().catch(() => undefined);
        else video.pause();
    };

    const step = (label, title, handler, iconName = null) => el('button', {
        type: 'button',
        className: 'btn btn--sm',
        title,
        onclick: handler
    }, iconName ? [icon(iconName), el('span', { textContent: label })] : [el('span', { textContent: label })]);

    const playButton = el('button', {
        type: 'button',
        className: 'btn btn--sm btn--primary',
        title: t('archive.riproduciOMettiInPausaBa', 'Riproduci o metti in pausa (barra spaziatrice)'),
        onclick: toggle
    }, [icon('play'), el('span', { textContent: t('archive.riproduci', 'Riproduci') })]);

    const syncPlayButton = () => {
        const label = playButton.querySelector('span');
        if (label) label.textContent = video.paused ? 'Riproduci' : 'Pausa';
    };

    video.addEventListener('play', syncPlayButton);
    video.addEventListener('pause', syncPlayButton);

    const speedSelect = el('select', { className: 'select select--sm', title: t('archive.velocitDiRiproduzione', 'Velocità di riproduzione') },
        SPEEDS.map((speed) => el('option', {
            value: String(speed),
            textContent: `${speed}×`,
            selected: speed === 1
        })));

    speedSelect.addEventListener('change', () => {
        video.playbackRate = Number(speedSelect.value) || 1;
    });

    const element = el('div', { className: 'panel' }, [
        el('div', { className: 'panel__body row row--tight archive__transport' }, [
            step('−10 s', 'Indietro di dieci secondi', () => nudge(-10)),
            step('−1 s', 'Indietro di un secondo', () => nudge(-1)),
            step('◀ fotogramma', 'Indietro di un fotogramma (virgola)', () => nudge(-FRAME_SECONDS)),
            playButton,
            step('fotogramma ▶', 'Avanti di un fotogramma (punto)', () => nudge(FRAME_SECONDS)),
            step('+1 s', 'Avanti di un secondo', () => nudge(1)),
            step('+10 s', 'Avanti di dieci secondi', () => nudge(10)),
            el('span', { className: 'spacer' }),
            el('span', { className: 'section__hint', textContent: t('archive.velocit', 'Velocità') }),
            speedSelect
        ])
    ]);

    document.addEventListener('keydown', (event) => {
        if (!element.isConnected || isTyping(event.target)) return;

        const actions = {
            ' ': () => toggle(),
            ArrowLeft: () => nudge(event.shiftKey ? -10 : -1),
            ArrowRight: () => nudge(event.shiftKey ? 10 : 1),
            ',': () => nudge(-FRAME_SECONDS),
            '.': () => nudge(FRAME_SECONDS)
        };

        const action = actions[event.key];
        if (!action) return;
        event.preventDefault();
        action();
    });

    return { element };
}
