import { el, chip, empty, field, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

const CLASS_LABELS = {
    person: 'Persona',
    vehicle: 'Veicolo',
    car: 'Automobile',
    truck: 'Autocarro',
    bus: 'Autobus',
    motorcycle: 'Motocicletta',
    bicycle: 'Bicicletta',
    dog: 'Cane',
    cat: 'Gatto',
    bird: 'Uccello',
    animal: 'Animale',
    face: 'Volto',
    plate: 'Targa',
    motion: 'Movimento'
};

export async function renderDetectionsView({ api, session }) {
    const outlet = el('div', { className: 'view' });
    let selectedClass = 'all';
    const listHost = el('div', { className: 'stack' });

    async function loadEvents() {
        const query = selectedClass !== 'all' ? `?className=${encodeURIComponent(selectedClass)}` : '';
        const data = await api.get(`/api/detections${query}`).catch(() => ({ events: [] }));
        const events = data.events ?? [];

        if (events.length === 0) {
            listHost.replaceChildren(empty('Nessun rilevamento recente registrato dal motore di visione.'));
            return;
        }

        const rows = events.map((ev) => {
            const label = CLASS_LABELS[ev.className] ?? ev.className;
            const confPct = `${Math.round((ev.confidence ?? 0) * 100)}%`;
            const dateStr = new Date(ev.startedAt).toLocaleString();

            return el('div', { className: 'device-row' }, [
                el('div', { className: 'stack' }, [
                    el('div', { className: 'row' }, [
                        chip(label, ev.className === 'person' ? 'brand' : ev.className === 'plate' ? 'info' : 'ok'),
                        el('strong', { textContent: `Telecamera: ${ev.cameraId}` }),
                        el('span', { className: 'section__hint mono', textContent: dateStr })
                    ]),
                    el('div', { className: 'row' }, [
                        el('span', { className: 'section__hint', textContent: `Confidenza: ${confPct}` }),
                        ev.trackId ? el('span', { className: 'chip', textContent: `Track: ${ev.trackId.slice(0, 8)}` }) : null,
                        ev.box ? el('span', { className: 'section__hint mono', textContent: `Box: [${ev.box.map(b => b.toFixed(2)).join(', ')}]` }) : null
                    ])
                ])
            ]);
        });

        listHost.replaceChildren(...rows);
    }

    const filterButtons = ['all', 'person', 'car', 'truck', 'motorcycle', 'dog', 'cat', 'face', 'plate'].map((cls) => {
        const btn = el('button', {
            className: `seg__btn ${selectedClass === cls ? 'seg__btn--on' : ''}`,
            type: 'button',
            textContent: cls === 'all' ? 'Tutti' : (CLASS_LABELS[cls] ?? cls),
            onclick: () => {
                selectedClass = cls;
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
            el('div', {}, [
                el('h1', { className: 'view__title', textContent: 'Rilevamenti & Visione AI' }),
                el('p', { className: 'view__sub', textContent: 'Analisi oggetti, persone, veicoli, animali, volti e targhe' })
            ]),
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
