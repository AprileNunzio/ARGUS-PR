import { el, chip, formatBytes } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

export const QUOTA_UNITS = Object.freeze([
    { value: 'none', label: 'Nessun limite', factor: 0 },
    { value: 'gb', label: 'GB', factor: 1024 ** 3 },
    { value: 'tb', label: 'TB', factor: 1024 ** 4 },
    { value: 'percent', label: '% del disco', factor: 0 }
]);

export const SMB_VERSIONS = Object.freeze([
    { value: '', label: 'Negoziazione automatica' },
    { value: '3.1.1', label: 'SMB 3.1.1 (consigliato)' },
    { value: '3.0', label: 'SMB 3.0' },
    { value: '2.1', label: 'SMB 2.1' },
    { value: '2.0', label: 'SMB 2.0' },
    { value: '1.0', label: 'SMB 1.0 (legacy, insicuro)' }
]);

export function labelled(label, hint, control) {
    return el('div', { className: 'field' }, [
        el('label', { textContent: label }),
        control,
        hint ? el('span', { className: 'xrow__hint', textContent: hint }) : null
    ]);
}

export function numberInput(value, { min = 0, max = 999999, step = 1, placeholder = '' } = {}) {
    return el('input', {
        type: 'number',
        className: 'input',
        value: String(value),
        min: String(min),
        max: String(max),
        step: String(step),
        placeholder
    });
}

export function selectInput(options, value) {
    const select = el('select', { className: 'select' });
    for (const option of options) {
        const node = el('option', { value: String(option.value), textContent: option.label });
        if (String(option.value) === String(value)) node.selected = true;
        select.append(node);
    }
    return select;
}

export function quotaBytes(amount, unit, totalBytes) {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;

    if (unit === 'percent') {
        if (!Number.isFinite(totalBytes) || totalBytes <= 0) return 0;
        return Math.round((Math.min(parsed, 100) / 100) * totalBytes);
    }

    const definition = QUOTA_UNITS.find((entry) => entry.value === unit);
    if (!definition || definition.factor === 0) return 0;
    return Math.round(parsed * definition.factor);
}

function targetCard({ title, subtitle, badgeText, badgeTone, path, selected, onPick }) {
    return el('button', {
        type: 'button',
        className: selected ? 'disk-pick disk-pick--on' : 'disk-pick',
        title: path,
        onclick: () => onPick(path)
    }, [
        el('span', { className: 'disk-pick__icon' }, [icon('disk', { className: 'icon--lg' })]),
        el('span', { className: 'disk-pick__body' }, [
            el('span', { className: 'disk-pick__title', textContent: title }),
            el('span', { className: 'disk-pick__path', textContent: path }),
            el('span', { className: 'disk-pick__meta', textContent: subtitle })
        ]),
        chip(badgeText, badgeTone)
    ]);
}

export function targetPicker({ detected, selectedPath, onPick }) {
    const entries = [];

    for (const disk of detected.disks ?? []) {
        for (const partition of disk.partitions ?? []) {
            if (!partition.mountpoint) continue;
            entries.push({
                title: `${partition.name}${partition.fstype ? ` · ${partition.fstype}` : ''}`,
                subtitle: `${disk.model ?? disk.name} · ${formatBytes(disk.sizeBytes)}`,
                path: partition.mountpoint,
                free: partition.stats?.freeBytes ?? null
            });
        }
    }

    for (const mount of detected.mounts ?? []) {
        if (entries.some((entry) => entry.path === mount.mountpoint)) continue;
        entries.push({
            title: mount.label ?? mount.device,
            subtitle: `${mount.fstype}${mount.isNetwork ? ' · rete' : ''}`,
            path: mount.mountpoint,
            free: mount.stats?.freeBytes ?? null
        });
    }

    if (entries.length === 0) {
        return el('div', { className: 'empty' }, [
            icon('disk', { className: 'icon--xl' }),
            el('p', { textContent: 'Nessuna partizione montata rilevata: inserisci il percorso manualmente.' })
        ]);
    }

    return el('div', { className: 'disk-picks' }, entries.map((entry) => targetCard({
        title: entry.title,
        subtitle: entry.subtitle,
        badgeText: entry.free === null ? 'n/d' : `${formatBytes(entry.free)} liberi`,
        badgeTone: entry.free === null ? 'info' : 'ok',
        path: entry.path,
        selected: selectedPath === entry.path,
        onPick
    })));
}

export function cameraPicker({ cameras, selected, onToggle }) {
    if (cameras.length === 0) {
        return el('div', { className: 'empty' }, [
            icon('camera', { className: 'icon--xl' }),
            el('p', { textContent: 'Nessuna telecamera registrata da instradare.' })
        ]);
    }

    return el('div', { className: 'cam-picks' }, cameras.map((camera) => {
        const checkbox = el('input', { type: 'checkbox', checked: selected.has(camera.id) });
        checkbox.addEventListener('change', () => onToggle(camera.id, checkbox.checked));

        return el('label', { className: selected.has(camera.id) ? 'cam-pick cam-pick--on' : 'cam-pick' }, [
            checkbox,
            el('span', { className: 'cam-pick__icon' }, [icon('camera')]),
            el('span', { className: 'cam-pick__body' }, [
                el('span', { className: 'cam-pick__name', textContent: camera.name }),
                el('span', { className: 'cam-pick__meta', textContent: camera.enabled ? 'Canale attivo' : 'Canale disattivato' })
            ])
        ]);
    }));
}

export function benchmarkReport(result) {
    if (!result) return null;

    if (!result.success) {
        return el('div', { className: 'notice notice--error', textContent: `Benchmark non riuscito: ${result.error}` });
    }

    const rating = result.writeMbPerSecond >= 40 ? 'ok' : (result.writeMbPerSecond >= 12 ? 'warn' : 'bad');
    const verdict = rating === 'ok'
        ? 'Velocita adeguata alla registrazione multi-canale continua.'
        : (rating === 'warn'
            ? 'Velocita sufficiente per pochi canali: valuta un disco piu veloce per configurazioni dense.'
            : 'Velocita bassa: questa destinazione rischia di perdere segmenti con piu telecamere.');

    return el('div', { className: 'bench' }, [
        el('div', { className: 'bench__grid' }, [
            el('div', { className: 'bench__item' }, [
                el('span', { className: 'bench__value', textContent: `${result.writeMbPerSecond} MB/s` }),
                el('span', { className: 'bench__label', textContent: 'Scrittura sequenziale' })
            ]),
            el('div', { className: 'bench__item' }, [
                el('span', { className: 'bench__value', textContent: `${result.readMbPerSecond} MB/s` }),
                el('span', { className: 'bench__label', textContent: 'Rilettura' })
            ]),
            el('div', { className: 'bench__item' }, [
                el('span', { className: 'bench__value', textContent: `${result.openLatencyMs} ms` }),
                el('span', { className: 'bench__label', textContent: 'Latenza di apertura' })
            ]),
            el('div', { className: 'bench__item' }, [
                el('span', { className: 'bench__value', textContent: `${result.megabytes} MB` }),
                el('span', { className: 'bench__label', textContent: 'Volume del test' })
            ])
        ]),
        el('div', { className: `notice notice--${rating === 'ok' ? 'ok' : (rating === 'warn' ? 'warn' : 'error')}`, textContent: verdict })
    ]);
}
