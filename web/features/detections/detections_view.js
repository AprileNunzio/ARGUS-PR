import { el, chip, empty, field, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

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

export async function renderDetectionsView({ api, session }) {
    const outlet = el('div', { className: 'view' });
    let selectedFilter = 'all';
    const listHost = el('div', { className: 'stack' });

    async function loadEvents() {
        let query = '';
        if (selectedFilter !== 'all' && selectedFilter !== 'animals' && selectedFilter !== 'vehicles') {
            query = `?className=${encodeURIComponent(selectedFilter)}`;
        }
        
        const data = await api.get(`/api/detections${query}`).catch(() => ({ events: [] }));
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

            return el('div', { className: 'device-row' }, [
                el('div', { className: 'stack' }, [
                    el('div', { className: 'row' }, [
                        chip(label, badgeKind),
                        plateBadge,
                        el('strong', { textContent: `Telecamera: ${ev.cameraId}` }),
                        el('span', { className: 'section__hint mono', textContent: dateStr })
                    ]),
                    el('div', { className: 'row' }, [
                        el('span', { className: 'section__hint', textContent: `Confidenza: ${confPct}` }),
                        ev.trackId ? el('span', { className: 'chip', textContent: `Track #${ev.trackId.slice(0, 8)}` }) : null,
                        ev.box ? el('span', { className: 'section__hint mono', textContent: `Box: [${ev.box.map(b => Number(b).toFixed(2)).join(', ')}]` }) : null
                    ])
                ])
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

    const refreshBtn = el('button', {
        className: 'btn btn--sm',
        type: 'button',
        onclick: loadEvents
    }, [icon('refresh'), el('span', { textContent: 'Aggiorna' })]);

    outlet.replaceChildren(
        el('div', { className: 'view__head' }, [
            el('h1', { className: 'view__title', textContent: 'Rilevamenti' }),
            el('div', { className: 'row row--tight' }, [refreshBtn])
        ]),
        el('div', { className: 'row schedule-presets' }, filterButtons),
        el('section', { className: 'panel' }, [
            el('div', { className: 'panel__body' }, [listHost])
        ])
    );

    await loadEvents();
    return outlet;
}
