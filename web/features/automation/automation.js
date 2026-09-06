import { el, chip, empty, notice, pageHead, confirmPanel } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { go } from '/assets/router.js';
import { renderChannelPage, channelRow } from './channel_form.js';
import { renderRulePage, TRIGGER_LABELS } from './rule_form.js';

function ruleRow({ rule, channels, onDelete }) {
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
            el('span', {
                className: 'section__hint',
                textContent: `${rule.className ?? 'qualsiasi classe'} · confidenza ${Math.round((rule.minConfidence ?? 0) * 100)}% · pausa ${rule.cooldownSeconds}s · verso ${targets || 'nessun canale'}`
            })
        ]),
        el('div', { className: 'row row--tight' }, [
            el('button', { className: 'btn btn--sm', type: 'button', textContent: 'Modifica', onclick: () => go('automation', 'rules', rule.id) }),
            el('button', { className: 'btn btn--sm btn--danger', type: 'button', textContent: 'Elimina', onclick: () => onDelete(rule) })
        ])
    ]);
}

function runRow(run, rules) {
    const name = rules.find((rule) => rule.id === run.ruleId)?.name ?? 'regola rimossa';

    return el('div', { className: 'device-row' }, [
        el('div', { className: 'stack stack--tight' }, [
            el('div', { className: 'row row--tight' }, [
                el('strong', { textContent: name }),
                chip(run.outcome, run.outcome === 'eseguita' ? 'ok' : 'warn')
            ]),
            el('span', {
                className: 'section__hint',
                textContent: `${new Date(run.at).toLocaleString('it-IT')} · ${run.trigger}${run.detail ? ` · ${run.detail}` : ''}`
            })
        ])
    ]);
}

async function renderList({ api }) {
    const outlet = el('div', { className: 'view' });
    const confirmHost = el('div', {});

    const [rulesData, channelsData, runsData, armData] = await Promise.all([
        api.get('/api/automation/rules'),
        api.get('/api/automation/channels'),
        api.get('/api/automation/runs?limit=30').catch(() => ({ runs: [] })),
        api.get('/api/automation/arm-state').catch(() => ({ state: 'disarmed' }))
    ]);

    let currentArm = armData.state ?? 'disarmed';
    const rules = rulesData.rules ?? [];
    const channels = channelsData.channels ?? [];

    const armBtns = [
        { id: 'disarmed', label: '🟢 Disarmato (In Casa)' },
        { id: 'armed_home', label: '🟡 Notte / Perimetrale' },
        { id: 'armed_away', label: '🔴 Armato Totale' }
    ].map((m) => {
        const btn = el('button', {
            type: 'button',
            className: `seg__btn ${currentArm === m.id ? 'seg__btn--on' : ''}`,
            textContent: m.label,
            onclick: async () => {
                await api.put('/api/automation/arm-state', { state: m.id }).catch(() => undefined);
                currentArm = m.id;
                armBtns.forEach((b) => b.classList.remove('seg__btn--on'));
                btn.classList.add('seg__btn--on');
            }
        });
        return btn;
    });

    const armWidget = el('section', { className: 'panel' }, [
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title', textContent: 'Stato Impianto di Sicurezza' })
        ]),
        el('div', { className: 'panel__body' }, [
            el('div', { className: 'row schedule-presets' }, armBtns)
        ])
    ]);

    const askDelete = (kind, entity) => {
        confirmHost.replaceChildren(confirmPanel({
            title: kind === 'rule' ? `Eliminare la regola "${entity.name}"?` : `Eliminare il canale "${entity.name}"?`,
            message: kind === 'rule'
                ? 'La regola smette di scattare. Lo storico delle esecuzioni resta consultabile.'
                : 'Le regole che lo usavano resteranno senza questa consegna.',
            confirmLabel: 'Elimina',
            onCancel: () => confirmHost.replaceChildren(),
            onConfirm: async () => {
                const path = kind === 'rule' ? 'rules' : 'channels';
                await api.remove(`/api/automation/${path}/${entity.id}`).catch(() => undefined);
                go('automation');
            }
        }));
        confirmHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    outlet.append(
        pageHead({
            title: 'Automazioni',
            hint: 'Cosa deve succedere quando il sistema riconosce qualcosa',
            actions: [
                el('button', { className: 'btn', type: 'button', onclick: () => go('automation', 'channels', 'new') }, [
                    icon('plus'),
                    el('span', { textContent: 'Nuovo canale' })
                ]),
                el('button', { className: 'btn btn--primary', type: 'button', onclick: () => go('automation', 'rules', 'new') }, [
                    icon('plus'),
                    el('span', { textContent: 'Nuova regola' })
                ])
            ]
        }),
        confirmHost,
        armWidget,
        el('section', { className: 'panel' }, [
            el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: `Regole (${rules.length})` })]),
            el('div', { className: 'panel__body stack stack--tight' },
                rules.length === 0
                    ? [empty('Nessuna regola. Una regola collega un riconoscimento a una o piu azioni.')]
                    : rules.map((rule) => ruleRow({ rule, channels, onDelete: (entity) => askDelete('rule', entity) })))
        ]),
        el('section', { className: 'panel' }, [
            el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: `Canali di consegna (${channels.length})` })]),
            el('div', { className: 'panel__body stack stack--tight' },
                channels.length === 0
                    ? [empty('Nessun canale. Email, Telegram, webhook, MQTT, comando HTTP o rele della telecamera.')]
                    : channels.map((channel) => channelRow({ api, channel, onDelete: (entity) => askDelete('channel', entity) })))
        ]),
        el('section', { className: 'panel' }, [
            el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: 'Ultime esecuzioni' })]),
            el('div', { className: 'panel__body stack stack--tight' },
                (runsData.runs ?? []).length === 0
                    ? [empty('Nessuna esecuzione registrata.')]
                    : runsData.runs.map((run) => runRow(run, rules)))
        ])
    );

    return outlet;
}

export async function renderAutomation({ api, params = [] }) {
    const [section, id] = params;

    if (section === 'rules') return renderRulePage({ api, ruleId: id === 'new' ? null : id });
    if (section === 'channels') return renderChannelPage({ api, channelId: id === 'new' ? null : id });

    return renderList({ api }).catch((error) => el('div', { className: 'view' }, [notice('error', error.message)]));
}
