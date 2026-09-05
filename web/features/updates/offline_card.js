import { el, chip, notice, confirmPanel, formatBytes } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, segmented, tabsBar } from '/assets/ui.js';

const SOURCES = [
    { id: 'upload', label: 'Carica file ZIP', icon: 'download' },
    { id: 'usb', label: 'USB / disco locale', icon: 'disk' },
    { id: 'share', label: 'Cartella SMB o NFS', icon: 'network' },
    { id: 'remote', label: 'FTP o HTTPS', icon: 'globe' }
];

const HINTS = {
    upload: 'Carica direttamente l archivio ZIP della nuova versione dal tuo computer.',
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

    let source = 'upload';
    let bundles = [];
    let selected = null;
    let verified = null;
    let searchPath = '';
    let remoteUrl = '';
    let checksum = '';
    let forceInstall = false;

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

    const uploadFile = async (file) => {
        say('info', `Caricamento di ${file.name} (${formatBytes(file.size)}) in corso…`);
        try {
            const response = await fetch('/api/updates/offline/upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream'
                },
                body: file
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({ error: { message: `Errore HTTP ${response.status}` } }));
                throw new Error(err.error?.message ?? `Errore HTTP ${response.status}`);
            }
            const data = await response.json();
            bundles = [data.bundle];
            selected = data.bundle;
            verified = data.bundle;
            say('ok', `Pacchetto ${data.bundle.tag} caricato con successo (${formatBytes(data.bundle.sizeBytes)}).`);
            render();
        } catch (error) {
            say('error', `Caricamento fallito: ${error.message}`);
        }
    };

    const apply = () => {
        confirmHost.replaceChildren(confirmPanel({
            title: `Installare ${verified.tag} dal pacchetto offline?`,
            message: `Il pacchetto verra applicato da ${verified.name} e il servizio si riavviera. Se la nuova versione non si stabilizza entro 90 secondi, il watchdog ripristina la v${currentVersion}.`,
            confirmLabel: 'Installa e riavvia',
            onCancel: () => confirmHost.replaceChildren(),
            onConfirm: async () => {
                const payload = { path: verified.path };
                if (checksum.trim().length > 0) payload.sha256 = checksum.trim();
                if (forceInstall || !verified.newer) payload.force = true;

                const result = await api.post('/api/updates/offline/apply', payload).catch((error) => ({ failure: error }));
                confirmHost.replaceChildren();

                if (result.failure) {
                    say('error', `Installazione non avviata: ${result.failure.message}`);
                    return;
                }

                say('warn', `Pacchetto ${verified.tag} applicato. Il servizio si sta riavviando: ricarica fra 30-60 secondi.`);
                onApplied();
            }
        }));
    };

    const sourceBody = () => {
        if (source === 'upload') {
            const fileInput = el('input', {
                type: 'file',
                accept: '.zip,.bundle,.pack'
            });
            fileInput.hidden = true;

            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                await uploadFile(file);
            });

            const chooseBtn = el('button', {
                className: 'btn btn--primary',
                type: 'button',
                onclick: () => fileInput.click()
            }, [icon('download'), el('span', { textContent: 'Sfoglia file ZIP / Bundle' })]);

            const dropZone = el('div', {
                className: 'panel panel--dashed stack stack--tight',
                onclick: (e) => {
                    if (e.target !== chooseBtn && !chooseBtn.contains(e.target)) fileInput.click();
                }
            }, [
                fileInput,
                el('div', { className: 'row row--center' }, [icon('archive', { className: 'icon--lg' })]),
                el('strong', { className: 'text-center', textContent: 'Carica archivio ZIP o pacchetto Git' }),
                el('span', { className: 'section__hint text-center', textContent: 'Trascina qui il file .zip (es. scaricato da GitHub Releases) oppure fai clic per sfogliare' }),
                el('div', { className: 'row row--center' }, [chooseBtn])
            ]);

            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('dropzone--active');
            });
            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('dropzone--active');
            });
            dropZone.addEventListener('drop', async (e) => {
                e.preventDefault();
                dropZone.classList.remove('dropzone--active');
                const file = e.dataTransfer?.files?.[0];
                if (file) await uploadFile(file);
            });

            return [dropZone];
        }

        if (source === 'remote') {
            const urlInput = el('input', {
                className: 'input input--mono',
                value: remoteUrl,
                placeholder: 'https://example.com/argus-pr-v0.40.0.zip'
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
                    el('span', { className: 'xrow__hint', textContent: 'Sono ammessi ftp, ftps, http e https (.zip o .bundle).' })
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

        const canInstall = verified.newer || forceInstall;
        const forceOption = !verified.newer
            ? el('label', { className: 'row row--tight clickable' }, [
                el('input', {
                    type: 'checkbox',
                    checked: forceInstall,
                    onchange: (e) => {
                        forceInstall = e.target.checked;
                        render();
                    }
                }),
                el('span', { className: 'section__hint', textContent: 'Forza l installazione (reinstalla anche se la versione coincide o per riparare i file)' })
            ])
            : null;

        const checksumInput = el('input', { className: 'input input--mono', value: checksum, placeholder: 'Impronta SHA-256 attesa (facoltativa)' });
        checksumInput.addEventListener('input', () => { checksum = checksumInput.value; });

        const installButton = el('button', {
            className: 'btn btn--primary',
            type: 'button',
            disabled: canInstall ? null : 'disabled',
            onclick: apply
        }, [icon('download'), el('span', { textContent: canInstall ? `Installa ${verified.tag}` : 'Versione non successiva' })]);

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
                    el('span', { className: 'spec__k', textContent: 'Formato' }),
                    el('span', { className: 'spec__v', textContent: verified.isZip ? 'Archivio ZIP' : 'Bundle Git' })
                ])
            ]),
            el('div', { className: 'field' }, [
                el('label', { textContent: 'Verifica di integrita' }),
                checksumInput,
                el('span', { className: 'xrow__hint', textContent: 'Se compilata, l installazione viene rifiutata quando l impronta non coincide.' })
            ]),
            forceOption,
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
                el('span', { textContent: 'Carica direttamente l archivio ZIP della release (scaricato da GitHub o preparato localmente) oppure posiziona i file .zip o .bundle su USB o share di rete.' })
            ])
        );
    };

    render();

    return card({
        title: 'Installazione manuale (File ZIP, USB, SMB o FTP)',
        subtitle: 'Aggiorna il server caricando direttamente l archivio ZIP o importando un pacchetto con lo stesso watchdog di ripristino',
        iconName: 'archive',
        tone: 'purple',
        badge: chip('Offline & ZIP', 'info'),
        body: [host]
    });
}

export function offlineSourcePicker(value, onChange) {
    return segmented(SOURCES.map((entry) => ({ value: entry.id, label: entry.label, icon: entry.icon })), value, onChange, { compact: true });
}
