import { el, chip } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, segmented, toggle, optionRow } from '/assets/ui.js';
import { go } from '/assets/router.js';
import { createAutoSaver, autosaveBar } from './autosave.js';
import { tileCount } from '../wall_screen_board.js';

const LAYOUT_OPTIONS = [
    { value: 'auto', label: 'Auto', icon: 'sparkles', hint: 'Adatta la griglia al numero di canali' },
    { value: '1', label: '1', icon: 'monitor', hint: 'Un solo riquadro a pieno schermo' },
    { value: '4', label: '4', icon: 'grid', hint: 'Griglia 2x2' },
    { value: '9', label: '9', icon: 'grid', hint: 'Griglia 3x3' },
    { value: '16', label: '16', icon: 'apps', hint: 'Griglia 4x4' },
    { value: '25', label: '25', icon: 'apps', hint: 'Griglia 5x5' },
    { value: '36', label: '36', icon: 'apps', hint: 'Griglia 6x6' },
    { value: '64', label: '64', icon: 'apps', hint: 'Griglia 8x8, solo per monitor 4K' }
];

const QUALITY_OPTIONS = [
    { value: 'sub', label: 'Sub SD', icon: 'zap', hint: 'Basso bitrate, adatto a molti riquadri' },
    { value: 'main', label: 'Main HD', icon: 'sparkles', hint: 'Alta risoluzione, piu banda e CPU' }
];

export async function renderScreensApp({ api, payload }) {
    const host = el('div', { className: 'xstack' });
    let config = JSON.parse(JSON.stringify(payload.config));
    let displays = payload.displays ?? [];
    let cameras = payload.cameras ?? [];

    const saver = createAutoSaver({
        api,
        onApplied: (result) => {
            config = JSON.parse(JSON.stringify(result.config));
            displays = result.displays ?? displays;
            cameras = result.cameras ?? cameras;
        }
    });

    const touch = ({ redraw = true } = {}) => {
        saver.save(config);
        if (redraw) render();
    };

    const addScreen = (display) => {
        const id = display?.id ?? `schermo-${config.screens.length + 1}`;
        if (config.screens.some((screen) => screen.id === id)) return;

        config.screens.push({
            id,
            label: display?.label ?? `Schermo ${config.screens.length + 1}`,
            enabled: true,
            layout: 'auto',
            defaultQuality: 'sub',
            tiles: [],
            excluded: [],
            quality: {}
        });

        touch();
    };

    const screenCard = (screen, index) => {
        const activeCameras = cameras.filter((camera) => camera.enabled && !screen.excluded.includes(camera.id));
        const slots = tileCount(screen.layout, activeCameras.length);
        const isPrimary = config.primaryScreen === screen.id;

        const nameInput = el('input', { className: 'input', value: screen.label });
        nameInput.addEventListener('input', () => {
            screen.label = nameInput.value;
            touch({ redraw: false });
        });

        return card({
            title: screen.label,
            subtitle: `Identificativo uscita: ${screen.id}`,
            iconName: 'monitor',
            tone: isPrimary ? 'emerald' : 'cyan',
            badge: el('div', { className: 'row row--tight' }, [
                isPrimary ? chip('Predefinito', 'ok') : null,
                chip(`${slots} riquadri`, 'info'),
                screen.enabled ? null : chip('Disattivato', 'warn')
            ]),
            actions: [
                el('button', {
                    className: 'btn btn--sm',
                    type: 'button',
                    onclick: () => go('wall-settings', 'tiles', screen.id)
                }, [icon('crop'), el('span', { textContent: 'Disponi riquadri' })]),
                el('button', {
                    className: 'btn btn--sm',
                    type: 'button',
                    onclick: () => window.open(`/wall?screen=${encodeURIComponent(screen.id)}`, '_blank')
                }, [icon('play'), el('span', { textContent: 'Anteprima' })]),
                config.screens.length > 1 ? el('button', {
                    className: 'btn btn--sm btn--danger',
                    type: 'button',
                    onclick: () => {
                        config.screens.splice(index, 1);
                        if (config.primaryScreen === screen.id) config.primaryScreen = config.screens[0].id;
                        touch();
                    }
                }, [icon('trash'), el('span', { textContent: 'Rimuovi' })]) : null
            ].filter(Boolean),
            body: [
                el('div', { className: 'field' }, [
                    el('label', { textContent: 'Nome dello schermo' }),
                    nameInput
                ]),
                optionRow({
                    title: 'Griglia di questo schermo',
                    hint: 'Ogni uscita ha la propria: su HDMI 1 puoi mostrare una sola telecamera e su HDMI 2 sedici',
                    iconName: 'grid',
                    control: segmented(LAYOUT_OPTIONS, screen.layout, (value) => {
                        screen.layout = value;
                        touch();
                    }, { compact: true })
                }),
                optionRow({
                    title: 'Qualita predefinita',
                    hint: 'Applicata ai canali di questo schermo senza una scelta esplicita',
                    iconName: 'activity',
                    control: segmented(QUALITY_OPTIONS, screen.defaultQuality, (value) => {
                        screen.defaultQuality = value;
                        touch();
                    }, { compact: true })
                }),
                optionRow({
                    title: 'Schermo attivo',
                    hint: 'Uno schermo disattivato resta configurato ma non viene proposto',
                    iconName: 'monitor',
                    control: toggle(screen.enabled, (value) => {
                        screen.enabled = value;
                        touch();
                    })
                }),
                optionRow({
                    title: 'Schermo predefinito',
                    hint: 'Usato dal muro aperto senza indicare quale schermo, ad esempio dal browser',
                    iconName: 'shield',
                    control: el('button', {
                        className: isPrimary ? 'btn btn--sm btn--primary' : 'btn btn--sm',
                        type: 'button',
                        textContent: isPrimary ? 'Predefinito' : 'Imposta come predefinito',
                        onclick: () => {
                            config.primaryScreen = screen.id;
                            touch();
                        }
                    })
                }),
                el('p', { className: 'xcard__note' }, [
                    icon('info'),
                    el('span', { textContent: `Per mostrare questo schermo su un monitor apri /wall?screen=${screen.id}. Il kiosk HDMI usa lo schermo predefinito se non gli viene indicato altro.` })
                ])
            ]
        });
    };

    const render = () => {
        const unused = displays.filter((display) => !config.screens.some((screen) => screen.id === display.id));

        host.replaceChildren(
            el('div', { className: 'row row--between' }, [
                el('div', { className: 'row row--tight row--wrap' }, [
                    el('span', { className: 'xrow__hint', textContent: 'Aggiungi uno schermo da un uscita rilevata:' }),
                    ...unused.map((display) => el('button', {
                        className: 'btn btn--sm',
                        type: 'button',
                        onclick: () => addScreen(display)
                    }, [icon('monitor'), el('span', { textContent: `${display.label}${display.connected ? '' : ' (nessun segnale)'}` })])),
                    el('button', {
                        className: 'btn btn--sm',
                        type: 'button',
                        onclick: () => addScreen(null)
                    }, [icon('plus'), el('span', { textContent: 'Schermo generico' })])
                ])
            ]),
            autosaveBar(saver.element),
            ...config.screens.map(screenCard)
        );
    };

    host.addEventListener('argus:teardown', () => saver.stop());

    render();
    return host;
}
