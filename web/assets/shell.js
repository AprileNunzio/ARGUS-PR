import { el } from './dom.js';
import { icon } from './icons.js';

let linkDot = null;
let linkLabel = null;
let navButtons = new Map();

export function setLinkState(status) {
    if (!linkDot || !linkLabel) return;
    const online = status === 'online';
    linkDot.className = online ? 'dot dot--live' : 'dot dot--off';
    linkLabel.textContent = online ? 'Live' : 'Offline';
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

function navButton(name, route, onNavigate) {
    return el('button', {
        className: 'nav__item',
        type: 'button',
        title: route.label,
        onclick: () => onNavigate(name)
    }, [icon(route.icon), el('span', { className: 'nav__label', textContent: route.label })]);
}

export function renderShell({ session, routes, onNavigate, onLogout }) {
    navButtons = new Map();

    const nav = el('nav', { className: 'nav' });
    const tabs = el('nav', { className: 'tabbar' });

    for (const [name, route] of Object.entries(routes)) {
        const primary = navButton(name, route, onNavigate);
        navButtons.set(name, primary);
        nav.append(primary);

        tabs.append(el('button', {
            className: 'tabbar__item',
            type: 'button',
            onclick: () => onNavigate(name)
        }, [icon(route.icon, { className: 'icon--lg' }), el('span', { textContent: route.label })]));
    }

    linkDot = el('span', { className: 'dot' });
    linkLabel = el('span', { textContent: '…' });

    const header = el('header', { className: 'topbar' }, [
        el('div', { className: 'brand' }, [
            el('span', { className: 'brand__mark' }, [icon('shield')]),
            el('span', { className: 'brand__text' }, [
                el('span', { className: 'brand__name', textContent: 'ARGUS-PR' }),
                el('span', { className: 'brand__role', textContent: 'by NunzioTech' })
            ])
        ]),
        nav,
        el('span', { className: 'spacer' }),
        el('span', { className: 'link-status' }, [linkDot, linkLabel]),
        el('button', {
            className: 'btn btn--sm user-chip',
            type: 'button',
            title: `Esci da ${session.username}`,
            onclick: onLogout
        }, [
            el('span', { className: 'user-chip__avatar', textContent: session.username.slice(0, 1).toUpperCase() }),
            el('span', { className: 'user-chip__name', textContent: session.username }),
            icon('logout')
        ])
    ]);

    const main = el('main', { className: 'shell__main' }, [el('div', { id: 'outlet' })]);

    const fragment = document.createDocumentFragment();
    fragment.append(el('div', { className: 'shell' }, [header, main, tabs]));
    return fragment;
}
