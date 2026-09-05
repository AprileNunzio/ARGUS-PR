import { el, notice, formatBytes, pageHead } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, segmented, toggle, tabsBar } from '/assets/ui.js';
import {
    QUOTA_UNITS,
    SMB_VERSIONS,
    labelled,
    numberInput,
    selectInput,
    quotaBytes,
    targetPicker,
    cameraPicker,
    benchmarkReport
} from './pool_fields.js';

const TABS = [
    { id: 'target', label: 'Destinazione', icon: 'disk' },
    { id: 'policy', label: 'Quote & Ritenzione', icon: 'clock' },
    { id: 'cameras', label: 'Telecamere', icon: 'camera' },
    { id: 'network', label: 'NAS & Rete', icon: 'globe' },
    { id: 'bench', label: 'Prestazioni', icon: 'activity' }
];

function initialDraft(pool) {
    return {
        name: pool?.name ?? '',
        kind: pool?.kind ?? 'local',
        path: pool?.path ?? '',
        isDefault: pool?.isDefault ?? false,
        quotaAmount: pool?.maxBytes > 0 ? Math.round((pool.maxBytes / 1024 ** 3) * 10) / 10 : 0,
        quotaUnit: pool?.maxBytes > 0 ? 'gb' : 'none',
        minFreeGb: Math.max(1, Math.round((pool?.minFreeBytes ?? 5368709120) / 1024 ** 3)),
        alarmPercent: pool?.alarmPercent ?? 10,
        retentionPolicy: pool?.retentionPolicy ?? 'fifo',
        retentionDays: pool?.retentionDays ?? 30,
        networkProto: pool?.networkProto ?? 'smb',
        networkHost: pool?.networkHost ?? '',
        networkShare: pool?.networkShare ?? '',
        smbVersion: pool?.smbVersion ?? '',
        username: pool?.username ?? '',
        password: '',
        mountOptions: pool?.mountOptions ?? '',
        reconnectSeconds: pool?.reconnectSeconds ?? 30
    };
}

