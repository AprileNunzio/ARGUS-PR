import { el, chip, empty, field, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { go } from '/assets/router.js';

const CLASS_LABELS = {
    person: 'Persona',
    vehicle: 'Veicolo',
    car: 'Automobile',
    truck: 'Autocarro / Furgone',
    bus: 'Autobus',
    motorcycle: 'Motocicletta',
    bicycle: 'Bicicletta',
    dog: 'Cane',
    cat: 'Gatto',
    horse: 'Cavallo',
    cow: 'Mucca / Bestiame',
    sheep: 'Pecora',
    bear: 'Orso',
    bird: 'Volatile',
    animal: 'Animale',
    face: 'Volto',
    plate: 'Targa ANPR',
    motion: 'Movimento'
};

const ANIMAL_CLASSES = new Set(['dog', 'cat', 'horse', 'cow', 'sheep', 'bear', 'bird', 'animal']);
const VEHICLE_CLASSES = new Set(['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'vehicle']);

const COLOR_LABELS = {
    white: 'Maglia bianca',
    black: 'Abito nero',
    gray: 'Abito grigio',
    red: 'Abito rosso',
    blue: 'Abito blu',
    green: 'Abito verde',
    yellow: 'Abito giallo',
    orange: 'Abito arancione',
    purple: 'Abito viola'
};

export async function renderDetectionsView({ api, session }) {
    const outlet = el('div', { className: 'view' });
    let selectedFilter = 'all';
    let plateFilter = '';
    let colorFilter = '';
    let minConfFilter = 0;
    const statsHost = el('div', { className: 'grid--cols-2' });
    const listHost = el('div', { className: 'stack' });

    async function loadStats() {
        const stats = await api.get('/api/detections/stats/summary?windowHours=168').catch(() => null);
        if (!stats) {
            statsHost.replaceChildren();
            return;
        }

        const topPlates = stats.plates?.slice(0, 5) ?? [];
        const topPeople = stats.people?.slice(0, 5) ?? [];
        const topColors = stats.colors?.slice(0, 5) ?? [];

        const plateRows = topPlates.length === 0
            ? [el('span', { className: 'section__hint', textContent: 'Nessun transito targa recente' })]
            : topPlates.map((p) => el('button', {
                type: 'button',
                className: 'device-row row--spread',
                onclick: () => {
                    plateInput.value = p.plateText;
                    plateFilter = p.plateText;
                    loadEvents();
                }
            }, [
                el('strong', { className: 'font-mono', textContent: `🚗 ${p.plateText}` }),
                chip(`${p.count} passaggi`, 'info')
            ]));

        const colorRows = topColors.length === 0
            ? [el('span', { className: 'section__hint', textContent: 'Nessun attributo abbigliamento registrato' })]
            : topColors.map((c) => el('button', {
                type: 'button',
                className: 'device-row row--spread',
                onclick: () => {
                    colorSelect.value = c.upperColor;
                    colorFilter = c.upperColor;
                    loadEvents();
                }
            }, [
                el('strong', { textContent: `👕 ${COLOR_LABELS[c.upperColor] ?? c.upperColor}` }),
                chip(`${c.count} persone`, c.upperColor === 'white' ? 'ok' : 'brand')
            ]));

        statsHost.replaceChildren(
            el('section', { className: 'panel' }, [
                el('div', { className: 'panel__head' }, [
                    el('strong', { className: 'panel__title', textContent: 'Frequenza Veicoli & Targhe' })
                ]),
                el('div', { className: 'panel__body stack stack--tight' }, plateRows)
            ]),
            el('section', { className: 'panel' }, [
                el('div', { className: 'panel__head' }, [
                    el('strong', { className: 'panel__title', textContent: 'Frequenza Abbigliamento Persone' })
                ]),
                el('div', { className: 'panel__body stack stack--tight' }, colorRows)
            ])
        );
    }

    async function loadEvents() {
        const params = new URLSearchParams();
        if (selectedFilter !== 'all' && selectedFilter !== 'animals' && selectedFilter !== 'vehicles') {
            params.set('className', selectedFilter);
        }
        if (plateFilter.trim().length > 0) {
            params.set('plate', plateFilter.trim());
        }
        if (colorFilter.trim().length > 0) {
            params.set('upperColor', colorFilter.trim());
        }
        if (minConfFilter > 0) {
            params.set('minConfidence', String(minConfFilter / 100));
        }

        const queryStr = params.toString() ? `?${params.toString()}` : '';
        const data = await api.get(`/api/detections${queryStr}`).catch(() => ({ events: [] }));
        let events = data.events ?? [];

        if (selectedFilter === 'animals') {
            events = events.filter((e) => ANIMAL_CLASSES.has(e.className));
        } else if (selectedFilter === 'vehicles') {
            events = events.filter((e) => VEHICLE_CLASSES.has(e.className));
        }

        if (events.length === 0) {
            listHost.replaceChildren(empty('Nessun rilevamento recente corrispondente ai criteri selezionati.'));
            return;
        }

        const rows = events.map((ev) => {
            const label = CLASS_LABELS[ev.className] ?? ev.className;
            const confPct = `${Math.round((ev.confidence ?? 0) * 100)}%`;
            const dateStr = new Date(ev.startedAt).toLocaleString();

            let badgeKind = 'ok';
            if (ev.className === 'person') badgeKind = 'brand';
            else if (ev.className === 'plate') badgeKind = 'info';
            else if (ANIMAL_CLASSES.has(ev.className)) badgeKind = 'warn';

            const plateBadge = ev.plateText
                ? el('span', {
                    className: 'plate-badge',
                    textContent: `🏷️ ${ev.plateText}`
                })
                : null;

            const colorBadge = ev.upperColor
                ? chip(COLOR_LABELS[ev.upperColor] ?? `Abito ${ev.upperColor}`, ev.upperColor === 'white' ? 'ok' : 'brand')
                : null;

            const seekBtn = el('button', {
                type: 'button',
                className: 'btn btn--sm btn--primary',
                onclick: () => {
                    const atMs = new Date(ev.startedAt).getTime();
                    go('archive', ev.cameraId, atMs);
                }
            }, [icon('play'), el('span', { textContent: 'Vedi nel Video' })]);

            const snapshotImg = ev.snapshotPath
                ? el('img', {
                    src: `/api/detections/${encodeURIComponent(ev.id)}/snapshot`,
                    className: 'detection-thumbnail',
                    alt: 'Snapshot evento'
                })
                : null;

            return el('div', { className: 'device-row' }, [
                snapshotImg,
                el('div', { className: 'stack grow' }, [
                    el('div', { className: 'row' }, [
                        chip(label, badgeKind),
                        plateBadge,
                        colorBadge,
                        el('strong', { textContent: `Telecamera: ${ev.cameraName ?? ev.cameraId}` }),
                        el('span', { className: 'section__hint mono', textContent: dateStr })
                    ]),
                    el('div', { className: 'row' }, [
                        el('span', { className: 'section__hint', textContent: `Confidenza: ${confPct}` }),
                        ev.trackId ? el('span', { className: 'chip', textContent: `Track #${ev.trackId.slice(0, 8)}` }) : null,
                        ev.box ? el('span', { className: 'section__hint mono', textContent: `Box: [${ev.box.map((b) => Number(b).toFixed(2)).join(', ')}]` }) : null
                    ])
                ]),
                seekBtn
            ]);
        });

        listHost.replaceChildren(...rows);
    }

    const filters = [
        { id: 'all', label: 'Tutti' },
        { id: 'person', label: 'Persone' },
        { id: 'vehicles', label: 'Veicoli' },
        { id: 'plate', label: 'Targhe' },
        { id: 'face', label: 'Volti' },
        { id: 'animals', label: 'Animali' }
    ];

    const filterButtons = filters.map((f) => {
        const btn = el('button', {
            className: `seg__btn ${selectedFilter === f.id ? 'seg__btn--on' : ''}`,
            type: 'button',
            textContent: f.label,
            onclick: () => {
                selectedFilter = f.id;
                filterButtons.forEach((b) => b.classList.remove('seg__btn--on'));
                btn.classList.add('seg__btn--on');
                loadEvents();
            }
        });
        return btn;
    });

    const plateInput = el('input', {
        type: 'text',
        className: 'input input--sm',
        placeholder: 'Filtra targa (es. AB123CD)',
        oninput: (e) => {
            plateFilter = e.target.value;
            loadEvents();
        }
    });

    const colorSelect = el('select', {
        className: 'select select--sm',
        onchange: (e) => {
            colorFilter = e.target.value;
            loadEvents();
        }
    }, [
        el('option', { value: '', textContent: 'Tutti i colori' }),
        el('option', { value: 'white', textContent: 'Maglia Bianca' }),
        el('option', { value: 'black', textContent: 'Abito Nero' }),
        el('option', { value: 'gray', textContent: 'Abito Grigio' }),
        el('option', { value: 'red', textContent: 'Abito Rosso' }),
        el('option', { value: 'blue', textContent: 'Abito Blu' }),
        el('option', { value: 'green', textContent: 'Abito Verde' }),
        el('option', { value: 'yellow', textContent: 'Abito Giallo' })
    ]);

    const refreshBtn = el('button', {
        className: 'btn btn--sm',
        type: 'button',
        onclick: () => {
            loadStats();
            loadEvents();
        }
    }, [icon('refresh'), el('span', { textContent: 'Aggiorna' })]);

    outlet.replaceChildren(
        el('div', { className: 'view__head' }, [
            el('h1', { className: 'view__title', textContent: 'Ricerca Forense & Statistiche Passaggi' }),
            el('div', { className: 'row row--tight' }, [plateInput, colorSelect, refreshBtn])
        ]),
        statsHost,
        el('div', { className: 'row schedule-presets' }, filterButtons),
        el('section', { className: 'panel' }, [
            el('div', { className: 'panel__body' }, [listHost])
        ])
    );

    await Promise.all([loadStats(), loadEvents()]);
    return outlet;
}
