import { el, chip, notice, empty, pageHead, formatBytes } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

function storageCard(pool, onEdit, onDelete) {
    const stats = pool.stats;
    const isOnline = pool.status === 'online';
    const percent = stats?.usedPercent ?? 0;

    const progress = el('div', { className: 'meter' }, [
        el('div', {
            className: `meter__fill ${percent > 90 ? 'meter__fill--danger' : percent > 75 ? 'meter__fill--warning' : ''}`,
            style: `width: ${Math.min(100, Math.max(0, percent))}%`
        })
    ]);

    const camerasList = (pool.assignedCameras || []).map((c) => el('span', { className: 'badge badge--blue', textContent: c.name }));

    return el('div', { className: 'panel storage-card rise' }, [
        el('div', { className: 'panel__head row row--between' }, [
            el('div', { className: 'row row--tight' }, [
                icon('disk'),
                el('strong', { textContent: pool.name }),
                pool.isDefault ? chip('Predefinito', 'info') : null,
                chip(isOnline ? 'Online' : 'Offline', isOnline ? 'ok' : 'bad')
            ]),
            el('div', { className: 'row row--tight' }, [
                el('button', { className: 'btn btn--sm', textContent: 'Modifica', onclick: () => onEdit(pool) }),
                !pool.isDefault ? el('button', { className: 'btn btn--sm btn--danger', textContent: 'Elimina', onclick: () => onDelete(pool) }) : null
            ])
        ]),
        el('div', { className: 'panel__body stack stack--tight' }, [
            el('div', { className: 'spec-grid' }, [
                el('div', { className: 'spec' }, [el('span', { className: 'spec__k', textContent: 'Tipo' }), el('span', { className: 'spec__v', textContent: pool.kind.toUpperCase() })]),
                el('div', { className: 'spec' }, [el('span', { className: 'spec__k', textContent: 'Percorso' }), el('span', { className: 'spec__v truncate', textContent: pool.path })]),
                el('div', { className: 'spec' }, [el('span', { className: 'spec__k', textContent: 'Spazio Libero' }), el('span', { className: 'spec__v', textContent: stats ? formatBytes(stats.freeBytes) : '--' })]),
                el('div', { className: 'spec' }, [el('span', { className: 'spec__k', textContent: 'Spazio Totale' }), el('span', { className: 'spec__v', textContent: stats ? formatBytes(stats.totalBytes) : '--' })])
            ]),
            el('div', { className: 'stack stack--tight' }, [
                el('div', { className: 'row row--between' }, [
                    el('span', { className: 'section__hint', textContent: 'Utilizzo disco' }),
                    el('span', { className: 'section__hint font-mono', textContent: `${percent}% (${stats ? formatBytes(stats.usedBytes) : '--'})` })
                ]),
                progress
            ]),
            el('div', { className: 'stack stack--tight' }, [
                el('span', { className: 'section__hint', textContent: 'Telecamere instradate su questo storage:' }),
                el('div', { className: 'row row--wrap row--tight' }, camerasList.length > 0 ? camerasList : [el('span', { className: 'section__hint text-muted', textContent: 'Nessun canale assegnato' })])
            ])
        ])
    ]);
}

function physicalDiskCard(disk) {
    const partitions = (disk.partitions || []).map((p) => {
        const stats = p.stats;
        return el('div', { className: 'spec' }, [
            el('span', { className: 'spec__k', textContent: p.name + (p.fstype ? ` (${p.fstype})` : '') }),
            el('span', { className: 'spec__v truncate', textContent: p.mountpoint ? `${p.mountpoint} - ${stats ? formatBytes(stats.freeBytes) + ' liberi su ' + formatBytes(stats.totalBytes) : 'Montato'}` : 'Non montata' })
        ]);
    });

    return el('div', { className: 'panel rise' }, [
        el('div', { className: 'panel__head row row--between' }, [
            el('div', { className: 'row row--tight' }, [
                icon('server'),
                el('strong', { textContent: disk.name + (disk.model ? ` - ${disk.model}` : '') }),
                chip(disk.type.toUpperCase(), 'info')
            ]),
            el('span', { className: 'badge badge--cyan font-mono', textContent: formatBytes(disk.sizeBytes) })
        ]),
        el('div', { className: 'panel__body stack stack--tight' }, [
            partitions.length > 0 ? el('div', { className: 'spec-grid' }, partitions) : el('span', { className: 'section__hint text-muted', textContent: 'Nessuna partizione rilevata' })
        ])
    ]);
}

