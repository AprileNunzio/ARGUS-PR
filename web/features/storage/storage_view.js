import { el, chip, notice, empty, pageHead, formatBytes } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { card, metricTile, optionRow } from '/assets/ui.js';
import { openPoolForm } from './pool_form.js';

const POLICY_LABELS = {
    fifo: 'FIFO: elimina i piu vecchi',
    block: 'Blocca acquisizione'
};

function usageMeter(percent) {
    const clamped = Math.min(100, Math.max(0, percent));
    const bar = el('div', { className: 'meter__fill' });
    bar.style.setProperty('width', `${clamped}%`);
    bar.style.setProperty('background', clamped > 90 ? 'var(--bad)' : (clamped > 75 ? 'var(--warn)' : 'var(--ok)'));
    return el('div', { className: 'meter' }, [bar]);
}

function poolCard(pool, { onEdit, onDelete }) {
    const stats = pool.stats;
    const percent = stats?.usedPercent ?? 0;
    const alarm = pool.alarm ?? { triggered: false };

    return card({
        title: pool.name,
        subtitle: pool.path,
        iconName: pool.kind === 'nas' ? 'network' : 'disk',
        tone: alarm.triggered ? 'red' : (pool.isDefault ? 'emerald' : 'blue'),
        badge: el('div', { className: 'row row--tight' }, [
            pool.isDefault ? chip('Predefinito', 'info') : null,
            chip(pool.status === 'online' ? 'Online' : 'Offline', pool.status === 'online' ? 'ok' : 'bad'),
            alarm.triggered ? chip('Spazio critico', 'bad') : null
        ]),
        actions: [
            el('button', { className: 'btn btn--sm', type: 'button', onclick: () => onEdit(pool) }, [icon('edit'), el('span', { textContent: 'Modifica' })]),
            pool.isDefault ? null : el('button', { className: 'btn btn--sm btn--danger', type: 'button', onclick: () => onDelete(pool) }, [icon('trash'), el('span', { textContent: 'Elimina' })])
        ].filter(Boolean),
        body: [
            el('div', { className: 'stack stack--tight' }, [
                el('div', { className: 'row row--between' }, [
                    el('span', { className: 'section__hint', textContent: 'Utilizzo della destinazione' }),
                    el('span', { className: 'section__hint mono', textContent: stats ? `${percent}% · ${formatBytes(stats.usedBytes)} di ${formatBytes(stats.totalBytes)}` : 'non misurabile' })
                ]),
                usageMeter(percent)
            ]),
            el('div', { className: 'spec-grid' }, [
                el('div', { className: 'spec' }, [el('span', { className: 'spec__k', textContent: 'Tipo' }), el('span', { className: 'spec__v', textContent: pool.kind === 'nas' ? `NAS ${String(pool.networkProto ?? '').toUpperCase()}` : 'Locale' })]),
                el('div', { className: 'spec' }, [el('span', { className: 'spec__k', textContent: 'Spazio libero' }), el('span', { className: 'spec__v', textContent: stats ? formatBytes(stats.freeBytes) : '--' })]),
                el('div', { className: 'spec' }, [el('span', { className: 'spec__k', textContent: 'Quota assegnata' }), el('span', { className: 'spec__v', textContent: pool.maxBytes > 0 ? formatBytes(pool.maxBytes) : 'illimitata' })]),
                el('div', { className: 'spec' }, [el('span', { className: 'spec__k', textContent: 'Riserva minima' }), el('span', { className: 'spec__v', textContent: formatBytes(pool.minFreeBytes) })]),
                el('div', { className: 'spec' }, [el('span', { className: 'spec__k', textContent: 'Politica overflow' }), el('span', { className: 'spec__v', textContent: POLICY_LABELS[pool.retentionPolicy] ?? pool.retentionPolicy })]),
                el('div', { className: 'spec' }, [el('span', { className: 'spec__k', textContent: 'Ritenzione' }), el('span', { className: 'spec__v', textContent: `${pool.retentionDays} giorni` })]),
                el('div', { className: 'spec' }, [el('span', { className: 'spec__k', textContent: 'Soglia di allarme' }), el('span', { className: 'spec__v', textContent: `${pool.alarmPercent}% libero` })]),
                pool.kind === 'nas'
                    ? el('div', { className: 'spec' }, [el('span', { className: 'spec__k', textContent: 'Share di rete' }), el('span', { className: 'spec__v truncate', textContent: `${pool.networkHost ?? '--'}/${pool.networkShare ?? '--'}${pool.smbVersion ? ` (SMB ${pool.smbVersion})` : ''}` })])
                    : null
            ].filter(Boolean)),
            el('div', { className: 'stack stack--tight' }, [
                el('span', { className: 'section__hint', textContent: 'Telecamere instradate su questa destinazione' }),
                el('div', { className: 'row row--tight row--wrap' }, (pool.assignedCameras ?? []).length > 0
                    ? pool.assignedCameras.map((camera) => chip(camera.name, 'info'))
                    : [el('span', { className: 'section__hint muted', textContent: 'Nessun canale assegnato' })])
            ]),
            alarm.triggered
                ? notice('error', alarm.reason === 'quota'
                    ? 'Quota assegnata raggiunta: la politica di overflow e attiva.'
                    : `Spazio libero al ${alarm.freePercent}%, sotto la soglia di allarme del ${alarm.threshold}%.`)
                : null
        ]
    });
}

