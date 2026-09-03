import { el, field, notice } from '/assets/dom.js';

const TRIGGER_LABELS = Object.freeze({
    detection: 'Rilevamento AI (persone, veicoli, animali, volti)',
    access: 'Targa riconosciuta',
    motion: 'Movimento'
});

const CLASS_OPTIONS = Object.freeze([
    ['', 'Qualsiasi'], ['person', 'Persona'], ['car', 'Auto'], ['truck', 'Camion'], ['bus', 'Autobus'],
    ['motorcycle', 'Moto'], ['bicycle', 'Bicicletta'], ['dog', 'Cane'], ['cat', 'Gatto'],
    ['face', 'Volto'], ['plate', 'Targa']
]);

const PLATE_LABELS = Object.freeze({ any: 'Qualsiasi esito', allowed: 'Solo autorizzate', denied: 'Solo negate', unknown: 'Solo sconosciute' });
const PERSON_LABELS = Object.freeze({ any: 'Chiunque', known: 'Solo persone iscritte', unknown: 'Solo volti sconosciuti' });

const NIGHT_MASK = (() => {
    let mask = '';
    for (let day = 0; day < 7; day += 1) {
        for (let slot = 0; slot < 48; slot += 1) {
            const hour = Math.floor(slot / 2);
            mask += (hour >= 20 || hour < 7) ? '1' : '0';
        }
    }
    return mask;
})();

function selectFrom(pairs, value) {
    const select = el('select', { className: 'select' }, pairs.map(([id, label]) => el('option', { value: id, textContent: label })));
    select.value = value ?? pairs[0][0];
    return select;
}

export function ruleEditor({ api, catalog, cameras, channels, rule, onSaved, onCancel }) {
    const name = el('input', { className: 'input', type: 'text', value: rule?.name ?? '', placeholder: 'Persona di notte sul retro' });
    const trigger = selectFrom(catalog.triggers.map((kind) => [kind, TRIGGER_LABELS[kind] ?? kind]), rule?.triggerKind);
    const camera = selectFrom([['', 'Tutte le telecamere'], ...cameras.map((entry) => [entry.id, entry.name])], rule?.cameraId ?? '');
    const className = selectFrom(CLASS_OPTIONS, rule?.className ?? '');
    const plateScope = selectFrom(catalog.plateScopes.map((scope) => [scope, PLATE_LABELS[scope] ?? scope]), rule?.plateScope);
    const personScope = selectFrom(catalog.personScopes.map((scope) => [scope, PERSON_LABELS[scope] ?? scope]), rule?.personScope);

    const confidence = el('input', {
        className: 'slider-input',
        type: 'range',
        min: '0',
        max: '95',
        step: '5',
        value: String(Math.round((rule?.minConfidence ?? 0.5) * 100))
    });
    const confidenceBadge = el('span', { className: 'slider-val-badge', textContent: `${Math.round((rule?.minConfidence ?? 0.5) * 100)}%` });
    confidence.addEventListener('input', () => { confidenceBadge.textContent = `${confidence.value}%`; });

    const cooldown = el('input', { className: 'input', type: 'number', min: '0', max: '86400', value: String(rule?.cooldownSeconds ?? 60) });
    const dailyLimit = el('input', { className: 'input', type: 'number', min: '1', max: '10000', value: rule?.dailyLimit ? String(rule.dailyLimit) : '', placeholder: 'nessuno' });

    const schedule = selectFrom([
        ['always', 'Sempre'],
        ['night', 'Solo di notte (20:00 - 07:00)']
    ], rule?.weekMask === NIGHT_MASK ? 'night' : 'always');

    const actionHost = el('div', { className: 'stack stack--tight' }, channels.map((channel) => {
        const input = el('input', {
            type: 'checkbox',
            checked: rule?.actions?.some((action) => action.channelId === channel.id) === true
        });
        input.dataset.channel = channel.id;
        return el('label', { className: 'row row--tight' }, [input, el('span', { textContent: `${channel.name} · ${channel.kind}` })]);
    }));

    const feedback = el('div', { hidden: 'hidden' });
    const saveButton = el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Salva regola' });

    saveButton.addEventListener('click', async () => {
        saveButton.disabled = true;
        feedback.setAttribute('hidden', 'hidden');

        const actions = [...actionHost.querySelectorAll('input[type=checkbox]')]
            .filter((input) => input.checked)
            .map((input) => ({ channelId: input.dataset.channel }));

        const payload = {
            name: name.value.trim(),
            enabled: true,
            triggerKind: trigger.value,
            cameraId: camera.value || null,
            className: className.value || null,
            minConfidence: Number.parseInt(confidence.value, 10) / 100,
            plateScope: plateScope.value,
            personScope: personScope.value,
            weekMask: schedule.value === 'night' ? NIGHT_MASK : null,
            cooldownSeconds: Number.parseInt(cooldown.value, 10) || 0,
            dailyLimit: dailyLimit.value ? Number.parseInt(dailyLimit.value, 10) : null,
            actions
        };

        const outcome = await (rule
            ? api.put(`/api/automation/rules/${rule.id}`, payload)
            : api.post('/api/automation/rules', payload))
            .then(() => null)
            .catch((error) => error);

        saveButton.disabled = false;

        if (outcome) {
            feedback.replaceChildren(notice('error', outcome.message));
            feedback.removeAttribute('hidden');
            return;
        }

        await onSaved();
    });

    return el('section', { className: 'panel rise' }, [
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title', textContent: rule ? `Regola · ${rule.name}` : 'Nuova regola' }),
            el('button', { className: 'btn btn--sm btn--ghost', type: 'button', textContent: 'Chiudi', onclick: onCancel })
        ]),
        el('div', { className: 'panel__body stack' }, [
            el('div', { className: 'form-grid' }, [
                field('Nome', name),
                field('Quando succede', trigger),
                field('Telecamera', camera),
                field('Classe', className),
                field('Esito targa', plateScope),
                field('Persone', personScope),
                field('Confidenza minima', el('div', { className: 'slider-wrap' }, [confidence, confidenceBadge])),
                field('Fascia oraria', schedule),
                field('Pausa fra due esecuzioni (secondi)', cooldown),
                field('Limite giornaliero', dailyLimit)
            ]),
            el('div', { className: 'stack stack--tight' }, [
                el('strong', { textContent: 'Cosa fare' }),
                channels.length === 0
                    ? notice('warn', 'Nessun canale configurato: creane uno prima di salvare la regola.')
                    : actionHost
            ]),
            feedback,
            el('div', { className: 'row row--end' }, [saveButton])
        ])
    ]);
}

export { NIGHT_MASK, TRIGGER_LABELS };
