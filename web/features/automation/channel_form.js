import { el, field, chip, notice, pageHead } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { go } from '/assets/router.js';
import { backLink } from '/features/cameras/camera_wizard.js';

const FIELDS = Object.freeze({
    console: [],
    email: [
        { key: 'host', label: 'Server SMTP', placeholder: 'smtp.dominio.it' },
        { key: 'port', label: 'Porta', type: 'number', placeholder: '587' },
        { key: 'secure', label: 'TLS diretto (porta 465)', type: 'switch' },
        { key: 'from', label: 'Mittente', placeholder: 'argus@dominio.it' },
        { key: 'to', label: 'Destinatari (separati da virgola)', placeholder: 'io@dominio.it, guardia@dominio.it' },
        { key: 'username', label: 'Utente SMTP' }
    ],
    telegram: [
        { key: 'chatId', label: 'Identificativo chat', placeholder: '-1001234567890' },
        { key: 'silent', label: 'Notifica silenziosa', type: 'switch' }
    ],
    webhook: [
        { key: 'url', label: 'Indirizzo', placeholder: 'https://esempio.it/argus' }
    ],
    mqtt: [
        { key: 'host', label: 'Broker', placeholder: '192.168.1.10' },
        { key: 'port', label: 'Porta', type: 'number', placeholder: '1883' },
        { key: 'tls', label: 'TLS', type: 'switch' },
        { key: 'topic', label: 'Argomento', placeholder: 'argus/eventi' },
        { key: 'username', label: 'Utente' }
    ],
    gate: [
        { key: 'url', label: 'Indirizzo del comando', placeholder: 'http://192.168.1.50/relay/0?turn=on' },
        { key: 'method', label: 'Metodo', type: 'select', options: ['GET', 'POST', 'PUT'] },
        { key: 'username', label: 'Utente (facoltativo)' },
        { key: 'body', label: 'Corpo della richiesta (facoltativo)' }
    ],
    onvif_relay: [
        { key: 'host', label: 'Indirizzo telecamera', placeholder: '192.168.1.64' },
        { key: 'port', label: 'Porta ONVIF', type: 'number', placeholder: '80' },
        { key: 'token', label: 'Identificativo rele', placeholder: 'RelayOutputToken' },
        { key: 'mode', label: 'Modo', type: 'select', options: ['monostable', 'bistable'] },
        { key: 'holdMs', label: 'Durata impulso (ms)', type: 'number', placeholder: '1500' },
        { key: 'username', label: 'Utente telecamera' }
    ]
});

function control(definition, value) {
    if (definition.type === 'switch') {
        const input = el('input', { type: 'checkbox', className: 'switch__input', checked: value === true });
        const label = el('span', { className: 'switch__label', textContent: value === true ? 'Attivo' : 'Disattivo' });
        input.addEventListener('change', () => { label.textContent = input.checked ? 'Attivo' : 'Disattivo'; });
        return {
            node: el('label', { className: 'switch' }, [input, el('span', { className: 'switch__track' }, [el('span', { className: 'switch__thumb' })]), label]),
            read: () => input.checked
        };
    }

    if (definition.type === 'select') {
        const select = el('select', { className: 'select' }, definition.options.map((option) => el('option', { value: option, textContent: option })));
        if (value) select.value = value;
        return { node: select, read: () => select.value };
    }

    const input = el('input', {
        className: 'input',
        type: definition.type === 'number' ? 'number' : 'text',
        value: value === null || value === undefined ? '' : String(value),
        placeholder: definition.placeholder ?? ''
    });

    return {
        node: input,
        read: () => {
            const raw = input.value.trim();
            if (raw.length === 0) return null;
            return definition.type === 'number' ? Number.parseInt(raw, 10) : raw;
        }
    };
}

