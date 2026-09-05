import { el, chip } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, segmented } from '/assets/ui.js';
import { createAutoSaver, autosaveBar } from './autosave.js';
import { renderCameraRoster } from '../wall_tiles.js';

export async function renderCamerasApp({ api, payload }) {
    const host = el('div', { className: 'xstack' });
    let config = JSON.parse(JSON.stringify(payload.config));
    const cameras = payload.cameras ?? [];
    let activeId = config.primaryScreen;

    const current = () => config.screens.find((screen) => screen.id === activeId) ?? config.screens[0];

    const saver = createAutoSaver({
        api,
        onApplied: (result) => {
            config = JSON.parse(JSON.stringify(result.config));
            render();
        }
    });

    const touch = () => {
        saver.save(config);
        render();
    };

    const render = () => {
        const screen = current();

        host.replaceChildren(
            el('div', { className: 'row row--between' }, [
                el('div', { className: 'row row--tight row--wrap' }, [
                    el('span', { className: 'xrow__hint', textContent: 'Le scelte valgono per lo schermo:' }),
                    segmented(
                        config.screens.map((entry) => ({ value: entry.id, label: entry.label, icon: 'monitor' })),
                        screen.id,
                        (value) => {
                            activeId = value;
                            render();
                        },
                        { compact: true }
                    )
                ])
            ]),
            autosaveBar(saver.element),
            card({
                title: 'Telecamere e qualita del flusso',
                subtitle: `Escludi i canali che non devono comparire su ${screen.label} e scegli Main HD o Sub SD per ognuno`,
                iconName: 'camera',
                tone: 'emerald',
                badge: chip(`${cameras.length} canali`, 'info'),
                body: [
                    renderCameraRoster({
                        cameras,
                        config: screen,
                        onExclude: (cameraId, excluded) => {
                            screen.excluded = screen.excluded.filter((entry) => entry !== cameraId);
                            if (excluded) {
                                screen.excluded.push(cameraId);
                                screen.tiles = screen.tiles.filter((tile) => tile.cameraId !== cameraId);
                            }
                            touch();
                        },
                        onQuality: (cameraId, quality) => {
                            screen.quality = { ...screen.quality, [cameraId]: quality };
                            touch();
                        }
                    })
                ]
            })
        );
    };

    host.addEventListener('argus:teardown', () => saver.stop());

    render();
    return host;
}
