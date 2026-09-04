import { el, chip } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { segmented, toggle, optionRow } from '/assets/ui.js';
import { CLASS_LABELS, colourFor } from './wall_overlay.js';

const CLASS_GROUPS = [
    {
        id: 'people',
        label: 'Persone',
        icon: 'users',
        classes: ['person']
    },
    {
        id: 'vehicles',
        label: 'Veicoli',
        icon: 'camera',
        classes: ['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'train', 'boat', 'airplane']
    },
    {
        id: 'animals',
        label: 'Animali',
        icon: 'sparkles',
        classes: ['dog', 'cat', 'bird', 'horse', 'sheep', 'cow', 'bear', 'elephant', 'zebra', 'giraffe']
    },
    {
        id: 'baggage',
        label: 'Bagagli abbandonati',
        icon: 'archive',
        classes: ['backpack', 'handbag', 'suitcase']
    },
    {
        id: 'biometrics',
        label: 'Volti e targhe',
        icon: 'eye',
        classes: ['face', 'plate']
    }
];

const STYLE_OPTIONS = [
    { value: 'corner', label: 'Angoli', icon: 'crop', hint: 'Quattro spigoli sottili: la scelta piu leggibile su molte riquadri' },
    { value: 'solid', label: 'Riquadro pieno', icon: 'grid', hint: 'Rettangolo continuo attorno al soggetto' },
    { value: 'glow', label: 'Alone luminoso', icon: 'zap', hint: 'Rettangolo con bagliore, piu visibile da lontano' }
];

const RUNTIME_LABELS = {
    native: 'Nativo Node.js',
    python: 'Worker ONNX',
    edge: 'Sulla telecamera'
};

function costLabel(cost) {
    if (cost === 0) return 'Nessun costo CPU';
    if (cost <= 1) return 'Costo CPU minimo';
    if (cost <= 2) return 'Costo CPU contenuto';
    if (cost <= 3) return 'Costo CPU medio';
    return 'Costo CPU elevato';
}

function classChip(className, active, onToggle) {
    const button = el('button', {
        type: 'button',
        className: active ? 'ai-class ai-class--on' : 'ai-class',
        title: className,
        onclick: () => onToggle(className, !active)
    }, [
        el('span', { className: 'ai-class__swatch' }),
        el('span', { textContent: CLASS_LABELS[className] ?? className })
    ]);

    button.querySelector('.ai-class__swatch').style.setProperty('background', colourFor(className));
    return button;
}

export function classPicker(overlay, onToggle, onGroup) {
    return el('div', { className: 'stack stack--tight' }, CLASS_GROUPS.map((group) => {
        const active = group.classes.filter((entry) => overlay.classes.includes(entry));
        const allOn = active.length === group.classes.length;

        return el('div', { className: 'ai-group' }, [
            el('div', { className: 'ai-group__head' }, [
                icon(group.icon),
                el('strong', { textContent: group.label }),
                chip(`${active.length}/${group.classes.length}`, active.length > 0 ? 'ok' : 'info'),
                el('span', { className: 'spacer' }),
                el('button', {
                    type: 'button',
                    className: 'btn btn--sm btn--ghost',
                    textContent: allOn ? 'Deseleziona tutto' : 'Seleziona tutto',
                    onclick: () => onGroup(group.classes, !allOn)
                })
            ]),
            el('div', { className: 'ai-classes' }, group.classes.map((entry) => (
                classChip(entry, overlay.classes.includes(entry), onToggle)
            )))
        ]);
    }));
}

export function engineTable(engines) {
    if (!Array.isArray(engines) || engines.length === 0) {
        return el('span', { className: 'xrow__hint', textContent: 'Catalogo dei motori non disponibile.' });
    }

    return el('div', { className: 'ai-engines' }, engines.map((engine) => el('div', {
        className: engine.status === 'ready' ? 'ai-engine ai-engine--ready' : 'ai-engine'
    }, [
        el('div', { className: 'ai-engine__head' }, [
            el('strong', { className: 'ai-engine__name', textContent: engine.label }),
            chip(engine.status === 'ready' ? 'Disponibile' : 'In programma', engine.status === 'ready' ? 'ok' : 'warn')
        ]),
        engine.capabilityLabel ? el('span', { className: 'ai-engine__capability', textContent: engine.capabilityLabel }) : null,
        el('p', { className: 'ai-engine__hint', textContent: engine.hint }),
        el('div', { className: 'ai-engine__meta' }, [
            chip(RUNTIME_LABELS[engine.runtime] ?? engine.runtime, 'info'),
            chip(costLabel(engine.cost), engine.cost <= 2 ? 'ok' : 'warn'),
            chip(engine.license, 'info'),
            engine.models?.length > 0 ? chip(`${engine.models.length} modelli`, 'info') : null
        ].filter(Boolean))
    ])));
}

export function overlayControls(overlay, onChange) {
    const confidence = el('input', {
        type: 'range',
        className: 'slider-input',
        min: '5',
        max: '95',
        step: '5',
        value: String(Math.round(overlay.minConfidence * 100))
    });

    const confidenceBadge = el('span', {
        className: 'slider-val-badge',
        textContent: `${Math.round(overlay.minConfidence * 100)}%`
    });

    confidence.addEventListener('input', () => {
        const value = Number.parseInt(confidence.value, 10);
        confidenceBadge.textContent = `${value}%`;
        onChange({ minConfidence: value / 100 });
    });

    const hold = el('input', {
        type: 'range',
        className: 'slider-input',
        min: '200',
        max: '5000',
        step: '100',
        value: String(overlay.holdMs)
    });

    const holdBadge = el('span', { className: 'slider-val-badge', textContent: `${(overlay.holdMs / 1000).toFixed(1)} s` });

    hold.addEventListener('input', () => {
        const value = Number.parseInt(hold.value, 10);
        holdBadge.textContent = `${(value / 1000).toFixed(1)} s`;
        onChange({ holdMs: value });
    });

    return [
        optionRow({
            title: 'Stile del riquadro',
            hint: 'Come vengono disegnati i contorni attorno agli oggetti riconosciuti',
            iconName: 'crop',
            control: segmented(STYLE_OPTIONS, overlay.style, (value) => onChange({ style: value }), { compact: true })
        }),
        optionRow({
            title: 'Soglia minima di confidenza',
            hint: 'Sotto questa percentuale il riquadro non viene disegnato: alzala se compaiono falsi riconoscimenti',
            iconName: 'activity',
            control: el('div', { className: 'slider-wrap' }, [confidence, confidenceBadge])
        }),
        optionRow({
            title: 'Persistenza del riquadro',
            hint: 'Per quanto tempo il contorno resta visibile dopo l ultimo fotogramma in cui il soggetto e stato visto',
            iconName: 'clock',
            control: el('div', { className: 'slider-wrap' }, [hold, holdBadge])
        }),
        optionRow({
            title: 'Etichetta con il nome dell oggetto',
            hint: 'Mostra Persona, Auto, Gatto e simili accanto al riquadro',
            iconName: 'info',
            control: toggle(overlay.showLabel, (value) => onChange({ showLabel: value }), ['Visibile', 'Nascosta'])
        }),
        optionRow({
            title: 'Percentuale di confidenza',
            hint: 'Affianca all etichetta la certezza del riconoscimento',
            iconName: 'activity',
            control: toggle(overlay.showConfidence, (value) => onChange({ showConfidence: value }), ['Visibile', 'Nascosta'])
        }),
        optionRow({
            title: 'Identificativo di tracciamento',
            hint: 'Mostra il codice del track: utile in fase di taratura, superfluo in esercizio',
            iconName: 'crop',
            control: toggle(overlay.showTrackId, (value) => onChange({ showTrackId: value }), ['Visibile', 'Nascosto'])
        })
    ];
}
