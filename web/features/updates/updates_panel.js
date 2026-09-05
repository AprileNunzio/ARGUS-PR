import { el, chip } from '/assets/dom.js';
import { icon } from '/assets/icons.js';
import { metricTile } from '/assets/ui.js';

const PHASE_LABELS = {
    idle: ['Pronto / In attesa', 'ok', 'emerald'],
    'awaiting-approval': ['In attesa di approvazione', 'warn', 'amber'],
    requested: ['Riavvio del servizio in corso…', 'warn', 'blue'],
    pending: ['Fase di test & stabilizzazione', 'warn', 'purple'],
    healthy: ['Release verificata e stabile', 'ok', 'emerald'],
    'rolled-back': ['Ripristino di emergenza eseguito', 'bad', 'red'],
    failed: ['Aggiornamento interrotto per errore', 'bad', 'red']
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
        .slice(0, 10);

    if (lines.length === 0) return null;

    return el('div', { className: 'stack stack--tight' }, [
        el('span', { className: 'xrow__title text-sm text-muted', textContent: 'Novita e modifiche in questa versione:' }),
        el('ul', { className: 'stack stack--tight' }, lines.map((line) => el('li', { className: 'section__hint', textContent: line })))
    ]);
}

export function versionState(status) {
    const check = status.lastCheck;

    if (!check) {
        return {
            tone: 'info',
            headline: 'Verifica non ancora eseguita',
            detail: 'Confronta la versione installata su questa macchina con i server ufficiali GitHub.',
            latestLabel: 'In attesa…',
            available: false
        };
    }

    if (check.updateAvailable) {
        return {
            tone: 'warn',
            headline: `Nuova versione ${check.latest.tag} disponibile!`,
            detail: check.latest.taggedOnly
                ? 'Nuovo tag presente su GitHub, pacchetto pronto per il download.'
                : 'Release ufficiale collaudata e pronta per l installazione.',
            latestLabel: check.latest.tag,
            available: true
        };
    }

    if (check.ahead) {
        return {
            tone: 'info',
            headline: `Versione in sviluppo v${status.currentVersion}`,
            detail: `L ultima pubblicazione su GitHub e ${check.latest.tag}. La tua macchina e piu recente del repository pubblico.`,
            latestLabel: `v${status.currentVersion}`,
            available: false
        };
    }

    return {
        tone: 'ok',
        headline: 'Sistema costantemente aggiornato e protetto',
        detail: `La versione installata v${status.currentVersion} coincide esattamente con l ultima release ufficiale online.`,
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
        return { ...watchdog, label: 'MANUALE', tone: 'idle', hint: 'Installazione gestita manualmente: watchdog passivo.' };
    }

    if (watchdog.quarantined) {
        return {
            ...watchdog,
            label: 'QUARANTENA ATTIVA',
            tone: 'bad',
            hint: `Versioni bloccate dopo un ripristino di emergenza: ${watchdog.quarantineList.join(', ')}`
        };
    }

    if (!watchdog.settled) {
        return {
            ...watchdog,
            label: 'TEST STABILITA',
            tone: 'warn',
            hint: `Finestra di controllo salute in corso (tentativo ${watchdog.attempts}/${watchdog.maxAttempts}).`
        };
    }

    return {
        ...watchdog,
        label: 'ATTIVO E PROTETTO',
        tone: 'ok',
        hint: 'Nessuna anomalia riscontrata. Il ripristino automatico a 90 secondi e armato.'
    };
}

export function statusTiles(status, version, watchdog) {
    const phaseInfo = PHASE_LABELS[status.phase] ?? [String(status.phase).toUpperCase(), 'info', 'blue'];

    return el('div', { className: 'grid grid--stats rise rise-1' }, [
        metricTile({
            label: 'Versione Installata',
            value: `v${status.currentVersion}`,
            hint: status.supported ? 'Server aggiornabile OTA' : 'Installazione locale',
            iconName: 'server',
            tone: 'blue'
        }),
        metricTile({
            label: 'Release Ufficiale Online',
            value: version.latestLabel,
            hint: version.headline,
            iconName: 'download',
            tone: version.tone === 'ok' ? 'emerald' : (version.tone === 'warn' ? 'amber' : 'cyan')
        }),
        metricTile({
            label: 'Stato Operativo Pipeline',
            value: phaseInfo[0],
            hint: watchdog.settled ? 'Nessuna procedura pendente' : `Fase critica (tentativo ${watchdog.attempts}/${watchdog.maxAttempts})`,
            iconName: 'activity',
            tone: phaseInfo[2]
        }),
        metricTile({
            label: 'Watchdog & Ripristino',
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
        return el('div', { className: 'section__hint' }, [
            el('span', { textContent: 'Premi "Verifica nuove versioni" in alto per visualizzare le note e le modifiche dell ultima release.' })
        ]);
    }

    return el('div', { className: 'stack stack--tight' }, [
        el('div', { className: 'row row--between' }, [
            el('strong', { className: 'xrow__title', textContent: latest.name || latest.tag }),
            latest.publishedAt
                ? chip(`Rilasciata il ${new Date(latest.publishedAt).toLocaleDateString('it-IT')}`, 'info')
                : null
        ]),
        check.checkedAt
            ? el('span', { className: 'section__hint', textContent: `Ultima interrogazione a GitHub eseguita il: ${new Date(check.checkedAt).toLocaleString('it-IT')}` })
            : null,
        releaseNotes(latest.notes),
        latest.url ? el('a', {
            className: 'btn btn--sm btn--ghost',
            href: latest.url,
            target: '_blank',
            rel: 'noreferrer noopener'
        }, [icon('globe'), el('span', { textContent: 'Visualizza sorgenti e note complete su GitHub' })]) : null
    ]);
}
