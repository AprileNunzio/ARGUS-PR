import { el, chip, notice, confirmPanel, formatBytes } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, segmented, tabsBar } from '/assets/ui.js';

const SOURCES = [
    { id: 'usb', label: 'USB / disco locale', icon: 'disk' },
    { id: 'share', label: 'Cartella SMB o NFS', icon: 'network' },
    { id: 'remote', label: 'FTP o HTTPS', icon: 'globe' }
];

const HINTS = {
    usb: 'Inserisci la chiavetta e premi Cerca: vengono esaminati /media, /mnt e /run/media.',
    share: 'Indica il punto di montaggio della share gia collegata, ad esempio /mnt/nas/aggiornamenti.',
    remote: 'Scarica il pacchetto da un server FTP, FTPS o HTTPS raggiungibile dal server ARGUS-PR.'
};

function bundleRow(bundle, selected, onSelect) {
    return el('button', {
        type: 'button',
        className: selected ? 'bundle-row bundle-row--on' : 'bundle-row',
        title: bundle.path,
        onclick: () => onSelect(bundle)
    }, [
        el('span', { className: 'bundle-row__icon' }, [icon('archive', { className: 'icon--lg' })]),
        el('span', { className: 'bundle-row__body' }, [
            el('span', { className: 'bundle-row__name', textContent: bundle.name }),
            el('span', { className: 'bundle-row__path', textContent: bundle.path }),
            el('span', { className: 'bundle-row__meta', textContent: `${formatBytes(bundle.sizeBytes)} · ${new Date(bundle.modifiedAt).toLocaleString('it-IT')}` })
        ]),
        chip(bundle.tag, bundle.newer ? 'ok' : 'warn')
    ]);
}

