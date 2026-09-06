import { el, chip } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

const ROLE_CHIPS = Object.freeze({
    dipendente: { label: 'Dipendente', variant: 'ok' },
    responsabile: { label: 'Responsabile', variant: 'info' },
    visitatore: { label: 'Visitatore', variant: 'warn' },
    fornitore: { label: 'Fornitore', variant: 'warn' },
    speciale: { label: 'VIP / Speciale', variant: 'violet' }
});

export function roleChipFor(role) {
    return ROLE_CHIPS[role] ?? { label: role ?? 'sconosciuto', variant: 'info' };
}

export function createFaceLogCard({ log, badge = null, actions = [] }) {
    const dateStr = new Date(log.createdAt).toLocaleString();
    const confPct = `${Math.round((log.confidence ?? 0) * 100)}%`;

    const image = log.snapshotPath
        ? el('img', { className: 'face-card__img', src: log.snapshotPath, alt: '' })
        : el('div', { className: 'face-card__img face-card__img--empty' }, [icon('eye')]);

    const flags = el('div', { className: 'face-card__overlay' }, [
        log.isVerified ? chip('OK', 'ok') : null,
        log.pose3d?.pose ? chip(String(log.pose3d.pose).toUpperCase(), 'info') : null,
        log.hasEmbedding ? chip('128-D', 'violet') : null
    ]);

    const liveActions = actions.filter(Boolean);

    return el('article', { className: 'face-card' }, [
        el('div', { className: 'face-card__img-wrapper' }, [
            image,
            flags,
            el('div', { className: 'face-card__confidence' }, [el('span', { textContent: `MATCH ${confPct}` })])
        ]),
        el('div', { className: 'face-card__body' }, [
            el('div', { className: 'stack stack--tight' }, [
                badge,
                el('div', { className: 'section__hint mono face-card__details' }, [
                    el('div', { textContent: dateStr }),
                    el('div', { textContent: `Cam: ${log.cameraName ?? log.cameraId}` }),
                    el('div', { textContent: `ID: ${log.id.split('-')[0].toUpperCase()}` })
                ])
            ]),
            liveActions.length > 0 ? el('div', { className: 'stack stack--tight' }, liveActions) : null
        ])
    ]);
}