function diskCard(disk) {
    const partitions = (disk.partitions ?? []).map((partition) => el('div', { className: 'spec' }, [
        el('span', { className: 'spec__k', textContent: `${partition.name}${partition.fstype ? ` · ${partition.fstype}` : ''}` }),
        el('span', {
            className: 'spec__v truncate',
            textContent: partition.mountpoint
                ? `${partition.mountpoint} — ${partition.stats ? `${formatBytes(partition.stats.freeBytes)} liberi su ${formatBytes(partition.stats.totalBytes)}` : 'montata'}`
                : 'non montata'
        })
    ]));

    return card({
        title: disk.name + (disk.model ? ` · ${disk.model}` : ''),
        subtitle: disk.serial ? `Seriale ${disk.serial}` : 'Dispositivo a blocchi rilevato dal kernel',
        iconName: 'disk',
        tone: 'cyan',
        badge: chip(formatBytes(disk.sizeBytes), 'info'),
        body: [
            partitions.length > 0
                ? el('div', { className: 'spec-grid' }, partitions)
                : el('span', { className: 'section__hint muted', textContent: 'Nessuna partizione rilevata su questo disco.' })
        ]
    });
}

function raidCard(array) {
    return card({
        title: `Array RAID ${array.name} (${String(array.level).toUpperCase()})`,
        subtitle: array.detail || 'Array software Linux gestito da mdadm',
        iconName: 'shield',
        tone: array.isHealthy ? 'emerald' : 'red',
        badge: chip(array.isHealthy ? 'Stato ottimale' : 'Degradato', array.isHealthy ? 'ok' : 'bad'),
        body: [
            optionRow({
                title: 'Dischi membri',
                hint: 'Dispositivi che compongono l array',
                iconName: 'disk',
                control: el('div', { className: 'row row--tight row--wrap' }, array.devices.map((device) => chip(device, 'info')))
            }),
            optionRow({
                title: 'Stato riportato da mdstat',
                hint: 'Valore letto direttamente da /proc/mdstat',
                iconName: 'activity',
                control: chip(array.state, array.isHealthy ? 'ok' : 'warn')
            })
        ]
    });
}

