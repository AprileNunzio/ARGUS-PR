import { el, chip, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, segmented } from '/assets/ui.js';
import { renderCameraRoster } from '../wall_tiles.js';

export async function renderCamerasApp({ api, payload }) {
    const host = el('div', { className: 'xstack' });
    const feedback = el('div', {});

    let config = JSON.parse(JSON.stringify(payload.config));
    const cameras = payload.cameras ?? [];
    let activeId = config.primaryScreen;
    let dirty = false;

    const current = () => config.screens.find((screen) => screen.id === activeId) ?? config.screens[0];

    const save = async () => {
        const result = await api.put('/api/wall/config', config).catch((error) => ({ failure: error }));
        if (result.failure) {
            feedback.replaceChildren(notice('error', `Salvataggio non riuscito: ${result.failure.message}`));
            return;
        }
        config = JSON.parse(JSON.stringify(result.config));
        dirty = false;
        feedback.replaceChildren(notice('ok', 'Impostazioni dei canali salvate e applicate al muro.'));
        render();
    };

    const render = () => {
        const screen = current();

        host.replaceChildren(
            feedback,
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
                ]),
                el('button', {
                    className: dirty ? 'btn btn--primary' : 'btn',
                    type: 'button',
                    disabled: dirty ? null : 'disabled',
                    onclick: save
                }, [icon('check'), el('span', { textContent: dirty ? 'Salva canali' : 'Nessuna modifica' })])
            ]),
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
                            dirty = true;
                            render();
                        },
                        onQuality: (cameraId, quality) => {
                            screen.quality = { ...screen.quality, [cameraId]: quality };
                            dirty = true;
                            render();
                        }
                    })
                ]
            })
        );
    };

    render();
    return host;
}
