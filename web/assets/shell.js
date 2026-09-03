import { el } from './dom.js';
import { icon } from './icons.js';
import { findRouteInfo } from '/features/dashboard/hub_registry.js';

let linkDot = null;
let linkLabel = null;
let breadcrumbNode = null;

export function setLinkState(status) {
    if (!linkDot || !linkLabel) return;
    const online = status === 'online';
    linkDot.className = online ? 'dot dot--live' : 'dot dot--off';
    linkLabel.textContent = online ? 'Live' : 'Offline';
}

export function setActiveRoute(name, routes) {
    if (!breadcrumbNode) return;
    breadcrumbNode.replaceChildren();

    if (name === 'dashboard') {
        breadcrumbNode.append(
            el('span', { className: 'breadcrumb__current' }, [
                icon('grid'),
                el('span', { textContent: 'Cockpit Hub' })
            ])
        );
        return;
    }

    const routeDef = routes?.[name];
    const info = findRouteInfo(name);

    breadcrumbNode.append(
        el('button', {
            type: 'button',
            className: 'breadcrumb__link',
            title: 'Torna all Hub centrale',
            onclick: () => { location.hash = '#/dashboard'; }
        }, [
            icon('grid'),
            el('span', { textContent: 'Hub' })
        ]),
        el('span', { className: 'breadcrumb__sep', textContent: '›' })
    );

    if (info?.area) {
        breadcrumbNode.append(
            el('span', { className: 'breadcrumb__area', textContent: info.area.title }),
            el('span', { className: 'breadcrumb__sep', textContent: '›' })
        );
    }

    breadcrumbNode.append(
        el('span', { className: 'breadcrumb__current' }, [
            icon(routeDef?.icon ?? 'apps'),
            el('span', { textContent: routeDef?.label ?? name })
        ])
    );
}

export function renderShell({ session, routes, onNavigate, onLogout }) {
    linkDot = el('span', { className: 'dot' });
    linkLabel = el('span', { textContent: '…' });
    breadcrumbNode = el('div', { className: 'breadcrumb' });

    const hubBtn = el('button', {
        type: 'button',
        className: 'hub-nav-btn',
        title: 'Centro di Controllo (Hub)',
        onclick: () => onNavigate('dashboard')
    }, [
        icon('grid'),
        el('span', { textContent: 'Hub' })
    ]);

    const header = el('header', { className: 'topbar' }, [
        el('div', { className: 'brand', onclick: () => onNavigate('dashboard') }, [
            el('span', { className: 'brand__mark' }, [icon('shield')]),
            el('span', { className: 'brand__text' }, [
                el('span', { className: 'brand__name', textContent: 'ARGUS-PR' }),
                el('span', { className: 'brand__role', textContent: 'by NunzioTech' })
            ])
        ]),
        breadcrumbNode,
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

    const tabs = el('nav', { className: 'tabbar' }, [
        el('button', {
            className: 'tabbar__item',
            type: 'button',
            onclick: () => onNavigate('dashboard')
        }, [icon('grid', { className: 'icon--lg' }), el('span', { textContent: 'Hub' })]),
        el('button', {
            className: 'tabbar__item',
            type: 'button',
            onclick: () => onNavigate('live')
        }, [icon('play', { className: 'icon--lg' }), el('span', { textContent: 'Diretta' })]),
        el('button', {
            className: 'tabbar__item',
            type: 'button',
            onclick: () => onNavigate('archive')
        }, [icon('archive', { className: 'icon--lg' }), el('span', { textContent: 'Archivio' })]),
        el('button', {
            className: 'tabbar__item',
            type: 'button',
            onclick: () => onNavigate('settings')
        }, [icon('settings', { className: 'icon--lg' }), el('span', { textContent: 'Impostazioni' })])
    ]);

    const main = el('main', { className: 'shell__main' }, [el('div', { id: 'outlet' })]);

    const fragment = document.createDocumentFragment();
    fragment.append(el('div', { className: 'shell' }, [header, main, tabs]));
    return fragment;
}
