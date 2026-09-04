import { el, chip } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { metricTile } from '/assets/ui.js';

const PHASE_LABELS = {
    idle: ['In attesa di istruzioni', 'info'],
    'awaiting-approval': ['In attesa di conferma per il riavvio', 'warn'],
    requested: ['Aggiornamento richiesto (riavvio in corso)', 'warn'],
    pending: ['In fase di prova e stabilizzazione', 'warn'],
    healthy: ['Sistema aggiornato e stabile', 'ok'],
    'rolled-back': ['Ripristinato alla versione precedente', 'bad'],
    failed: ['Aggiornamento fallito', 'bad']
};

export function phaseBadge(phase) {
    const [label, variant] = PHASE_LABELS[phase] ?? [phase, 'info'];
    return chip(label, variant);
}

export function releaseNotes(text) {
    const lines = String(text ?? '')
        .split('\n')
        .map((line) => line.replace(/^#{1,6}\s*/, '').replace(/^[-*]\s*/, '').replace(/[`*_]/g, '').trim())
        .filter((line) => line.length > 0 && !line.startsWith('```'))
        .slice(0, 12);

    if (lines.length === 0) return null;

    return el('ul', { className: 'stack stack--tight' }, lines.map((line) => el('li', { className: 'section__hint', textContent: line })));
}

export function versionState(status) {
    const check = status.lastCheck;

    if (!check) {
        return {
            tone: 'info',
            headline: 'Verifica non ancora eseguita',
            detail: 'Avvia un controllo per confrontare la versione installata con GitHub.',
            latestLabel: 'Verifica…',
            available: false
        };
    }

    if (check.updateAvailable) {
        return {
            tone: 'warn',
            headline: `Nuova versione ${check.latest.tag} disponibile`,
            detail: check.latest.taggedOnly
                ? 'Tag pubblicato su GitHub, note di rilascio non ancora compilate.'
                : 'Release ufficiale pronta per l installazione.',
            latestLabel: check.latest.tag,
            available: true
        };
    }

    if (check.ahead) {
        return {
            tone: 'info',
            headline: `Versione installata v${status.currentVersion} in anticipo su GitHub`,
            detail: `L ultima pubblicazione remota e ${check.latest.tag}: questa installazione e piu recente del repository.`,
            latestLabel: `v${status.currentVersion}`,
            available: false
        };
    }

    return {
        tone: 'ok',
        headline: 'Sistema aggiornato alla release piu recente',
        detail: `Nessun aggiornamento da applicare: v${status.currentVersion} coincide con l ultima pubblicazione su GitHub.`,
        latestLabel: `v${status.currentVersion}`,
        available: false
    };
}

export function watchdogState(status) {
    const settled = status.phase === 'idle' || status.phase === 'healthy';
    const list = Array.isArray(status.quarantine) ? status.quarantine : [];

    const watchdog = {
        quarantined: list.length > 0,
        quarantineList: list,
        attempts: settled ? 0 : (status.attempts ?? 0),
        maxAttempts: 3,
        settled,
        ...(status.watchdog ?? {})
    };

    if (!Array.isArray(watchdog.quarantineList)) watchdog.quarantineList = list;

    if (!status.supported) {
        return { ...watchdog, label: 'NON DISPONIBILE', tone: 'idle', hint: 'Installazione manuale: nessun ripristino automatico.' };
    }

    if (watchdog.quarantined) {
        return {
            ...watchdog,
            label: 'QUARANTENA',
            tone: 'bad',
            hint: `Versioni bloccate dopo un errore: ${watchdog.quarantineList.join(', ')}`
        };
    }

    if (!watchdog.settled) {
        return {
            ...watchdog,
            label: 'IN PROVA',
            tone: 'warn',
            hint: `Finestra di stabilizzazione in corso, tentativo ${watchdog.attempts}/${watchdog.maxAttempts}.`
        };
    }

    return {
        ...watchdog,
        label: 'ATTIVO',
        tone: 'ok',
        hint: 'Sistema stabile, nessun tentativo in sospeso. Ripristino automatico pronto.'
    };
}

export function statusTiles(status, version, watchdog) {
    return el('div', { className: 'grid grid--stats rise rise-1' }, [
        metricTile({
            label: 'Versione installata',
            value: `v${status.currentVersion}`,
            hint: status.supported ? 'Aggiornamento OTA da Git supportato' : 'Installazione manuale',
            iconName: 'server',
            tone: 'blue'
        }),
        metricTile({
            label: 'Ultima release GitHub',
            value: version.latestLabel,
            hint: version.headline,
            iconName: 'download',
            tone: version.tone === 'ok' ? 'emerald' : (version.tone === 'warn' ? 'amber' : 'cyan')
        }),
        metricTile({
            label: 'Fase attuale',
            value: String(status.phase).toUpperCase(),
            hint: watchdog.settled ? 'Nessuna operazione in corso' : `Tentativo ${watchdog.attempts}/${watchdog.maxAttempts}`,
            iconName: 'activity',
            tone: watchdog.settled ? 'purple' : 'amber'
        }),
        metricTile({
            label: 'Protezione watchdog',
            value: watchdog.label,
            hint: watchdog.hint,
            iconName: 'shield',
            tone: watchdog.tone === 'ok' ? 'emerald' : (watchdog.tone === 'bad' ? 'red' : 'amber')
        })
    ]);
}

export function releaseDetail(check) {
    const latest = check?.latest ?? null;

    if (!latest) {
        return el('div', { className: 'section__hint', textContent: 'Avvia "Verifica Nuove Versioni" per consultare le note di rilascio ufficiali.' });
    }

    return el('div', { className: 'stack stack--tight' }, [
        el('strong', { textContent: latest.name || latest.tag }),
        latest.publishedAt
            ? el('span', { className: 'section__hint', textContent: `Pubblicata il ${new Date(latest.publishedAt).toLocaleString('it-IT')}` })
            : null,
        check.checkedAt
            ? el('span', { className: 'section__hint', textContent: `Ultimo controllo: ${new Date(check.checkedAt).toLocaleString('it-IT')}` })
            : null,
        releaseNotes(latest.notes),
        latest.url ? el('a', {
            className: 'section__hint',
            href: latest.url,
            target: '_blank',
            rel: 'noreferrer noopener'
        }, [icon('download'), el('span', { textContent: 'Apri la pagina di rilascio su GitHub' })]) : null
    ]);
}