export function offlineUpdateCard({ api, currentVersion, onApplied }) {
    const host = el('div', { className: 'stack' });
    const message = el('div', {});
    const confirmHost = el('div', {});

    let source = 'usb';
    let bundles = [];
    let selected = null;
    let verified = null;
    let searchPath = '';
    let remoteUrl = '';
    let checksum = '';

    const say = (kind, text) => message.replaceChildren(notice(kind, text));

    const scan = async (extraPath) => {
        const query = extraPath && extraPath.length > 0 ? `?path=${encodeURIComponent(extraPath)}` : '';
        const result = await api.get(`/api/updates/offline/scan${query}`).catch((error) => ({ failure: error }));

        if (result.failure) {
            say('error', `Ricerca non riuscita: ${result.failure.message}`);
            return;
        }

        bundles = result.bundles;
        selected = null;
        verified = null;

        if (bundles.length === 0) {
            say('warn', 'Nessun pacchetto argus-pr-vX.Y.Z.bundle trovato nei percorsi esaminati.');
        } else {
            say('ok', `${bundles.length} pacchetti trovati.`);
        }

        render();
    };

    const verify = async (bundle) => {
        const result = await api.post('/api/updates/offline/verify', { path: bundle.path }).catch((error) => ({ failure: error }));

        if (result.failure) {
            verified = null;
            say('error', `Pacchetto rifiutato: ${result.failure.message}`);
            render();
            return;
        }

        verified = result.bundle;
        say('ok', `Pacchetto valido: contiene il tag ${verified.tag}. Confronta l impronta SHA-256 con quella pubblicata prima di installare.`);
        render();
    };

    const download = async () => {
        if (remoteUrl.trim().length === 0) {
            say('warn', 'Indica l indirizzo completo del pacchetto.');
            return;
        }

        say('info', 'Scaricamento del pacchetto in corso…');
        const result = await api.post('/api/updates/offline/download', { url: remoteUrl.trim() }).catch((error) => ({ failure: error }));

        if (result.failure) {
            say('error', `Download non riuscito: ${result.failure.message}`);
            return;
        }

        bundles = [result.bundle];
        selected = result.bundle;
        await verify(result.bundle);
    };

    const apply = () => {
        confirmHost.replaceChildren(confirmPanel({
            title: `Installare ${verified.tag} dal pacchetto offline?`,
            message: `Il tag verra importato da ${verified.name} e il servizio si riavviera. Se la nuova versione non si stabilizza entro 90 secondi, il watchdog ripristina la v${currentVersion}.`,
            confirmLabel: 'Importa e riavvia',
            onCancel: () => confirmHost.replaceChildren(),
            onConfirm: async () => {
                const payload = { path: verified.path };
                if (checksum.trim().length > 0) payload.sha256 = checksum.trim();

                const result = await api.post('/api/updates/offline/apply', payload).catch((error) => ({ failure: error }));
                confirmHost.replaceChildren();

                if (result.failure) {
                    say('error', `Installazione non avviata: ${result.failure.message}`);
                    return;
                }

                say('warn', `Pacchetto ${verified.tag} importato. Il servizio si sta riavviando: ricarica fra 30-60 secondi.`);
                onApplied();
            }
        }));
    };

    const sourceBody = () => {
        if (source === 'remote') {
            const urlInput = el('input', {
                className: 'input input--mono',
                value: remoteUrl,
                placeholder: 'ftp://192.168.1.10/aggiornamenti/argus-pr-v0.22.0.bundle'
            });
            urlInput.addEventListener('input', () => { remoteUrl = urlInput.value; });

            const button = el('button', { className: 'btn', type: 'button', onclick: download }, [
                icon('download'),
                el('span', { textContent: 'Scarica e verifica' })
            ]);

            return [
                el('div', { className: 'field' }, [
                    el('label', { textContent: 'Indirizzo del pacchetto' }),
                    urlInput,
                    el('span', { className: 'xrow__hint', textContent: 'Sono ammessi ftp, ftps, http e https. Il nome del file deve essere argus-pr-vX.Y.Z.bundle.' })
                ]),
                el('div', { className: 'row row--end' }, [button])
            ];
        }

        const pathInput = el('input', {
            className: 'input input--mono',
            value: searchPath,
            placeholder: source === 'share' ? '/mnt/nas/aggiornamenti' : '/media/usb'
        });
        pathInput.addEventListener('input', () => { searchPath = pathInput.value; });

        const button = el('button', { className: 'btn', type: 'button', onclick: () => scan(searchPath.trim()) }, [
            icon('search'),
            el('span', { textContent: 'Cerca pacchetti' })
        ]);

        return [
            el('div', { className: 'field' }, [
                el('label', { textContent: 'Percorso aggiuntivo da esaminare' }),
                pathInput,
                el('span', { className: 'xrow__hint', textContent: HINTS[source] })
            ]),
            el('div', { className: 'row row--end' }, [button]),
            bundles.length > 0
                ? el('div', { className: 'bundle-list' }, bundles.map((bundle) => bundleRow(bundle, selected?.path === bundle.path, (picked) => {
                    selected = picked;
                    verify(picked);
                })))
                : null
        ];
    };

    const verifiedPanel = () => {
        if (!verified) return null;

        const checksumInput = el('input', { className: 'input input--mono', value: checksum, placeholder: 'Impronta SHA-256 attesa (facoltativa)' });
        checksumInput.addEventListener('input', () => { checksum = checksumInput.value; });

        const installButton = el('button', {
            className: 'btn btn--primary',
            type: 'button',
            disabled: verified.newer ? null : 'disabled',
            onclick: apply
        }, [icon('download'), el('span', { textContent: verified.newer ? `Installa ${verified.tag}` : 'Versione non successiva' })]);

        return el('div', { className: 'stack stack--tight' }, [
            el('div', { className: 'spec-grid' }, [
                el('div', { className: 'spec' }, [
                    el('span', { className: 'spec__k', textContent: 'Versione nel pacchetto' }),
                    el('span', { className: 'spec__v', textContent: verified.tag })
                ]),
                el('div', { className: 'spec' }, [
                    el('span', { className: 'spec__k', textContent: 'Dimensione' }),
                    el('span', { className: 'spec__v', textContent: formatBytes(verified.sizeBytes) })
                ]),
                el('div', { className: 'spec' }, [
                    el('span', { className: 'spec__k', textContent: 'Impronta SHA-256' }),
                    el('span', { className: 'spec__v break', textContent: verified.sha256 })
                ]),
                el('div', { className: 'spec' }, [
                    el('span', { className: 'spec__k', textContent: 'Riferimenti inclusi' }),
                    el('span', { className: 'spec__v', textContent: `${verified.refs.length} ref` })
                ])
            ]),
            el('div', { className: 'field' }, [
                el('label', { textContent: 'Verifica di integrita' }),
                checksumInput,
                el('span', { className: 'xrow__hint', textContent: 'Se compilata, l installazione viene rifiutata quando l impronta non coincide.' })
            ]),
            el('div', { className: 'row row--end' }, [installButton])
        ]);
    };

    const render = () => {
        host.replaceChildren(
            tabsBar(SOURCES.map((entry) => ({ id: entry.id, label: entry.label, icon: entry.icon })), source, (id) => {
                source = id;
                render();
            }),
            message,
            confirmHost,
            el('div', { className: 'stack' }, sourceBody()),
            verifiedPanel(),
            el('p', { className: 'xcard__note' }, [
                icon('info'),
                el('span', { textContent: 'Genera il pacchetto da una copia del repository con: git bundle create argus-pr-v0.22.0.bundle --all' })
            ])
        );
    };

    render();

    return card({
        title: 'Installazione manuale da USB, SMB o FTP',
        subtitle: 'Aggiorna un server senza accesso a internet importando un pacchetto firmato con lo stesso watchdog di ripristino',
        iconName: 'archive',
        tone: 'purple',
        badge: chip('Offline', 'info'),
        body: [host]
    });
}

export function offlineSourcePicker(value, onChange) {
    return segmented(SOURCES.map((entry) => ({ value: entry.id, label: entry.label, icon: entry.icon })), value, onChange, { compact: true });
}
