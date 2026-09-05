import { el, chip, notice, empty } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, segmented } from '/assets/ui.js';
import { go } from '/assets/router.js';
import { renderScreenBoard, TILE_AUTO } from '../wall_screen_board.js';

export async function renderTilesApp({ api, payload, params = [] }) {
    const host = el('div', { className: 'xstack' });
    const feedback = el('div', {});

    let config = JSON.parse(JSON.stringify(payload.config));
    let plans = payload.plans ?? {};
    const cameras = payload.cameras ?? [];

    let activeId = params[0] && config.screens.some((screen) => screen.id === params[0])
        ? params[0]
        : config.primaryScreen;

    let dirty = false;

    const current = () => config.screens.find((screen) => screen.id === activeId) ?? config.screens[0];

    const save = async () => {
        const result = await api.put('/api/wall/config', config).catch((error) => ({ failure: error }));
        if (result.failure) {
            feedback.replaceChildren(notice('error', `Salvataggio non riuscito: ${result.failure.message}`));
            return;
        }
        config = JSON.parse(JSON.stringify(result.config));
        plans = result.plans ?? plans;
        dirty = false;
        feedback.replaceChildren(notice('ok', 'Disposizione salvata e applicata immediatamente allo schermo.'));
        render();
    };

    const assign = (index, value) => {
        const screen = current();
        screen.tiles = screen.tiles.filter((tile) => tile.index !== index);

        if (value !== TILE_AUTO) {
            if (value !== 'none') screen.tiles = screen.tiles.filter((tile) => tile.cameraId !== value);
            screen.tiles.push({ index, cameraId: value });
        }

        screen.tiles.sort((a, b) => a.index - b.index);
        dirty = true;
        render();
    };

    const render = () => {
        const screen = current();

        if (!screen) {
            host.replaceChildren(empty('Nessuno schermo configurato. Creane uno in Schermi e uscite.'));
            return;
        }

        const screenPicker = segmented(
            config.screens.map((entry) => ({ value: entry.id, label: entry.label, icon: 'monitor', hint: `Griglia ${entry.layout}` })),
            screen.id,
            (value) => {
                activeId = value;
                go('wall-settings', 'tiles', value);
            },
            { compact: true }
        );

        host.replaceChildren(
            feedback,
            el('div', { className: 'row row--between' }, [
                el('div', { className: 'row row--tight row--wrap' }, [
                    el('span', { className: 'xrow__hint', textContent: 'Schermo in configurazione:' }),
                    screenPicker
                ]),
                el('div', { className: 'row row--tight' }, [
                    el('button', {
                        className: 'btn btn--sm',
                        type: 'button',
                        onclick: () => {
                            screen.tiles = [];
                            dirty = true;
                            render();
                        }
                    }, [icon('refresh'), el('span', { textContent: 'Tutto automatico' })]),
                    el('button', {
                        className: dirty ? 'btn btn--primary' : 'btn',
                        type: 'button',
                        disabled: dirty ? null : 'disabled',
                        onclick: save
                    }, [icon('check'), el('span', { textContent: dirty ? 'Salva disposizione' : 'Nessuna modifica' })])
                ])
            ]),
            card({
                title: `Display di ${screen.label}`,
                subtitle: 'Ogni casella riproduce un riquadro reale del muro: scegli cosa mostrarci dentro',
                iconName: 'monitor',
                tone: 'purple',
                badge: chip(`Griglia ${screen.layout}`, 'info'),
                body: [
                    renderScreenBoard({
                        screen,
                        cameras,
                        plan: plans[screen.id] ?? [],
                        onChange: assign
                    })
                ]
            })
        );
    };

    render();
    return host;
}
