import { el, chip, empty, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { createLivePlayer, isPlaybackSupported } from './player.js';

const LAYOUTS = [
    { id: 'auto', label: 'Auto', icon: 'gauge' },
    { id: 'one', label: '1', icon: 'crop' },
    { id: 'two', label: '4', icon: 'grid' },
    { id: 'three', label: '9', icon: 'apps' }
];

const STATE_LABEL = Object.freeze({
    connecting: 'Connessione',
    reconnecting: 'Riconnessione',
    live: 'In diretta',
    unsupported: 'Non supportato'
});

const STATE_TONE = Object.freeze({
    connecting: 'warn',
    reconnecting: 'warn',
    live: 'ok',
    unsupported: 'bad'
});

function cameraTile(camera, players) {
    const video = el('video', { className: 'tile__video', autoplay: 'autoplay', muted: 'muted', playsinline: 'playsinline' });
    video.muted = true;

    const badge = chip('avvio', 'warn');
    const overlay = el('div', { className: 'tile__overlay' }, [
        el('span', { className: 'tile__name' }, [icon('camera'), el('span', { textContent: camera.name })]),
        badge
    ]);

    const tile = el('div', { className: 'tile tile--live' }, [video, overlay]);

    const player = createLivePlayer(video, camera.id, {
        onState: (state) => {
            badge.className = `chip chip--${STATE_TONE[state] ?? 'warn'}`;
            badge.textContent = STATE_LABEL[state] ?? state;
            tile.classList.toggle('tile--offline', state !== 'live');
        }
    });

    players.push(player);
    return tile;
}

export async function renderLive({ api }) {
    const { cameras } = await api.get('/api/cameras');
    const active = cameras.filter((camera) => camera.enabled);
    const players = [];

    const wall = el('div', { className: 'wall wall--auto' });

    const view = el('div', { className: 'view' }, [
        el('div', { className: 'section__head' }, [
            el('span', { className: 'section__title' }, [icon('play'), 'Diretta']),
            el('div', { className: 'row row--tight' },
                LAYOUTS.map((layout) => el('button', {
                    className: layout.id === 'auto' ? 'seg__btn seg__btn--on' : 'seg__btn',
                    type: 'button',
                    title: `Griglia ${layout.label}`,
                    onclick: (event) => {
                        wall.className = `wall wall--${layout.id}`;
                        for (const button of event.currentTarget.parentElement.children) {
                            button.className = 'seg__btn';
                        }
                        event.currentTarget.className = 'seg__btn seg__btn--on';
                    }
                }, [el('span', { textContent: layout.label })]))
            )
        ]),
        wall
    ]);

    if (!isPlaybackSupported()) {
        wall.replaceChildren(notice('error', 'Questo browser non supporta Media Source Extensions: la diretta non è riproducibile.'));
        return view;
    }

    if (active.length === 0) {
        wall.replaceChildren(el('div', { className: 'panel' }, [
            empty('Nessun canale attivo. Aggiungi una telecamera per vedere la diretta.')
        ]));
        return view;
    }

    wall.replaceChildren(...active.map((camera) => cameraTile(camera, players)));

    view.addEventListener('argus:teardown', () => {
        for (const player of players) player.destroy();
    });

    return view;
}
