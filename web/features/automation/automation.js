import { el, chip, empty, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { channelEditor, channelRow } from './channel_form.js';
import { ruleEditor, TRIGGER_LABELS } from './rule_form.js';

function ruleRow({ api, rule, channels, onChanged, onEdit }) {
    const targets = (rule.actions ?? [])
        .map((action) => channels.find((channel) => channel.id === action.channelId)?.name ?? 'canale rimosso')
        .join(', ');

    return el('div', { className: 'device-row' }, [
        el('div', { className: 'stack stack--tight' }, [
            el('div', { className: 'row row--tight' }, [
                el('strong', { textContent: rule.name }),
                chip(TRIGGER_LABELS[rule.triggerKind] ?? rule.triggerKind, 'info'),
                rule.enabled ? null : chip('disattiva', 'warn')
            ]),
            el('span', { className: 'section__hint', textContent: `${rule.className ?? 'qualsiasi classe'} · confidenza ${Math.round((rule.minConfidence ?? 0) * 100)}% · pausa ${rule.cooldownSeconds}s · verso ${targets || 'nessun canale'}` })
        ]),
        el('div', { className: 'row row--tight' }, [
            el('button', { className: 'btn btn--sm', type: 'button', textContent: 'Modifica', onclick: () => onEdit(rule) }),
            el('button', {
                className: 'btn btn--sm btn--danger',
                type: 'button',
                textContent: 'Elimina',
                onclick: async () => {
                    if (!confirm(`Eliminare la regola "${rule.name}"?`)) return;
                    await api.remove(`/api/automation/rules/${rule.id}`).catch(() => undefined);
                    await onChanged();
                }
            })
        ])
    ]);
}

function runRow(run, rules) {
    const name = rules.find((rule) => rule.id === run.ruleId)?.name ?? 'regola rimossa';
    const tone = run.outcome === 'eseguita' ? 'ok' : 'warn';

    return el('div', { className: 'device-row' }, [
        el('div', { className: 'stack stack--tight' }, [
            el('div', { className: 'row row--tight' }, [
                el('strong', { textContent: name }),
                chip(run.outcome, tone)
            ]),
            el('span', { className: 'section__hint', textContent: `${new Date(run.at).toLocaleString('it-IT')} · ${run.trigger}${run.detail ? ` · ${run.detail}` : ''}` })
        ])
    ]);
}

export async function renderAutomation({ api }) {
    const outlet = el('div', { className: 'view' });
    const panelHost = el('div', {});

    const refresh = async () => {
        const [catalog, rulesData, channelsData, runsData, camerasData] = await Promise.all([
            api.get('/api/automation/catalog'),
            api.get('/api/automation/rules'),
            api.get('/api/automation/channels'),
            api.get('/api/automation/runs?limit=30').catch(() => ({ runs: [] })),
            api.get('/api/cameras').catch(() => ({ cameras: [] }))
        ]);

        const rules = rulesData.rules ?? [];
        const channels = channelsData.channels ?? [];
        const close = () => panelHost.replaceChildren();

        const openChannel = (channel) => {
            panelHost.replaceChildren(channelEditor({
                api,
                catalog,
                channel,
                onSaved: async () => { close(); await refresh(); },
                onCancel: close
            }));
            panelHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        };

        const openRule = (rule) => {
            panelHost.replaceChildren(ruleEditor({
                api,
                catalog,
                cameras: camerasData.cameras ?? [],
                channels,
                rule,
                onSaved: async () => { close(); await refresh(); },
                onCancel: close
            }));
            panelHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        };

        outlet.replaceChildren(
            el('div', { className: 'view__head' }, [
                el('div', { className: 'stack stack--tight' }, [
                    el('h1', { className: 'view__title', textContent: 'Automazioni' }),
                    el('span', { className: 'section__hint', textContent: 'Cosa deve succedere quando il sistema riconosce qualcosa' })
                ]),
                el('div', { className: 'row row--tight' }, [
                    el('button', { className: 'btn', type: 'button', onclick: () => openChannel(null) }, [icon('plus'), el('span', { textContent: 'Nuovo canale' })]),
                    el('button', { className: 'btn btn--primary', type: 'button', onclick: () => openRule(null) }, [icon('plus'), el('span', { textContent: 'Nuova regola' })])
                ])
            ]),
            panelHost,
            el('section', { className: 'panel' }, [
                el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: `Regole (${rules.length})` })]),
                el('div', { className: 'panel__body stack stack--tight' },
                    rules.length === 0
                        ? [empty('Nessuna regola. Una regola collega un riconoscimento a una o piu azioni.')]
                        : rules.map((rule) => ruleRow({ api, rule, channels, onChanged: refresh, onEdit: openRule })))
            ]),
            el('section', { className: 'panel' }, [
                el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: `Canali di consegna (${channels.length})` })]),
                el('div', { className: 'panel__body stack stack--tight' },
                    channels.length === 0
                        ? [empty('Nessun canale. Email, Telegram, webhook, MQTT, comando HTTP o rele della telecamera.')]
                        : channels.map((channel) => channelRow({ api, channel, onChanged: refresh, onEdit: openChannel })))
            ]),
            el('section', { className: 'panel' }, [
                el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: 'Ultime esecuzioni' })]),
                el('div', { className: 'panel__body stack stack--tight' },
                    (runsData.runs ?? []).length === 0
                        ? [empty('Nessuna esecuzione registrata.')]
                        : runsData.runs.map((run) => runRow(run, rules)))
            ])
        );
    };

    await refresh().catch((error) => outlet.replaceChildren(notice('error', error.message)));
    return outlet;
}