function raidCard(array) {
    const isHealthy = array.isHealthy;
    return el('div', { className: 'panel rise' }, [
        el('div', { className: 'panel__head row row--between' }, [
            el('div', { className: 'row row--tight' }, [
                icon('shield'),
                el('strong', { textContent: `Array RAID: ${array.name} (${array.level.toUpperCase()})` }),
                chip(isHealthy ? 'Stato Ottimale' : 'Degradato / Errore', isHealthy ? 'ok' : 'bad')
            ]),
            el('span', { className: 'badge badge--purple', textContent: array.state })
        ]),
        el('div', { className: 'panel__body stack stack--tight' }, [
            el('div', { className: 'spec-grid' }, [
                el('div', { className: 'spec' }, [el('span', { className: 'spec__k', textContent: 'Dischi Membri' }), el('span', { className: 'spec__v', textContent: array.devices.join(', ') })]),
                el('div', { className: 'spec' }, [el('span', { className: 'spec__k', textContent: 'Dettagli / Blocchi' }), el('span', { className: 'spec__v truncate', textContent: array.detail || '--' })])
            ])
        ])
    ]);
}

export async function renderStorageView({ api }) {
    const root = el('div', { className: 'view storage-view' });
    const feedback = el('div', {});
    const modalHost = el('div', {});

    let data = await api.get('/api/storage/overview').catch((err) => ({ failure: err }));

    const refresh = async () => {
        data = await api.get('/api/storage/overview').catch((err) => ({ failure: err }));
        render();
    };

    const openAddPoolModal = () => {
        const nameInput = el('input', { className: 'input', placeholder: 'es. HDD Videosorveglianza 4TB o NAS Synology' });
        const kindSelect = el('select', { className: 'select' }, [
            el('option', { value: 'local', textContent: 'Disco Locale / Volume SATA/USB' }),
            el('option', { value: 'nas', textContent: 'NAS di Rete (SMB / CIFS / NFS)' })
        ]);
        const pathInput = el('input', { className: 'input', placeholder: '/mnt/storage o E:\\Registrazioni' });
        const defaultCheck = el('input', { type: 'checkbox' });
        const statusHint = el('div', { className: 'section__hint', textContent: 'Assicurati che la cartella esista o sia accessibile.' });

        const nasFields = el('div', { className: 'stack stack--tight', hidden: 'hidden' }, [
            el('div', { className: 'form-grid' }, [
                el('div', { className: 'field' }, [el('label', { textContent: 'Protocollo' }), el('select', { className: 'select', id: 'nas-proto' }, [el('option', { value: 'smb', textContent: 'SMB / Windows Share (CIFS)' }), el('option', { value: 'nfs', textContent: 'NFS Linux' })])]),
                el('div', { className: 'field' }, [el('label', { textContent: 'Host / IP NAS' }), el('input', { className: 'input', id: 'nas-host', placeholder: '192.168.1.50' })]),
                el('div', { className: 'field' }, [el('label', { textContent: 'Nome Cartella Condivisa (Share)' }), el('input', { className: 'input', id: 'nas-share', placeholder: 'cctv_archive' })]),
                el('div', { className: 'field' }, [el('label', { textContent: 'Utente (opzionale)' }), el('input', { className: 'input', id: 'nas-user', placeholder: 'admin' })]),
                el('div', { className: 'field' }, [el('label', { textContent: 'Password (opzionale)' }), el('input', { className: 'input', type: 'password', id: 'nas-pass' })])
            ])
        ]);

        kindSelect.addEventListener('change', () => {
            if (kindSelect.value === 'nas') {
                nasFields.removeAttribute('hidden');
                pathInput.placeholder = '/mnt/nas_recordings';
            } else {
                nasFields.setAttribute('hidden', 'hidden');
                pathInput.placeholder = '/mnt/storage o E:\\Registrazioni';
            }
        });

        const testBtn = el('button', { className: 'btn', type: 'button', textContent: 'Verifica Percorso' }, []);
        testBtn.addEventListener('click', async () => {
            testBtn.disabled = true;
            statusHint.textContent = 'Verifica scrittura in corso…';
            const res = await api.post('/api/storage/test-path', { path: pathInput.value.trim() }).catch((err) => ({ failure: err }));
            testBtn.disabled = false;
            if (res.failure || !res.success) {
                statusHint.textContent = 'Errore: ' + (res.failure?.message || res.error || 'Impossibile scrivere');
                statusHint.className = 'section__hint text-danger';
            } else {
                statusHint.textContent = 'Percorso verificato con successo! Spazio libero: ' + (res.stats ? formatBytes(res.stats.freeBytes) : 'OK');
                statusHint.className = 'section__hint text-success';
            }
        });

        const saveBtn = el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Crea Storage Pool' });
        saveBtn.addEventListener('click', async () => {
            if (!nameInput.value.trim() || !pathInput.value.trim()) {
                statusHint.textContent = 'Compila nome e percorso di destinazione';
                statusHint.className = 'section__hint text-danger';
                return;
            }
            saveBtn.disabled = true;
            const payload = {
                name: nameInput.value.trim(),
                kind: kindSelect.value,
                path: pathInput.value.trim(),
                isDefault: defaultCheck.checked
            };
            if (kindSelect.value === 'nas') {
                payload.networkHost = document.getElementById('nas-host')?.value?.trim();
                payload.networkShare = document.getElementById('nas-share')?.value?.trim();
                payload.networkProto = document.getElementById('nas-proto')?.value;
                payload.username = document.getElementById('nas-user')?.value?.trim();
                payload.password = document.getElementById('nas-pass')?.value;
            }

            const outcome = await api.post('/api/storage/pools', payload).catch((err) => ({ failure: err }));
            saveBtn.disabled = false;
            if (outcome.failure) {
                statusHint.textContent = 'Errore: ' + outcome.failure.message;
                statusHint.className = 'section__hint text-danger';
                return;
            }
            modalHost.replaceChildren();
            feedback.replaceChildren(notice('ok', 'Storage Pool creato con successo'));
            refresh();
        });

        const modal = el('div', { className: 'modal-overlay' }, [
            el('div', { className: 'panel modal-panel rise' }, [
                el('div', { className: 'panel__head row row--between' }, [
                    el('strong', { textContent: 'Aggiungi Nuovo Storage Pool' }),
                    el('button', { className: 'btn btn--sm', textContent: 'Chiudi', onclick: () => modalHost.replaceChildren() })
                ]),
                el('div', { className: 'panel__body stack' }, [
                    el('div', { className: 'form-grid' }, [
                        el('div', { className: 'field' }, [el('label', { textContent: 'Nome Identificativo' }), nameInput]),
                        el('div', { className: 'field' }, [el('label', { textContent: 'Tipo Storage' }), kindSelect]),
                        el('div', { className: 'field' }, [el('label', { textContent: 'Percorso Directory di Salvataggio' }), pathInput]),
                        el('div', { className: 'field' }, [
                            el('label', { textContent: 'Imposta come predefinito per nuove telecamere' }),
                            el('label', { className: 'row row--tight' }, [defaultCheck, el('span', { textContent: 'Predefinito' })])
                        ])
                    ]),
                    nasFields,
                    el('div', { className: 'row row--between' }, [testBtn, saveBtn]),
                    statusHint
                ])
            ])
        ]);

        modalHost.replaceChildren(modal);
    };

    const render = () => {
        if (data.failure) {
            root.replaceChildren(
                pageHead({ title: 'Storage & Registrazioni', hint: 'Gestione memorie fisiche, partizioni, RAID e destinazioni NAS/SMB' }),
                notice('error', 'Impossibile caricare telemetria storage: ' + data.failure.message)
            );
            return;
        }

        const pools = data.pools || [];
        const detectedDisks = data.detected?.disks || [];
        const detectedRaid = data.detected?.raid || [];

        const poolsCards = pools.map((p) => storageCard(p, () => {}, async (pool) => {
            await api.remove(`/api/storage/pools/${pool.id}`).catch(() => {});
            refresh();
        }));

        const diskCards = detectedDisks.map(physicalDiskCard);
        const raidCards = detectedRaid.map(raidCard);

        root.replaceChildren(
            pageHead({
                title: 'Storage & Archiviazione Registrazioni',
                hint: 'Configurazione multi-disco enterprise, volumi RAID e salvataggio su NAS di rete con routing indipendente per telecamera',
                actions: [
                    el('button', { className: 'btn btn--primary', textContent: '+ Aggiungi Storage Pool', onclick: openAddPoolModal })
                ]
            }),
            feedback,
            modalHost,
            el('section', { className: 'stack' }, [
                el('h2', { className: 'section__title', textContent: 'Destinazioni di Registrazione Attive (Storage Pools)' }),
                poolsCards.length > 0 ? el('div', { className: 'grid grid--cols-2' }, poolsCards) : empty('Nessun pool dedicato configurato. Le registrazioni usano il percorso standard di sistema.')
            ]),
            raidCards.length > 0 ? el('section', { className: 'stack' }, [
                el('h2', { className: 'section__title', textContent: 'Volumi e Array RAID Rilevati' }),
                el('div', { className: 'grid grid--cols-2' }, raidCards)
            ]) : null,
            el('section', { className: 'stack' }, [
                el('h2', { className: 'section__title', textContent: 'Dischi Fisici e Partizioni del Server' }),
                diskCards.length > 0 ? el('div', { className: 'grid grid--cols-2' }, diskCards) : empty('Nessun disco fisico rilevato.')
            ])
        );
    };

    render();
    return root;
}
