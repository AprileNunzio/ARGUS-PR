import { el, chip, empty, field, notice, confirmPanel } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

export async function renderAccessView({ api, session }) {
    const outlet = el('div', { className: 'view' });
    const canManage = session.permissions.includes('camera.manage');
    const formHost = el('div', { hidden: 'hidden' });
    const rulesHost = el('div', { className: 'stack' });
    const confirmHost = el('div', {});
    const eventsHost = el('div', { className: 'stack' });

    function renderRuleForm() {
        const patternInput = el('input', { className: 'input input--mono', type: 'text', placeholder: 'AB123CD o AB*', required: 'required' });
        const labelInput = el('input', { className: 'input', type: 'text', placeholder: 'Dipendente / Fornitore / Sospetto', required: 'required' });
        const listTypeSelect = el('select', { className: 'input' }, [
            el('option', { value: 'whitelist', textContent: 'Lista Bianca (Consenti accesso)' }),
            el('option', { value: 'blacklist', textContent: 'Lista Nera (Blocca e allarma)' }),
            el('option', { value: 'monitored', textContent: 'Monitorato (Registra transito)' })
        ]);
        const feedback = el('div', { hidden: 'hidden' });

        const saveBtn = el('button', { className: 'btn btn--primary', type: 'submit', textContent: 'Salva Regola' });
        const cancelBtn = el('button', {
            className: 'btn',
            type: 'button',
            textContent: 'Annulla',
            onclick: () => formHost.setAttribute('hidden', 'hidden')
        });

        const form = el('form', { className: 'panel stack' }, [
            el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: 'Nuova Regola Targa' })]),
            el('div', { className: 'panel__body stack' }, [
                field('Pattern Targa (supporta * e ?)', patternInput),
                field('Descrizione / Etichetta', labelInput),
                field('Tipo Lista', listTypeSelect),
                feedback,
                el('div', { className: 'row row--end' }, [cancelBtn, saveBtn])
            ])
        ]);

        form.onsubmit = async (e) => {
            e.preventDefault();
            saveBtn.disabled = true;
            feedback.setAttribute('hidden', 'hidden');

            const outcome = await api.post('/api/access/rules', {
                platePattern: patternInput.value,
                label: labelInput.value,
                listType: listTypeSelect.value,
                isActive: true
            }).then(() => null).catch((err) => err);

            saveBtn.disabled = false;
            if (outcome instanceof Error) {
                feedback.replaceChildren(notice('error', outcome.message));
                feedback.removeAttribute('hidden');
                return;
            }

            formHost.setAttribute('hidden', 'hidden');
            await loadData();
        };

        return form;
    }

    async function loadData() {
        const [rulesData, eventsData] = await Promise.all([
            api.get('/api/access/rules').catch(() => ({ rules: [] })),
            api.get('/api/access/events').catch(() => ({ events: [] }))
        ]);

        const rules = rulesData.rules ?? [];
        const events = eventsData.events ?? [];

        if (rules.length === 0) {
            rulesHost.replaceChildren(empty('Nessuna regola di accesso definita per le targhe.'));
        } else {
            const ruleRows = rules.map((r) => {
                const badgeKind = r.listType === 'whitelist' ? 'ok' : r.listType === 'blacklist' ? 'warn' : 'info';
                const deleteBtn = canManage ? el('button', {
                    className: 'btn btn--sm btn--danger',
                    type: 'button',
                    textContent: 'Elimina',
                    onclick: () => {
                        confirmHost.replaceChildren(confirmPanel({
                            title: `Eliminare la regola per ${r.platePattern}?`,
                            message: 'La targa smette di essere autorizzata o negata da questa regola.',
                            confirmLabel: 'Elimina',
                            onCancel: () => confirmHost.replaceChildren(),
                            onConfirm: async () => {
                                await api.remove(`/api/access/rules/${r.id}`).catch(() => undefined);
                                confirmHost.replaceChildren();
                                await loadData();
                            }
                        }));
                        confirmHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }) : null;

                return el('div', { className: 'device-row' }, [
                    el('div', { className: 'stack' }, [
                        el('div', { className: 'row' }, [
                            el('span', { className: 'mono font-bold', textContent: r.platePattern }),
                            chip(r.listType.toUpperCase(), badgeKind),
                            el('span', { textContent: r.label })
                        ])
                    ]),
                    deleteBtn
                ]);
            });
            rulesHost.replaceChildren(...ruleRows);
        }

        if (events.length === 0) {
            eventsHost.replaceChildren(empty('Nessun transito registrato di recente.'));
        } else {
            const eventRows = events.map((ev) => {
                const decKind = ev.decision === 'allow' ? 'ok' : ev.decision === 'deny' ? 'warn' : 'info';
                const dateStr = new Date(ev.createdAt).toLocaleString();

                return el('div', { className: 'device-row' }, [
                    el('div', { className: 'stack' }, [
                        el('div', { className: 'row' }, [
                            chip(ev.decision.toUpperCase(), decKind),
                            el('strong', { className: 'mono', textContent: ev.plate }),
                            el('span', { className: 'section__hint', textContent: `Telecamera: ${ev.cameraName ?? ev.cameraId}` }),
                            el('span', { className: 'section__hint mono', textContent: dateStr })
                        ])
                    ])
                ]);
            });
            eventsHost.replaceChildren(...eventRows);
        }
    }

    const addRuleBtn = canManage ? el('button', {
        className: 'btn btn--primary btn--sm',
        type: 'button',
        onclick: () => {
            formHost.replaceChildren(renderRuleForm());
            formHost.removeAttribute('hidden');
            formHost.scrollIntoView({ behavior: 'smooth' });
        }
    }, [icon('plus'), el('span', { textContent: 'Nuova Regola' })]) : null;

    outlet.replaceChildren(
        el('div', { className: 'view__head' }, [
            el('h1', { className: 'view__title', textContent: 'Targhe' }),
            el('div', { className: 'row row--tight' }, [addRuleBtn])
        ]),
        formHost,
        el('section', { className: 'panel stack' }, [
            el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: 'Regole' })]),
            el('div', { className: 'panel__body' }, [confirmHost, rulesHost])
        ]),
        el('section', { className: 'panel stack' }, [
            el('div', { className: 'panel__head' }, [el('span', { className: 'panel__title', textContent: 'Transiti' })]),
            el('div', { className: 'panel__body' }, [eventsHost])
        ])
    );

    await loadData();
    return outlet;
}
