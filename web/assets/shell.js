import { el, brandMark } from './dom.js';

let linkDot = null;
let linkLabel = null;
let navButtons = new Map();

export function setLinkState(status) {
    if (!linkDot || !linkLabel) return;
    linkDot.className = status === 'online' ? 'dot dot--online' : 'dot dot--offline';
    linkLabel.textContent = status === 'online' ? 'Eventi attivi' : 'Riconnessione…';
}

export function setActiveRoute(name) {
    for (const [route, button] of navButtons) {
        if (route === name) {
            button.setAttribute('aria-current', 'page');
            continue;
        }
        button.removeAttribute('aria-current');
    }
}

export function renderShell({ session, routes, onNavigate, onLogout }) {
    navButtons = new Map();

    const nav = el('nav', { className: 'nav' });
    for (const [name, route] of Object.entries(routes)) {
        const button = el('button', {
            className: 'nav__item',
            type: 'button',
            textContent: route.label,
            onclick: () => onNavigate(name)
        });
        navButtons.set(name, button);
        nav.append(button);
    }

    linkDot = el('span', { className: 'dot' });
    linkLabel = el('span', { textContent: 'Connessione…' });

    const topbar = el('header', { className: 'topbar' }, [
        el('div', { className: 'brand' }, [
            brandMark(),
            el('span', {}, [
                el('span', { textContent: 'ARGUS-PR' }),
                el('br'),
                el('small', { textContent: session.role.toUpperCase() })
            ])
        ]),
        nav,
        el('span', { className: 'spacer' }),
        el('span', { className: 'link-status' }, [linkDot, linkLabel]),
        el('button', {
            className: 'btn btn--sm',
            type: 'button',
            textContent: session.username,
            title: 'Esci',
            onclick: onLogout
        })
    ]);

    const main = el('main', {}, [el('div', { id: 'outlet' })]);

    const banner = session.mustChangePassword
        ? el('div', {
            className: 'notice notice--warn shell-banner',
            textContent: 'La password iniziale è ancora attiva. Cambiala prima di mettere il sistema in servizio.'
        })
        : null;

    const fragment = document.createDocumentFragment();
    fragment.append(topbar);
    if (banner) fragment.append(banner);
    fragment.append(main);

    return fragment;
}
