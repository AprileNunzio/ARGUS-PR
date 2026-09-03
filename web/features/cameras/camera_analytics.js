import { el, chip, notice, empty } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

const COST_LABELS = Object.freeze(['nullo', 'trascurabile', 'basso', 'medio', 'alto', 'molto alto']);

function engineOption(engine) {
    const label = engine.status === 'ready'
        ? `${engine.label} · costo ${COST_LABELS[engine.cost] ?? engine.cost}`
        : `${engine.label} · da costruire`;

    const option = el('option', { value: engine.id, textContent: label });
    if (engine.status !== 'ready') option.setAttribute('disabled', 'disabled');
    return option;
}

function capabilityCard({ capability, entry, onChange }) {
    const engines = capability.engines ?? [];
    const ready = engines.filter((engine) => engine.status === 'ready');

    const toggle = el('input', { type: 'checkbox', className: 'switch__input', checked: entry.enabled });
    const toggleLabel = el('span', { className: 'switch__label', textContent: entry.enabled ? 'Attivo' : 'Disattivo' });

    const engineSelect = el('select', { className: 'select' }, engines.map(engineOption));
    engineSelect.value = entry.engineId;

    const threshold = el('input', {
        type: 'range',
        className: 'slider-input',
        min: '5',
        max: '95',
        step: '1',
        value: String(Math.round(entry.threshold * 100))
    });

    const thresholdBadge = el('span', { className: 'slider-val-badge', textContent: `${Math.round(entry.threshold * 100)}%` });

    const description = engines.find((engine) => engine.id === entry.engineId)?.hint ?? '';
    const engineHint = el('span', { className: 'section__hint', textContent: description });

    const emit = () => {
        onChange({
            capability: capability.id,
            enabled: toggle.checked,
            engineId: engineSelect.value,
            threshold: Number.parseInt(threshold.value, 10) / 100,
            minSize: entry.minSize ?? 0
        });
    };

    toggle.addEventListener('change', () => {
        toggleLabel.textContent = toggle.checked ? 'Attivo' : 'Disattivo';
        emit();
    });

    engineSelect.addEventListener('change', () => {
        engineHint.textContent = engines.find((engine) => engine.id === engineSelect.value)?.hint ?? '';
        emit();
    });

    threshold.addEventListener('input', () => {
        thresholdBadge.textContent = `${threshold.value}%`;
    });
    threshold.addEventListener('change', emit);

    return el('article', { className: 'cap-card' }, [
        el('div', { className: 'row row--between' }, [
            el('div', { className: 'stack stack--tight' }, [
                el('div', { className: 'row row--tight' }, [
                    el('strong', { textContent: capability.label }),
                    capability.sensitive ? chip('dato biometrico', 'warn') : null,
                    entry.blockedBy ? chip(`richiede ${entry.blockedBy}`, 'bad') : null
                ]),
                el('span', { className: 'section__hint', textContent: capability.hint })
            ]),
            el('label', { className: 'switch' }, [
                toggle,
                el('span', { className: 'switch__track' }, [el('span', { className: 'switch__thumb' })]),
                toggleLabel
            ])
        ]),
        el('div', { className: 'form-grid' }, [
            el('div', { className: 'field' }, [
                el('label', { textContent: 'Algoritmo' }),
                engineSelect
            ]),
            el('div', { className: 'field' }, [
                el('label', { textContent: 'Confidenza minima' }),
                el('div', { className: 'slider-wrap' }, [threshold, thresholdBadge])
            ])
        ]),
        engineHint,
        ready.length === 0 ? notice('warn', 'Nessun motore pronto per questa capacita.') : null
    ]);
}

export function renderCameraAnalytics({ api, camera, session }) {
    const outlet = el('div', { className: 'stack' });
    const canInstall = session?.permissions?.includes('system.manage') === true;

    const refresh = async () => {
        const [catalog, profile] = await Promise.all([
            api.get('/api/vision/engines'),
            api.get(`/api/cameras/${camera.id}/analytics`)
        ]);

        const draft = new Map(profile.capabilities.map((entry) => [entry.capability, { ...entry }]));

        const feedback = el('div', { hidden: 'hidden' });
        const saveButton = el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Applica profilo' });

        saveButton.addEventListener('click', async () => {
            saveButton.disabled = true;
            feedback.setAttribute('hidden', 'hidden');

            const outcome = await api.put(`/api/cameras/${camera.id}/analytics`, {
                capabilities: [...draft.values()].map((entry) => ({
                    capability: entry.capability,
                    enabled: entry.enabled,
                    engineId: entry.engineId,
                    threshold: entry.threshold,
                    minSize: entry.minSize ?? 0
                }))
            }).then((value) => ({ value })).catch((error) => ({ error }));

            saveButton.disabled = false;

            if (outcome.error) {
                feedback.replaceChildren(notice('error', outcome.error.message));
                feedback.removeAttribute('hidden');
                return;
            }

            const missing = outcome.value.missingModels ?? [];
            feedback.replaceChildren(missing.length === 0
                ? notice('ok', 'Profilo applicato. L analisi riparte con i motori scelti.')
                : notice('warn', `Profilo salvato, ma mancano i modelli: ${missing.join(', ')}.`));
            feedback.removeAttribute('hidden');

            await refresh();
        });

        const cards = catalog.capabilities.map((capability) => capabilityCard({
            capability,
            entry: draft.get(capability.id) ?? { enabled: false, engineId: capability.defaultEngine, threshold: capability.defaultThreshold },
            onChange: (value) => draft.set(value.capability, { ...draft.get(value.capability), ...value })
        }));

        const missing = profile.missingModels ?? [];
        const installButton = canInstall && missing.length > 0
            ? el('button', { className: 'btn', type: 'button' }, [icon('download'), el('span', { textContent: 'Scarica i modelli mancanti' })])
            : null;

        if (installButton) {
            installButton.addEventListener('click', async () => {
                installButton.disabled = true;
                installButton.textContent = 'Scaricamento in corso…';
                const outcome = await api.post('/api/vision/models/install', { models: missing })
                    .then((value) => ({ value }))
                    .catch((error) => ({ error }));
                installButton.disabled = false;

                if (outcome.error) {
                    feedback.replaceChildren(notice('error', outcome.error.message));
                    feedback.removeAttribute('hidden');
                    return;
                }
                await refresh();
            });
        }

        outlet.replaceChildren(
            missing.length > 0
                ? el('div', { className: 'stack stack--tight' }, [
                    notice('warn', `Per il profilo attuale mancano dei modelli: ${missing.join(', ')}. Finche mancano, l analisi resta ferma su questo canale.`),
                    installButton
                ])
                : null,
            cards.length === 0 ? empty('Nessuna capacita disponibile.') : el('div', { className: 'stack' }, cards),
            feedback,
            el('div', { className: 'row row--end' }, [saveButton])
        );
    };

    refresh().catch((error) => outlet.replaceChildren(notice('error', error.message)));

    return outlet;
}