function channelEditor({ api, catalog, channel }) {
    const kinds = catalog.channels;
    const kindSelect = el('select', { className: 'select' }, kinds.map((entry) => el('option', { value: entry.kind, textContent: entry.label })));
    if (channel) kindSelect.value = channel.kind;

    const name = el('input', { className: 'input', type: 'text', value: channel?.name ?? '', placeholder: 'Guardiania' });
    const secret = el('input', { className: 'input', type: 'password', autocomplete: 'new-password', placeholder: channel?.hasSecret ? 'invariato' : '' });
    const fieldHost = el('div', { className: 'form-grid' });
    const feedback = el('div', { hidden: 'hidden' });

    let controls = new Map();

    const paint = () => {
        const kind = kindSelect.value;
        const descriptor = kinds.find((entry) => entry.kind === kind);
        controls = new Map();

        const nodes = (FIELDS[kind] ?? []).map((definition) => {
            const built = control(definition, channel?.kind === kind ? channel.config?.[definition.key] : undefined);
            controls.set(definition.key, built);
            return field(definition.label, built.node);
        });

        if (descriptor?.secretLabel) nodes.push(field(descriptor.secretLabel, secret));
        fieldHost.replaceChildren(...nodes);
    };

    kindSelect.addEventListener('change', paint);
    paint();

    const saveButton = el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Salva canale' });

    saveButton.addEventListener('click', async () => {
        saveButton.disabled = true;
        feedback.setAttribute('hidden', 'hidden');

        const config = {};
        for (const [key, built] of controls.entries()) {
            const value = built.read();
            if (value !== null) config[key] = value;
        }

        const payload = {
            kind: kindSelect.value,
            name: name.value.trim(),
            enabled: true,
            config
        };

        if (secret.value.length > 0) payload.secret = secret.value;

        const outcome = await (channel
            ? api.put(`/api/automation/channels/${channel.id}`, payload)
            : api.post('/api/automation/channels', payload))
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
            title: channel ? `Canale · ${channel.name}` : 'Nuovo canale di consegna',
            hint: 'Dove far arrivare gli avvisi, e quali comandi impartire',
            back: backLink('Torna alle automazioni', 'automation')
        }),
        el('section', { className: 'panel' }, [
            el('div', { className: 'panel__body stack' }, [
                el('div', { className: 'form-grid' }, [
                    field('Nome', name),
                    field('Tipo', kindSelect)
                ]),
                fieldHost,
                feedback,
                el('div', { className: 'row row--end' }, [
                    el('button', { className: 'btn', type: 'button', textContent: 'Annulla', onclick: () => go('automation') }),
                    saveButton
                ])
            ])
        ])
    ]);
}

export async function renderChannelPage({ api, channelId }) {
    const catalog = await api.get('/api/automation/catalog');
    const channel = channelId
        ? await api.get('/api/automation/channels').then((data) => (data.channels ?? []).find((entry) => entry.id === channelId) ?? null)
        : null;

    return channelEditor({ api, catalog, channel });
}

export function channelRow({ api, channel, onDelete }) {
    const testButton = el('button', { className: 'btn btn--sm', type: 'button', textContent: 'Prova' });
    const state = el('span', { className: 'section__hint', textContent: channel.hasSecret ? 'segreto memorizzato e cifrato' : 'nessun segreto' });

    testButton.addEventListener('click', async () => {
        testButton.disabled = true;
        state.textContent = 'invio in corso…';
        const outcome = await api.post(`/api/automation/channels/${channel.id}/test`)
            .then(() => 'consegna riuscita')
            .catch((error) => `consegna fallita: ${error.message}`);
        testButton.disabled = false;
        state.textContent = outcome;
    });

    return el('div', { className: 'device-row' }, [
        el('div', { className: 'stack stack--tight' }, [
            el('div', { className: 'row row--tight' }, [
                el('strong', { textContent: channel.name }),
                chip(channel.kind, 'info'),
                channel.enabled ? null : chip('disattivo', 'warn')
            ]),
            state
        ]),
        el('div', { className: 'row row--tight' }, [
            testButton,
            el('button', { className: 'btn btn--sm', type: 'button', textContent: 'Modifica', onclick: () => go('automation', 'channels', channel.id) }),
            el('button', { className: 'btn btn--sm btn--danger', type: 'button', textContent: 'Elimina', onclick: () => onDelete(channel) })
        ])
    ]);
}

export { FIELDS };
