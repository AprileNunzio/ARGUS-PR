import { el, chip, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

const PHASE = {
    idle: ['in attesa', 'info'],
    requested: ['richiesto', 'warn'],
    pending: ['in prova', 'warn'],
    healthy: ['aggiornato', 'ok'],
    'rolled-back': ['ripristinato', 'bad'],
    failed: ['fallito', 'bad']
};

function phaseChip(phase) {
    const [label, variant] = PHASE[phase] ?? [phase, 'info'];
    return chip(label, variant);
}

function spec(key, value) {
    return el('div', { className: 'spec' }, [
        el('span', { className: 'spec__k', textContent: key }),
        el('span', { className: 'spec__v truncate', textContent: value })
    ]);
}

function releaseNotes(text) {
    const lines = String(text ?? '')
        .split('\n')
        .map((line) => line.replace(/^#{1,6}\s*/, '').replace(/^[-*]\s*/, '').replace(/[*`_]/g, '').trim())
        .filter((line) => line.length > 0 && !line.startsWith('```'))
        .slice(0, 8);

    if (lines.length === 0) return null;

    return el('ul', { className: 'stack--tight' }, lines.map((line) => el('li', { className: 'section__hint', textContent: line })));
}

export function renderUpdatesPanel({ api }) {
    const host = el('section', { className: 'panel panel--accent rise rise-4' });
    host.style.setProperty('--panel-accent', 'var(--grad-violet)');
    host.style.setProperty('--panel-icon', 'var(--violet)');

    const paint = async () => {
        const status = await api.get('/api/updates/status').catch((error) => ({ failure: error }));

        if (status.failure) {
            host.replaceChildren(el('div', { className: 'panel__body' }, [
                notice('error', `Stato aggiornamenti non disponibile: ${status.failure.message}`)
            ]));
            return;
        }

        const latest = status.lastCheck?.latest ?? null;
        const available = status.lastCheck?.updateAvailable === true;

        const checkButton = el('button', {
            className: 'btn btn--sm',
            type: 'button',
            onclick: async () => {
                checkButton.disabled = true;
                await api.post('/api/updates/check').catch(() => undefined);
                await paint();
            }
        }, [icon('refresh'), el('span', { textContent: 'Cerca aggiornamenti' })]);

        const applyButton = available && latest && status.supported
            ? el('button', {
                className: 'btn btn--sm btn--primary',
                type: 'button',
                onclick: async () => {
                    if (!confirm(`Installare ${latest.tag}?\n\nIl servizio si riavvia da solo. Se la nuova versione non parte, il sistema ripristina automaticamente la ${status.currentVersion}.`)) return;

                    applyButton.disabled = true;
                    const failure = await api.post('/api/updates/apply', { ref: latest.tag }).then(() => null).catch((error) => error);

                    if (failure) {
                        applyButton.disabled = false;
                        host.append(el('div', { className: 'panel__body' }, [notice('error', failure.message)]));
                        return;
                    }

                    host.replaceChildren(
                        el('div', { className: 'panel__head' }, [
                            el('span', { className: 'panel__title' }, [icon('download'), 'Aggiornamento in corso']),
                            chip('riavvio', 'warn')
                        ]),
                        el('div', { className: 'panel__body' }, [
                            notice('info', 'Il servizio si sta riavviando sulla nuova versione. Ricarica la pagina tra un minuto: se qualcosa non funziona il ripristino e\' automatico.')
                        ])
                    );
                }
            }, [icon('download'), el('span', { textContent: `Installa ${latest.tag}` })])
            : null;

        const messages = [
            status.message
                ? notice(status.phase === 'rolled-back' || status.phase === 'failed' ? 'error' : 'success', status.message)
                : null,
            !status.supported
                ? notice('warn', 'Questa copia non e\' un clone git, quindi non puo\' aggiornarsi da sola. L\'installazione automatica Linux usa git e supporta l\'aggiornamento da questa pagina.')
                : null,
            status.lastCheck && !available
                ? notice('success', 'Il sistema e\' allineato all\'ultima versione pubblicata.')
                : null
        ].filter(Boolean);

        host.replaceChildren(
            el('div', { className: 'panel__head' }, [
                el('span', { className: 'panel__title' }, [icon('download'), 'Aggiornamenti']),
                phaseChip(status.phase)
            ]),
            el('div', { className: 'spec-grid' }, [
                spec('Versione installata', status.currentVersion),
                spec('Ultima release', latest ? latest.tag : 'da verificare'),
                spec('Origine', 'github.com/AprileNunzio/ARGUS-PR'),
                spec('Modalita\'', status.supported ? 'automatica con ripristino' : 'manuale')
            ]),
            el('div', { className: 'panel__body stack' }, [
                ...messages,
                available && latest
                    ? el('div', { className: 'stack--tight' }, [
                        el('strong', { textContent: latest.name }),
                        latest.publishedAt
                            ? el('span', { className: 'section__hint', textContent: `Pubblicata il ${new Date(latest.publishedAt).toLocaleDateString()}` })
                            : null,
                        releaseNotes(latest.notes),
                        el('a', {
                            className: 'section__hint',
                            href: latest.url,
                            target: '_blank',
                            rel: 'noreferrer noopener',
                            textContent: 'Note di rilascio complete su GitHub'
                        })
                    ])
                    : null
            ]),
            el('div', { className: 'panel__foot' }, [
                el('span', { className: 'section__hint', textContent: status.lastCheck ? `Ultimo controllo: ${new Date(status.lastCheck.checkedAt).toLocaleString()}` : 'Mai controllato' }),
                el('div', { className: 'row row--tight' }, [checkButton, applyButton])
            ])
        );
    };

    return { element: host, refresh: paint };
}