export function renderPoolForm({ api, detected, cameras, pool = null, onSaved, onCancel }) {
    const host = el('div', { className: 'view view--tight' });
    const draft = initialDraft(pool);
    const selectedCameras = new Set((pool?.assignedCameras ?? []).map((camera) => camera.id));

    let activeTab = 'target';
    let benchmark = null;
    let busy = false;

    const message = el('div', {});
    const bodyHost = el('div', { className: 'stack' });
    const close = () => onCancel();

    const totalForPath = () => {
        for (const disk of detected.disks ?? []) {
            for (const partition of disk.partitions ?? []) {
                if (partition.mountpoint === draft.path) return partition.stats?.totalBytes ?? 0;
            }
        }
        const mount = (detected.mounts ?? []).find((entry) => entry.mountpoint === draft.path);
        return mount?.stats?.totalBytes ?? 0;
    };

    const say = (kind, text) => message.replaceChildren(notice(kind, text));

    const targetTab = () => {
        const nameInput = el('input', { className: 'input', value: draft.name, placeholder: 'es. HDD Videosorveglianza 4TB' });
        nameInput.addEventListener('input', () => { draft.name = nameInput.value; });

        const pathInput = el('input', { className: 'input input--mono', value: draft.path, placeholder: draft.kind === 'nas' ? '/mnt/nas_recordings' : '/mnt/storage' });
        pathInput.addEventListener('input', () => { draft.path = pathInput.value; });

        const verify = el('button', { className: 'btn', type: 'button' }, [icon('check'), el('span', { textContent: 'Verifica percorso' })]);
        verify.addEventListener('click', async () => {
            if (draft.path.trim().length === 0) {
                say('warn', 'Indica prima un percorso di destinazione.');
                return;
            }
            verify.disabled = true;
            const result = await api.post('/api/storage/test-path', { path: draft.path.trim() }).catch((error) => ({ failure: error }));
            verify.disabled = false;

            if (result.failure || !result.success) {
                say('error', `Percorso non scrivibile: ${result.failure?.message ?? result.error}`);
                return;
            }
            say('ok', `Percorso verificato. Spazio libero: ${result.stats ? formatBytes(result.stats.freeBytes) : 'disponibile'}.`);
        });

        return [
            labelled('Nome identificativo', 'Come comparira nell elenco delle destinazioni di registrazione', nameInput),
            labelled('Tipo di storage', 'Un volume locale oppure una condivisione di rete montata sul server', segmented([
                { value: 'local', label: 'Disco locale', icon: 'disk', hint: 'Volume SATA, USB, NVMe o array RAID' },
                { value: 'nas', label: 'NAS di rete', icon: 'globe', hint: 'Condivisione SMB/CIFS o NFS' }
            ], draft.kind, (value) => {
                draft.kind = value;
                render();
            })),
            el('div', { className: 'stack stack--tight' }, [
                el('span', { className: 'xrow__title', textContent: 'Dischi e partizioni rilevati' }),
                el('span', { className: 'xrow__hint', textContent: 'Un clic seleziona il punto di montaggio: non serve digitare il percorso a mano.' }),
                targetPicker({
                    detected,
                    selectedPath: draft.path,
                    onPick: (path) => {
                        draft.path = path;
                        render();
                    }
                })
            ]),
            labelled('Percorso della directory di salvataggio', 'Verra creata se non esiste, purche il processo abbia i permessi di scrittura', pathInput),
            el('div', { className: 'row row--between' }, [
                verify,
                el('label', { className: 'row row--tight' }, [
                    toggle(draft.isDefault, (value) => { draft.isDefault = value; }, ['Destinazione predefinita', 'Destinazione secondaria'])
                ])
            ])
        ];
    };

    const policyTab = () => {
        const total = totalForPath();
        const amount = numberInput(draft.quotaAmount, { min: 0, max: 999999, step: 0.5 });
        amount.addEventListener('input', () => { draft.quotaAmount = Number(amount.value); });
        amount.disabled = draft.quotaUnit === 'none';

        const unit = selectInput(QUOTA_UNITS.map((entry) => ({ value: entry.value, label: entry.label })), draft.quotaUnit);
        unit.addEventListener('change', () => {
            draft.quotaUnit = unit.value;
            render();
        });

        const minFree = numberInput(draft.minFreeGb, { min: 1, max: 100000, step: 1 });
        minFree.addEventListener('input', () => { draft.minFreeGb = Number(minFree.value); });

        const alarm = numberInput(draft.alarmPercent, { min: 1, max: 90, step: 1 });
        alarm.addEventListener('input', () => { draft.alarmPercent = Number(alarm.value); });

        const days = numberInput(draft.retentionDays, { min: 1, max: 3650, step: 1 });
        days.addEventListener('input', () => { draft.retentionDays = Number(days.value); });

        const resolved = quotaBytes(draft.quotaAmount, draft.quotaUnit, total);

        return [
            el('div', { className: 'form-grid' }, [
                labelled('Quota massima assegnata al pool', 'Spazio massimo che le registrazioni possono occupare su questa destinazione', el('div', { className: 'row row--tight row--nowrap' }, [amount, unit])),
                labelled('Spazio minimo da lasciare libero', 'Riserva di sicurezza espressa in GB, sotto la quale scatta la politica di overflow', minFree),
                labelled('Soglia di allarme spazio residuo', 'Percentuale di spazio libero sotto la quale il pool segnala un allarme', alarm),
                labelled('Giorni di ritenzione', 'Eta massima dei filmati conservati su questa destinazione', days)
            ]),
            resolved > 0
                ? notice('info', `Quota effettiva: ${formatBytes(resolved)}${total > 0 ? ` su ${formatBytes(total)} totali` : ''}.`)
                : notice('info', 'Nessuna quota impostata: il pool puo usare tutto lo spazio disponibile fino alla riserva minima.'),
            labelled('Politica di overflow', 'Cosa fare quando la quota o la riserva minima vengono raggiunte', segmented([
                { value: 'fifo', label: 'FIFO: elimina i piu vecchi', icon: 'refresh', hint: 'Continua a registrare cancellando i segmenti piu vecchi' },
                { value: 'block', label: 'Blocca acquisizione', icon: 'lock', hint: 'Interrompe la registrazione e conserva tutto il materiale gia presente' }
            ], draft.retentionPolicy, (value) => { draft.retentionPolicy = value; }))
        ];
    };

    const camerasTab = () => [
        el('span', { className: 'xrow__hint', textContent: 'Le telecamere selezionate scriveranno i loro segmenti su questa destinazione appena il pool viene creato.' }),
        cameraPicker({
            cameras,
            selected: selectedCameras,
            onToggle: (id, checked) => {
                if (checked) selectedCameras.add(id);
                else selectedCameras.delete(id);
                render();
            }
        }),
        notice('info', `${selectedCameras.size} telecamere verranno instradate su questo pool.`)
    ];

    const networkTab = () => {
        if (draft.kind !== 'nas') {
            return [notice('info', 'Sezione disponibile solo per le destinazioni di tipo NAS di rete. Cambia il tipo di storage nella scheda Destinazione.')];
        }

        const host_ = el('input', { className: 'input', value: draft.networkHost, placeholder: '192.168.1.50' });
        host_.addEventListener('input', () => { draft.networkHost = host_.value; });

        const share = el('input', { className: 'input', value: draft.networkShare, placeholder: 'cctv_archive' });
        share.addEventListener('input', () => { draft.networkShare = share.value; });

        const user = el('input', { className: 'input', value: draft.username, placeholder: 'operatore', autocomplete: 'off' });
        user.addEventListener('input', () => { draft.username = user.value; });

        const password = el('input', { className: 'input', type: 'password', placeholder: pool?.hasPassword ? 'Lascia vuoto per non cambiarla' : 'Password della share', autocomplete: 'new-password' });
        password.addEventListener('input', () => { draft.password = password.value; });

        const smb = selectInput(SMB_VERSIONS, draft.smbVersion);
        smb.addEventListener('change', () => { draft.smbVersion = smb.value; });
        smb.disabled = draft.networkProto === 'nfs';

        const options = el('input', { className: 'input input--mono', value: draft.mountOptions, placeholder: 'noatime,uid=argus,gid=argus' });
        options.addEventListener('input', () => { draft.mountOptions = options.value; });

        const reconnect = numberInput(draft.reconnectSeconds, { min: 5, max: 600, step: 5 });
        reconnect.addEventListener('input', () => { draft.reconnectSeconds = Number(reconnect.value); });

        const mount = el('button', { className: 'btn', type: 'button' }, [icon('network'), el('span', { textContent: 'Monta la share adesso' })]);
        mount.addEventListener('click', async () => {
            mount.disabled = true;
            const result = await api.post('/api/storage/nas/mount', {
                proto: draft.networkProto,
                host: draft.networkHost.trim(),
                share: draft.networkShare.trim(),
                mountpoint: draft.path.trim(),
                username: draft.username.trim(),
                password: draft.password,
                smbVersion: draft.smbVersion,
                mountOptions: draft.mountOptions.trim(),
                reconnectSeconds: draft.reconnectSeconds
            }).catch((error) => ({ failure: error }));
            mount.disabled = false;

            if (result.failure) {
                say('error', `Montaggio non riuscito: ${result.failure.message}`);
                return;
            }
            say('ok', `Share montata su ${result.mountpoint}. Spazio libero: ${result.stats ? formatBytes(result.stats.freeBytes) : 'disponibile'}.`);
        });

        return [
            labelled('Protocollo di rete', 'SMB/CIFS per condivisioni Windows e NAS commerciali, NFS per server Unix', segmented([
                { value: 'smb', label: 'SMB / CIFS', icon: 'network', hint: 'Windows, Synology, QNAP, Samba' },
                { value: 'nfs', label: 'NFS', icon: 'server', hint: 'Condivisioni Unix e Linux' }
            ], draft.networkProto, (value) => {
                draft.networkProto = value;
                render();
            })),
            el('div', { className: 'form-grid' }, [
                labelled('Host o indirizzo IP del NAS', 'Nome DNS o indirizzo del server di rete', host_),
                labelled('Nome della cartella condivisa', 'Percorso della share esportata dal NAS', share),
                labelled('Versione del protocollo SMB', 'Fissa la versione quando il NAS non negozia correttamente', smb),
                labelled('Timeout di riconnessione', 'Secondi di attesa prima di considerare persa la connessione di rete', reconnect),
                labelled('Utente', 'Lascia vuoto per accedere come ospite', user),
                labelled('Password', 'Salvata cifrata con AES-256-GCM nel vault del server', password)
            ]),
            labelled('Opzioni di mount aggiuntive', 'Passate direttamente a mount, separate da virgola', options),
            el('div', { className: 'row row--end' }, [mount])
        ];
    };

    const benchTab = () => {
        const size = selectInput([
            { value: 16, label: '16 MB (rapido)' },
            { value: 32, label: '32 MB (consigliato)' },
            { value: 64, label: '64 MB' },
            { value: 128, label: '128 MB (accurato)' }
        ], 32);

        const run = el('button', { className: 'btn btn--primary', type: 'button' }, [icon('activity'), el('span', { textContent: 'Misura velocita di scrittura' })]);
        run.addEventListener('click', async () => {
            if (draft.path.trim().length === 0) {
                say('warn', 'Seleziona prima una destinazione nella scheda Destinazione.');
                return;
            }
            run.disabled = true;
            run.replaceChildren(icon('refresh'), el('span', { textContent: 'Misurazione in corso…' }));
            const result = await api.post('/api/storage/benchmark', { path: draft.path.trim(), megabytes: Number(size.value) })
                .catch((error) => ({ success: false, error: error.message }));
            benchmark = result;
            render();
        });

        return [
            el('span', { className: 'xrow__hint', textContent: 'Scrive un file temporaneo sulla destinazione, ne misura throughput e latenza, poi lo rimuove.' }),
            el('div', { className: 'row row--between' }, [
                labelled('Volume del test', null, size),
                run
            ]),
            benchmarkReport(benchmark)
        ];
    };

    const bodyFor = () => {
        if (activeTab === 'policy') return policyTab();
        if (activeTab === 'cameras') return camerasTab();
        if (activeTab === 'network') return networkTab();
        if (activeTab === 'bench') return benchTab();
        return targetTab();
    };

    const submit = async () => {
        if (draft.name.trim().length === 0 || draft.path.trim().length === 0) {
            activeTab = 'target';
            render();
            say('warn', 'Nome identificativo e percorso di destinazione sono obbligatori.');
            return;
        }

        busy = true;
        render();

        const payload = {
            name: draft.name.trim(),
            kind: draft.kind,
            path: draft.path.trim(),
            isDefault: draft.isDefault,
            maxBytes: quotaBytes(draft.quotaAmount, draft.quotaUnit, totalForPath()),
            minFreeBytes: Math.max(1, draft.minFreeGb) * 1024 ** 3,
            alarmPercent: draft.alarmPercent,
            retentionPolicy: draft.retentionPolicy,
            retentionDays: draft.retentionDays,
            reconnectSeconds: draft.reconnectSeconds,
            cameraIds: [...selectedCameras]
        };

        if (draft.kind === 'nas') {
            payload.networkProto = draft.networkProto;
            payload.networkHost = draft.networkHost.trim();
            payload.networkShare = draft.networkShare.trim();
            payload.smbVersion = draft.smbVersion;
            payload.mountOptions = draft.mountOptions.trim();
            payload.username = draft.username.trim();
            if (draft.password.length > 0) payload.password = draft.password;
        }

        const result = pool
            ? await api.put(`/api/storage/pools/${pool.id}`, payload).catch((error) => ({ failure: error }))
            : await api.post('/api/storage/pools', payload).catch((error) => ({ failure: error }));

        busy = false;

        if (result.failure) {
            render();
            say('error', `Salvataggio non riuscito: ${result.failure.message}`);
            return;
        }

        close();
        onSaved(result.pool, result.routedCameras ?? []);
    };

    const render = () => {
        bodyHost.replaceChildren(
            tabsBar(TABS, activeTab, (id) => {
                activeTab = id;
                render();
            }),
            message,
            el('div', { className: 'stack' }, bodyFor())
        );

        const saveButton = el('button', {
            className: 'btn btn--primary',
            type: 'button',
            disabled: busy ? 'disabled' : null,
            onclick: submit
        }, [icon('check'), el('span', { textContent: busy ? 'Salvataggio…' : (pool ? 'Salva modifiche' : 'Crea storage pool') })]);

        host.replaceChildren(
            pageHead({
                title: pool ? `Modifica ${pool.name}` : 'Nuovo storage pool',
                hint: 'Destinazione, quote, ritenzione, telecamere instradate, parametri NAS e verifica delle prestazioni',
                back: el('button', {
                    className: 'page-back',
                    type: 'button',
                    onclick: close
                }, [icon('chevronLeft'), el('span', { textContent: 'Torna a Storage & Dischi' })]),
                actions: [saveButton]
            }),
            card({
                title: pool ? pool.name : 'Configurazione della destinazione',
                subtitle: draft.path.trim().length > 0 ? draft.path.trim() : 'Nessuna destinazione selezionata',
                iconName: 'disk',
                tone: 'amber',
                body: [bodyHost],
                footer: [
                    el('span', { className: 'section__hint', textContent: draft.path.trim().length > 0 ? draft.path.trim() : 'Scegli una destinazione nella scheda Destinazione' }),
                    el('div', { className: 'row row--tight' }, [
                        el('button', { className: 'btn', type: 'button', textContent: 'Annulla', onclick: close }),
                        saveButton
                    ])
                ]
            })
        );
    };

    render();
    return host;
}
