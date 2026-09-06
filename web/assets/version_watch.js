import { el } from './dom.js';
import { icon } from './icons.js';

const CHECK_INTERVAL_MS = 45000;

export function startVersionWatch(api) {
    let known = null;
    let notified = false;

    const banner = el('div', { className: 'version-banner', hidden: 'hidden' }, [
        el('span', { className: 'version-banner__icon' }, [icon('download')]),
        el('div', { className: 'version-banner__text' }, [
            el('strong', { className: 'version-banner__title', textContent: 'Nuova versione installata' }),
            el('span', { className: 'version-banner__detail' })
        ]),
        el('button', {
            className: 'btn btn--sm btn--primary',
            type: 'button',
            onclick: () => location.reload()
        }, [icon('refresh'), el('span', { textContent: 'Ricarica adesso' })])
    ]);

    document.body.append(banner);

    const check = async () => {
        const health = await api.get('/api/system/health').catch(() => null);
        if (!health?.version) return;

        if (known === null) {
            known = health.version;
            return;
        }

        if (health.version === known || notified) return;

        notified = true;
        banner.querySelector('.version-banner__detail').textContent =
            `Il server e passato dalla v${known} alla v${health.version}. Ricarica per usare la nuova interfaccia.`;
        banner.hidden = false;
    };

    check();
    const timer = setInterval(check, CHECK_INTERVAL_MS);

    return () => {
        clearInterval(timer);
        banner.remove();
    };
}
