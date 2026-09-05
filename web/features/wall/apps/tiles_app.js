import { el, chip, empty } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, segmented } from '/assets/ui.js';
import { go } from '/assets/router.js';
import { createAutoSaver, autosaveBar } from './autosave.js';
import { renderScreenBoard, TILE_AUTO } from '../wall_screen_board.js';

export async function renderTilesApp({ api, payload, params = [] }) {
    const host = el('div', { className: 'xstack' });
    let config = JSON.parse(JSON.stringify(payload.config));
    let plans = payload.plans ?? {};
    const cameras = payload.cameras ?? [];

    let activeId = params[0] && config.screens.some((screen) => screen.id === params[0])
        ? params[0]
        : config.primaryScreen;

    const current = () => config.screens.find((screen) => screen.id === activeId) ?? config.screens[0];

    const saver = createAutoSaver({
        api,
        onApplied: (result) => {
            config = JSON.parse(JSON.stringify(result.config));
            plans = result.plans ?? plans;
            render();
        }
    });

    const touch = () => {
        saver.save(config);
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
        touch();
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
                            touch();
                        }
                    }, [icon('refresh'), el('span', { textContent: 'Tutto automatico' })])
                ])
            ]),
            autosaveBar(saver.element),
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

    host.addEventListener('argus:teardown', () => saver.stop());

    render();
    return host;
}
