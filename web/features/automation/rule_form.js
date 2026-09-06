import { el, field, notice, pageHead } from '/assets/dom.js';
import { go } from '/assets/router.js';
import { backLink } from '/features/cameras/camera_wizard.js';

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

const COLOR_OPTIONS = Object.freeze([
    ['', 'Qualsiasi colore'],
    ['white', 'Bianco (es. maglia bianca)'],
    ['black', 'Nero'],
    ['gray', 'Grigio'],
    ['red', 'Rosso'],
    ['blue', 'Blu / Azzurro'],
    ['green', 'Verde'],
    ['yellow', 'Giallo'],
    ['orange', 'Arancione'],
    ['purple', 'Viola']
]);

function ruleEditor({ api, catalog, cameras, channels, people, rule }) {
    const name = el('input', { className: 'input', type: 'text', value: rule?.name ?? '', placeholder: 'Persona di notte sul retro' });
    const trigger = selectFrom(catalog.triggers.map((kind) => [kind, TRIGGER_LABELS[kind] ?? kind]), rule?.triggerKind);
    const camera = selectFrom([['', 'Tutte le telecamere'], ...cameras.map((entry) => [entry.id, entry.name])], rule?.cameraId ?? '');
    const className = selectFrom(CLASS_OPTIONS, rule?.className ?? '');
    const plateScope = selectFrom(catalog.plateScopes.map((scope) => [scope, PLATE_LABELS[scope] ?? scope]), rule?.plateScope);
    const personScope = selectFrom(catalog.personScopes.map((scope) => [scope, PERSON_LABELS[scope] ?? scope]), rule?.personScope);

    const targetPlate = el('input', { className: 'input', type: 'text', value: rule?.targetPlate ?? '', placeholder: 'Targa esatta (es. AB123CD)' });
    const targetPerson = selectFrom([['', 'Qualsiasi persona registrata'], ...(people ?? []).map((p) => [p.id, p.name])], rule?.targetPersonId ?? '');
    const upperColor = selectFrom(COLOR_OPTIONS, rule?.upperColor ?? '');
    const minOccurrences = el('input', { className: 'input', type: 'number', min: '1', max: '1000', value: String(rule?.minOccurrences ?? 1) });
    const occurrenceWindow = el('input', { className: 'input', type: 'number', min: '1', max: '10080', value: String(rule?.occurrenceWindowMinutes ?? 60) });

    const minDwell = el('input', { className: 'input', type: 'number', min: '0', max: '86400', value: String(rule?.minDwellSeconds ?? 0), placeholder: '0 = immediato' });
    const solarMode = selectFrom([
        ['none', 'Nessun vincolo solare'],
        ['night_solar', 'Dal tramonto all alba (crepuscolare solare)'],
        ['day_solar', 'Dall alba al tramonto (solo ore di luce)']
    ], rule?.solarMode ?? 'none');

    const armDisarmed = el('input', { type: 'checkbox', checked: rule?.armStates ? rule.armStates.includes('disarmed') : true });
    const armHome = el('input', { type: 'checkbox', checked: rule?.armStates ? rule.armStates.includes('armed_home') : true });
    const armAway = el('input', { type: 'checkbox', checked: rule?.armStates ? rule.armStates.includes('armed_away') : true });

    const armHost = el('div', { className: 'row row--tight' }, [
        el('label', { className: 'row row--tight' }, [armDisarmed, el('span', { textContent: 'Disarmato' })]),
        el('label', { className: 'row row--tight' }, [armHome, el('span', { textContent: 'Notte / In casa' })]),
        el('label', { className: 'row row--tight' }, [armAway, el('span', { textContent: 'Armato totale' })])
    ]);

    const messageTemplate = el('textarea', {
        className: 'input',
        rows: '2',
        value: rule?.messageTemplate ?? '',
        placeholder: 'Es. Allarme su {camera}: {class} {plate} staziona da {dwell_formatted}!'
    });

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

        const armStates = [];
        if (armDisarmed.checked) armStates.push('disarmed');
        if (armHome.checked) armStates.push('armed_home');
        if (armAway.checked) armStates.push('armed_away');

        const payload = {
            name: name.value.trim(),
            enabled: true,
            triggerKind: trigger.value,
            cameraId: camera.value || null,
            className: className.value || null,
            minConfidence: Number.parseInt(confidence.value, 10) / 100,
            plateScope: plateScope.value,
            personScope: personScope.value,
            targetPlate: targetPlate.value.trim() || null,
            targetPersonId: targetPerson.value || null,
            upperColor: upperColor.value || null,
            minOccurrences: Number.parseInt(minOccurrences.value, 10) || 1,
            occurrenceWindowMinutes: Number.parseInt(occurrenceWindow.value, 10) || 60,
            minDwellSeconds: Number.parseInt(minDwell.value, 10) || 0,
            solarMode: solarMode.value,
            armStates,
            messageTemplate: messageTemplate.value.trim() || null,
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

        go('automation');
    });

    return el('div', { className: 'view' }, [
        pageHead({
            title: rule ? `Regola · ${rule.name}` : 'Nuova regola',
            hint: 'Quando succede qualcosa, che cosa deve fare il sistema',
            back: backLink('Torna alle automazioni', 'automation')
        }),
        el('section', { className: 'panel' }, [
        el('div', { className: 'panel__body stack' }, [
            el('div', { className: 'form-grid' }, [
                field('Nome', name),
                field('Quando succede', trigger),
                field('Telecamera', camera),
                field('Classe', className),
                field('Targa specifica (opzionale)', targetPlate),
                field('Esito targa', plateScope),
                field('Persona specifica (opzionale)', targetPerson),
                field('Ambito persone', personScope),
                field('Colore abito superiore (opzionale)', upperColor),
                field('Soglia passaggi minimi (occorrenze)', minOccurrences),
                field('Finestra temporale passaggi (minuti)', occurrenceWindow),
                field('Stazionamento minimo (secondi loitering)', minDwell),
                field('Fascia solare (alba/tramonto)', solarMode),
                field('Attiva negli stati impianto', armHost),
                field('Messaggio personalizzato (variabili: {camera}, {plate}, {person}, {class}, {upper_color}, {dwell_formatted})', messageTemplate),
                field('Confidenza minima', el('div', { className: 'slider-wrap' }, [confidence, confidenceBadge])),
                field('Fascia oraria settimanale', schedule),
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
            el('div', { className: 'row row--end' }, [
                el('button', { className: 'btn', type: 'button', textContent: 'Annulla', onclick: () => go('automation') }),
                saveButton
            ])
        ])
        ])
    ]);
}

export async function renderRulePage({ api, ruleId }) {
    const [catalog, rulesData, channelsData, camerasData, peopleData] = await Promise.all([
        api.get('/api/automation/catalog'),
        api.get('/api/automation/rules'),
        api.get('/api/automation/channels'),
        api.get('/api/cameras').catch(() => ({ cameras: [] })),
        api.get('/api/people').catch(() => ({ people: [] }))
    ]);

    const rule = ruleId ? (rulesData.rules ?? []).find((entry) => entry.id === ruleId) ?? null : null;

    return ruleEditor({
        api,
        catalog,
        cameras: camerasData.cameras ?? [],
        channels: channelsData.channels ?? [],
        people: peopleData.people ?? [],
        rule
    });
}

export { NIGHT_MASK, TRIGGER_LABELS };
