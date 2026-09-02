import { el, chip, field, empty, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { renderScheduleEditor } from '/features/scheduling/schedule_editor.js';
import { renderZoneEditor } from '/features/motion/zone_editor.js';


function canManage(session) {
    return session.permissions.includes('camera.manage');
}

function cameraForm({ api, onSaved, onCancel }) {
    const name = el('input', { className: 'input', type: 'text', required: 'required' });
    const url = el('input', { className: 'input input--mono', type: 'text', placeholder: 'rtsp://192.168.1.64:554/Streaming/Channels/101' });
    const subUrl = el('input', { className: 'input input--mono', type: 'text', placeholder: 'facoltativo' });
    const username = el('input', { className: 'input', type: 'text', autocomplete: 'off' });
    const password = el('input', { className: 'input', type: 'password', autocomplete: 'new-password' });

    const transport = el('select', { className: 'select' }, [
        el('option', { value: 'tcp', textContent: 'TCP (consigliato)' }),
        el('option', { value: 'udp', textContent: 'UDP' })
    ]);

    const feedback = el('div', { hidden: 'hidden' });
    const submit = el('button', { className: 'btn btn--primary', type: 'submit', textContent: 'Salva canale' });

    const form = el('form', {
        className: 'form-grid',
        onsubmit: async (event) => {
            event.preventDefault();
            feedback.setAttribute('hidden', 'hidden');
            submit.disabled = true;

            const outcome = await api.post('/api/cameras', {
                name: name.value,
                mainStreamUrl: url.value,
                subStreamUrl: subUrl.value || undefined,
                username: username.value || undefined,
                password: password.value || undefined,
                transport: transport.value,
                sourceKind: 'rtsp'
            }).then(() => null).catch((error) => error);

            submit.disabled = false;

            if (outcome) {
                feedback.replaceChildren(notice('error', outcome.message));
                feedback.removeAttribute('hidden');
                return;
            }

            await onSaved();
        }
    }, [
        field('Nome', name),
        field('Trasporto', transport),
        el('div', { className: 'span-all' }, [field('URL flusso principale', url)]),
        el('div', { className: 'span-all' }, [field('URL flusso secondario', subUrl)]),
        field('Utente', username),
        field('Password', password),
        el('div', { className: 'span-all' }, [feedback]),
        el('div', { className: 'span-all row row--end' }, [
            el('button', { className: 'btn', type: 'button', textContent: 'Annulla', onclick: onCancel }),
            submit
        ])
    ]);

    return form;
}

function recordingToggle({ camera, api, recording }) {
    const entry = recording.find((item) => item.cameraId === camera.id);
    const active = entry ? entry.enabled : false;

    const dot = el('span', { className: active ? 'rec-dot rec-dot--on' : 'rec-dot' });
    const button = el('button', {
        className: 'btn btn--sm rec-toggle',
        type: 'button',
        title: active ? 'Interrompi registrazione' : 'Avvia registrazione',
        onclick: async () => {
            button.disabled = true;
            await api.post(`/api/recording/${camera.id}`, { enabled: !active }).catch(() => undefined);
            button.disabled = false;
            window.dispatchEvent(new CustomEvent('argus:refresh-cameras'));
        }
    }, [dot, el('span', { textContent: active ? 'REC' : 'Off' })]);

    return button;
}

function cameraRow({ camera, api, session, recording, onChanged, onOpenSchedule, onOpenZones }) {
    const status = el('td', {}, [camera.enabled ? chip('attivo', 'ok') : chip('disattivo', 'warn')]);


    const probeButton = el('button', {
        className: 'btn btn--sm',
        type: 'button',
        textContent: 'Verifica',
        onclick: async () => {
            probeButton.disabled = true;
            probeButton.textContent = 'Verifica…';

            const outcome = await api.post(`/api/cameras/${camera.id}/probe`)
                .then((result) => result)
                .catch((error) => error);

            probeButton.disabled = false;
            probeButton.textContent = 'Verifica';

            status.replaceChildren(outcome instanceof Error
                ? chip('irraggiungibile', 'bad')
                : chip(`${outcome.video?.width ?? '?'}x${outcome.video?.height ?? '?'} ${outcome.video?.codec ?? ''}`, 'ok'));
        }
    });

    const actions = el('td', { className: 'right' }, [
        el('div', { className: 'inline' }, [
            probeButton,
            canManage(session) ? el('button', {
                className: 'btn btn--sm',
                type: 'button',
                textContent: 'Orari',
                onclick: () => onOpenSchedule(camera)
            }) : null,
            canManage(session) ? el('button', {
                className: 'btn btn--sm',
                type: 'button',
                textContent: 'Zone',
                onclick: () => onOpenZones(camera)
            }) : null,
            canManage(session) ? recordingToggle({ camera, api, recording }) : null,
            canManage(session)
                ? el('button', {
                    className: 'btn btn--sm btn--danger',
                    type: 'button',
                    textContent: 'Elimina',
                    onclick: async () => {
                        if (!confirm(`Eliminare il canale "${camera.name}"?`)) return;
                        await api.remove(`/api/cameras/${camera.id}`);
                        await onChanged();
                    }
                })
                : null
        ])
    ]);

    return el('tr', {}, [
        el('td', {}, [el('strong', { textContent: camera.name })]),
        el('td', { className: 'mono', textContent: camera.mainStreamUrl ?? '--' }),
        el('td', { className: 'mono', textContent: camera.transport.toUpperCase() }),
        el('td', {}, [camera.hasPassword ? chip('con credenziali', 'info') : chip('anonimo')]),
        status,
        actions
    ]);
}


export async function renderCameras({ api, session }) {
    const outlet = el('div', { className: 'view' });

    const refresh = async () => {
        const { cameras } = await api.get('/api/cameras');
        const { recorders } = await api.get('/api/recording').catch(() => ({ recorders: [] }));

        const formHost = el('div', { hidden: 'hidden' });
        const addButton = canManage(session)
            ? el('button', {
                className: 'btn btn--primary',
                type: 'button',
                textContent: 'Aggiungi canale',
                onclick: () => {
                    formHost.replaceChildren(el('section', { className: 'panel' }, [
                        el('div', { className: 'panel__head' }, [
                            el('span', { className: 'panel__title', textContent: 'Nuovo canale RTSP' })
                        ]),
                        el('div', { className: 'panel__body' }, [
                            cameraForm({
                                api,
                                onSaved: refresh,
                                onCancel: () => formHost.setAttribute('hidden', 'hidden')
                            })
                        ])
                    ]));
                    formHost.removeAttribute('hidden');
                }
            })
            : null;

        const discoverButton = canManage(session)
            ? el('button', {
                className: 'btn',
                type: 'button',
                textContent: 'Cerca ONVIF',
                onclick: async () => {
                    discoverButton.disabled = true;
                    discoverButton.textContent = 'Ricerca…';
                    const result = await api.post('/api/discovery/onvif', { timeoutMs: 4000 })
                        .catch((error) => ({ devices: [], error: error.message }));
                    discoverButton.disabled = false;
                    discoverButton.textContent = 'Cerca ONVIF';

                    formHost.replaceChildren(el('section', { className: 'panel' }, [
                        el('div', { className: 'panel__head' }, [
                            el('span', { className: 'panel__title', textContent: `Dispositivi rilevati (${result.devices.length})` })
                        ]),
                        el('div', { className: 'panel__body' },
                            result.devices.length === 0
                                ? [empty('Nessun dispositivo ONVIF ha risposto sulla rete locale.')]
                                : result.devices.map((device) => el('div', { className: 'device-row' }, [
                                    el('div', {}, [
                                        el('strong', { textContent: device.name ?? device.host }),
                                        el('div', { className: 'section__hint', textContent: `${device.host}:${device.onvifPort} · ${device.hardware ?? 'sconosciuto'}` })
                                    ]),
                                    chip('onvif', 'info')
                                ]))
                        )
                    ]));
                    formHost.removeAttribute('hidden');
                }
            })
            : null;

        const onOpenSchedule = (camera) => {
            formHost.replaceChildren(renderScheduleEditor({
                camera,
                api,
                onSaved: () => { formHost.setAttribute('hidden', 'hidden'); refresh(); },
                onCancel: () => formHost.setAttribute('hidden', 'hidden')
            }));
            formHost.removeAttribute('hidden');
            formHost.scrollIntoView({ behavior: 'smooth' });
        };

        const onOpenZones = (camera) => {
            formHost.replaceChildren(renderZoneEditor({
                camera,
                api,
                onSaved: () => { formHost.setAttribute('hidden', 'hidden'); refresh(); },
                onCancel: () => formHost.setAttribute('hidden', 'hidden')
            }));
            formHost.removeAttribute('hidden');
            formHost.scrollIntoView({ behavior: 'smooth' });
        };

        const table = cameras.length === 0
            ? empty('Nessun canale configurato. Aggiungi una telecamera RTSP per iniziare.')
            : el('div', { className: 'tablewrap' }, [
                el('table', {}, [
                    el('thead', {}, [
                        el('tr', {}, [
                            el('th', { textContent: 'Nome' }),
                            el('th', { textContent: 'Flusso' }),
                            el('th', { textContent: 'Trasporto' }),
                            el('th', { textContent: 'Credenziali' }),
                            el('th', { textContent: 'Stato' }),
                            el('th', { textContent: 'Azioni' })
                        ])
                    ]),
                    el('tbody', {}, cameras.map((camera) => cameraRow({
                        camera,
                        api,
                        session,
                        recording: recorders,
                        onChanged: refresh,
                        onOpenSchedule,
                        onOpenZones
                    })))
                ])
            ]);


        outlet.replaceChildren(
            el('div', { className: 'view__head' }, [
                el('div', {}, [
                    el('h1', { className: 'view__title', textContent: 'Telecamere' }),
                    el('p', { className: 'view__sub', textContent: `${cameras.length} canali configurati` })
                ]),
                el('div', { className: 'row row--tight' }, [discoverButton, addButton])
            ]),
            formHost,
            el('section', { className: 'panel' }, [table])
        );
    };

    window.addEventListener('argus:refresh-cameras', refresh);

    await refresh();
    return outlet;
}