export async function renderStorageView({ api }) {
    const root = el('div', { className: 'view storage-view' });
    const feedback = el('div', {});
    const modalHost = el('div', {});

    let data = await api.get('/api/storage/overview').catch((error) => ({ failure: error }));
    let cameras = await api.get('/api/cameras').then((payload) => payload.cameras ?? []).catch(() => []);

    const refresh = async () => {
        data = await api.get('/api/storage/overview').catch((error) => ({ failure: error }));
        cameras = await api.get('/api/cameras').then((payload) => payload.cameras ?? []).catch(() => cameras);
        render();
    };

    const openForm = (pool) => openPoolForm({
        api,
        host: modalHost,
        detected: data.detected ?? { disks: [], mounts: [] },
        cameras,
        pool,
        onSaved: (saved, routed) => {
            feedback.replaceChildren(notice('ok', routed.length > 0
                ? `Storage pool "${saved.name}" salvato e ${routed.length} telecamere instradate.`
                : `Storage pool "${saved.name}" salvato.`));
            refresh();
        }
    });

    const removePool = async (pool) => {
        const result = await api.remove(`/api/storage/pools/${pool.id}`).catch((error) => ({ failure: error }));
        feedback.replaceChildren(result.failure
            ? notice('error', `Eliminazione non riuscita: ${result.failure.message}`)
            : notice('ok', `Storage pool "${pool.name}" eliminato. Le telecamere tornano alla destinazione predefinita.`));
        await refresh();
    };

    const render = () => {
        if (data.failure) {
            root.replaceChildren(
                pageHead({ title: 'Storage & Archiviazione', hint: 'Memorie fisiche, partizioni, RAID e destinazioni NAS' }),
                notice('error', `Impossibile caricare la telemetria storage: ${data.failure.message}`)
            );
            return;
        }

        const pools = data.pools ?? [];
        const disks = data.detected?.disks ?? [];
        const raid = data.detected?.raid ?? [];
        const alarms = pools.filter((pool) => pool.alarm?.triggered).length;

        root.replaceChildren(
            pageHead({
                title: 'Storage & Archiviazione Registrazioni',
                hint: 'Configurazione multi-disco, volumi RAID, quote, politiche di ritenzione e destinazioni NAS con routing per telecamera',
                actions: [
                    el('button', { className: 'btn', type: 'button', onclick: refresh }, [icon('refresh'), el('span', { textContent: 'Aggiorna' })]),
                    el('button', { className: 'btn btn--primary', type: 'button', onclick: () => openForm(null) }, [icon('plus'), el('span', { textContent: 'Aggiungi storage pool' })])
                ]
            }),
            feedback,
            modalHost,
            el('div', { className: 'grid grid--stats rise' }, [
                metricTile({ label: 'Destinazioni configurate', value: String(pools.length), iconName: 'disk', tone: 'blue' }),
                metricTile({ label: 'Dischi fisici rilevati', value: String(disks.length), iconName: 'server', tone: 'cyan' }),
                metricTile({ label: 'Array RAID', value: String(raid.length), hint: raid.length > 0 ? 'Array software Linux' : 'Nessun array rilevato', iconName: 'shield', tone: 'purple' }),
                metricTile({ label: 'Allarmi spazio', value: String(alarms), hint: alarms > 0 ? 'Destinazioni sotto soglia' : 'Tutte le destinazioni in salute', iconName: 'warning', tone: alarms > 0 ? 'red' : 'emerald' })
            ]),
            el('section', { className: 'xstack' }, [
                el('h2', { className: 'section__title', textContent: 'Destinazioni di registrazione attive' }),
                pools.length > 0
                    ? el('div', { className: 'xgrid xgrid--2' }, pools.map((pool) => poolCard(pool, { onEdit: openForm, onDelete: removePool })))
                    : empty('Nessuna destinazione dedicata configurata: le registrazioni usano il percorso standard di sistema.')
            ]),
            raid.length > 0
                ? el('section', { className: 'xstack' }, [
                    el('h2', { className: 'section__title', textContent: 'Volumi e array RAID rilevati' }),
                    el('div', { className: 'xgrid xgrid--2' }, raid.map(raidCard))
                ])
                : null,
            el('section', { className: 'xstack' }, [
                el('h2', { className: 'section__title', textContent: 'Dischi fisici e partizioni del server' }),
                disks.length > 0
                    ? el('div', { className: 'xgrid xgrid--2' }, disks.map(diskCard))
                    : empty('Nessun disco fisico rilevato su questa piattaforma.')
            ])
        );
    };

    render();
    return root;
}
