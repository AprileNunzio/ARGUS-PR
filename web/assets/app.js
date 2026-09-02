import { api, ApiError, connectEvents } from './api.js';
import { renderLogin } from '/features/login/login.js';
import { renderSetup } from '/features/setup/setup.js';
import { renderChangePassword } from '/features/account/change_password.js';
import { renderDashboard } from '/features/dashboard/dashboard.js';
import { renderCameras } from '/features/cameras/cameras.js';
import { renderLive } from '/features/live/live.js';
import { renderArchive } from '/features/archive/archive.js';
import { renderSystem } from '/features/system/system.js';
import { renderDetectionsView } from '/features/detections/detections_view.js';
import { renderAccessView } from '/features/access/access_view.js';
import { renderPeopleView } from '/features/people/people_view.js';
import { renderShell, setLinkState, setActiveRoute } from './shell.js';

const ROUTES = {
    dashboard: { label: 'Riepilogo', icon: 'gauge', render: renderDashboard },
    live: { label: 'Diretta', icon: 'play', render: renderLive },
    archive: { label: 'Archivio', icon: 'archive', render: renderArchive },
    cameras: { label: 'Telecamere', icon: 'camera', render: renderCameras },
    detections: { label: 'Visione AI', icon: 'eye', render: renderDetectionsView },
    access: { label: 'Targhe & Accessi', icon: 'shield', render: renderAccessView },
    people: { label: 'Persone', icon: 'users', render: renderPeopleView },
    system: { label: 'Sistema', icon: 'settings', render: renderSystem, permission: 'system.manage' }
};


const state = {
    session: null,
    route: 'dashboard',
    disconnect: null
};

const root = document.getElementById('app');


function visibleRoutes() {
    const granted = state.session?.permissions ?? [];
    return Object.fromEntries(
        Object.entries(ROUTES).filter(([, route]) => !route.permission || granted.includes(route.permission))
    );
}

function currentRoute() {
    const hash = location.hash.replace('#/', '').trim();
    return visibleRoutes()[hash] ? hash : 'dashboard';
}

async function mountRoute() {
    const name = currentRoute();
    state.route = name;
    setActiveRoute(name);

    const outlet = document.getElementById('outlet');
    if (!outlet) return;

    outlet.firstElementChild?.dispatchEvent(new CustomEvent("argus:teardown"));
    outlet.replaceChildren();
    const view = await ROUTES[name].render({ session: state.session, api });
    outlet.append(view);
}

function startEventStream() {
    state.disconnect?.();
    state.disconnect = connectEvents(
        (event) => window.dispatchEvent(new CustomEvent('argus:event', { detail: event })),
        (status) => setLinkState(status)
    );
}

async function showApp() {
    root.replaceChildren(renderShell({
        session: state.session,
        routes: visibleRoutes(),
        onNavigate: (name) => { location.hash = `#/${name}`; },
        onLogout: async () => {
            await api.post('/api/auth/logout');
            state.disconnect?.();
            state.session = null;
            await start();
        }
    }));

    startEventStream();
    await mountRoute();
}

async function showLogin(message) {
    state.disconnect?.();
    root.replaceChildren(renderLogin({
        message,
        onSuccess: async () => { await start(); }
    }));
}

async function showSetup(status) {
    state.disconnect?.();
    root.replaceChildren(renderSetup({
        status,
        onComplete: async () => { await start(); }
    }));
}

async function showPasswordChange(session) {
    state.disconnect?.();
    root.replaceChildren(renderChangePassword({
        session,
        onComplete: async () => { await start(); }
    }));
}

async function start() {
    const setup = await api.get('/api/setup/status');

    if (setup.required) {
        await showSetup(setup);
        return;
    }

    const session = await api.get('/api/auth/session').catch((error) => {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
    });

    if (!session) {
        await showLogin(null);
        return;
    }

    if (session.mustChangePassword) {
        state.session = session;
        await showPasswordChange(session);
        return;
    }

    state.session = session;
    await showApp();
}

window.addEventListener('hashchange', () => {
    if (state.session) mountRoute();
});

window.addEventListener('error', (event) => {
    console.error('[argus] uncaught', event.error ?? event.message);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('[argus] unhandled rejection', event.reason);
});

start().catch((error) => {
    root.replaceChildren(Object.assign(document.createElement('div'), {
        className: 'notice notice--error fatal',
        textContent: `Impossibile avviare l'interfaccia: ${error.message}`
    }));
});
