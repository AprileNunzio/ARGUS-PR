import { el, chip, field, notice, formatBytes, confirmPanel } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

const STATE = {
    pending: ['in corso', 'warn'],
    ready: ['pronta', 'ok'],
    failed: ['fallita', 'bad']
};

function localInput(ms) {
    const date = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
    return date.toISOString().slice(0, 16);
}

function fromInput(value) {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
}

function downloadLink(id, part, label, iconName) {
    return el('a', {
        className: 'btn btn--sm',
        href: `/api/exports/${encodeURIComponent(id)}/download/${part}`
    }, [icon(iconName), el('span', { textContent: label })]);
}

function exportRow({ record, api, onChanged, feedback }) {
    const verifyButton = el('button', {
        className: 'btn btn--sm',
        type: 'button',
        onclick: async () => {
            verifyButton.disabled = true;
            const outcome = await api.get(`/api/exports/${encodeURIComponent(record.id)}/verify`).catch((error) => ({ valid: false, problems: [error.message] }));
            verifyButton.disabled = false;

            feedback.replaceChildren(outcome.valid
                ? notice('ok', `Esportazione integra: video, manifesto e sigillo corrispondono. Catena ${outcome.manifest.chainRoot.slice(0, 16)}…`)
                : notice('error', `Verifica fallita: ${outcome.problems.join(' · ')}`));
        }
    }, [icon('shield'), el('span', { textContent: 'Verifica' })]);

    const [label, variant] = STATE[record.state] ?? [record.state, 'info'];

    return el('tr', {}, [
        el('td', {}, [
            el('strong', { textContent: record.cameraName }),
            el('div', { className: 'section__hint', textContent: `${new Date(record.fromMs).toLocaleString()} → ${new Date(record.toMs).toLocaleTimeString()}` }),
            record.reason ? el('div', { className: 'section__hint', textContent: record.reason }) : null
        ]),
        el('td', {}, [
            chip(label, variant),
            record.state === 'ready' && !record.sourcesIntact ? chip('sorgenti alterate', 'bad') : null
        ]),
        el('td', { className: 'mono', textContent: record.state === 'ready' ? formatBytes(record.outputBytes) : '--' }),
        el('td', { className: 'mono truncate', textContent: record.outputSha256 ? `${record.outputSha256.slice(0, 12)}…` : (record.error ?? '--') }),
        el('td', { className: 'right' }, [
            el('div', { className: 'inline' }, record.state === 'ready'
                ? [
                    downloadLink(record.id, 'video', 'Video', 'download'),
                    downloadLink(record.id, 'manifest', 'Manifesto', 'archive'),
                    verifyButton,
                    el('button', {
                        className: 'btn btn--sm btn--danger',
                        type: 'button',
                        onclick: () => {
                            feedback.replaceChildren(confirmPanel({
                                title: 'Eliminare questa esportazione?',
                                message: 'Il video esportato e il suo manifesto di custodia vengono rimossi dal disco.',
                                confirmLabel: 'Elimina',
                                onCancel: () => feedback.replaceChildren(),
                                onConfirm: async () => {
                                    await api.remove(`/api/exports/${encodeURIComponent(record.id)}`).catch(() => undefined);
                                    feedback.replaceChildren();
                                    await onChanged();
                                }
                            }));
                            feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                    }, [icon('trash')])
                ]
                : [])
        ])
    ]);
}

export function renderExportPanel({ api, session, getContext }) {
    const host = el('section', { className: 'panel' });

    if (!session.permissions.includes('archive.export')) {
        return { element: host, refresh: async () => undefined, hidden: true };
    }

    const feedback = el('div', {});
    const body = el('tbody', {});

    const fromField = el('input', { className: 'input', type: 'datetime-local' });
    const toField = el('input', { className: 'input', type: 'datetime-local' });
    const reasonField = el('input', { className: 'input', type: 'text', placeholder: 'Motivo, es. richiesta autorita giudiziaria', maxlength: '300' });

    const refresh = async () => {
        const { exports } = await api.get('/api/exports').catch(() => ({ exports: [] }));

        body.replaceChildren(...exports.map((record) => exportRow({ record, api, onChanged: refresh, feedback })));

        if (exports.length === 0) {
            body.replaceChildren(el('tr', {}, [
                el('td', { colspan: '5' }, [el('span', { className: 'section__hint', textContent: 'Nessuna esportazione richiesta finora.' })])
            ]));
        }
    };

    const submit = el('button', {
        className: 'btn btn--primary',
        type: 'submit'
    }, [icon('download'), el('span', { textContent: 'Esporta' })]);

    const form = el('form', {
        className: 'form-grid',
        onsubmit: async (event) => {
            event.preventDefault();
            feedback.replaceChildren();

            const context = getContext();
            const fromMs = fromInput(fromField.value);
            const toMs = fromInput(toField.value);

            if (!context.cameraId) {
                feedback.replaceChildren(notice('error', 'Seleziona prima una telecamera.'));
                return;
            }

            if (fromMs === null || toMs === null || toMs <= fromMs) {
                feedback.replaceChildren(notice('error', 'Intervallo non valido: la fine deve essere successiva all\'inizio.'));
                return;
            }

            submit.disabled = true;
            feedback.replaceChildren(notice('info', 'Esportazione in corso: i segmenti vengono uniti senza ricodifica e ne viene calcolato l\'hash.'));

            const failure = await api.post('/api/exports', {
                cameraId: context.cameraId,
                fromMs,
                toMs,
                reason: reasonField.value || undefined
            }).then(() => null).catch((error) => error);

            submit.disabled = false;

            feedback.replaceChildren(failure
                ? notice('error', failure.message)
                : notice('ok', 'Esportazione completata: scaricala insieme al manifesto di custodia.'));

            await refresh();
        }
    }, [
        field('Dalle', fromField),
        field('Alle', toField),
        el('div', { className: 'span-all' }, [field('Motivo', reasonField)]),
        el('div', { className: 'span-all row row--end' }, [submit])
    ]);

    host.replaceChildren(
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title' }, [icon('shield'), 'Esportazione con catena di custodia']),
            chip('prove', 'violet')
        ]),
        el('div', { className: 'panel__body stack' }, [
            el('p', { className: 'section__hint', textContent: 'Il video viene unito senza ricodifica. Insieme al file trovi un manifesto firmato che elenca ogni segmento con il suo hash, chi ha esportato, quando e perche.' }),
            form,
            feedback
        ]),
        el('div', { className: 'tablewrap' }, [
            el('table', {}, [
                el('thead', {}, [
                    el('tr', {}, [
                        el('th', { textContent: 'Esportazione' }),
                        el('th', { textContent: 'Stato' }),
                        el('th', { textContent: 'Dimensione' }),
                        el('th', { textContent: 'SHA-256' }),
                        el('th', { textContent: 'Azioni' })
                    ])
                ]),
                body
            ])
        ])
    );

    return {
        element: host,
        refresh,
        setRange(startMs, endMs) {
            fromField.value = localInput(startMs);
            toField.value = localInput(endMs);
        }
    };
}
