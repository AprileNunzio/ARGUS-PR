import { api, ApiError, connectEvents } from './api.js';
import { renderLogin } from '/features/login/login.js';
import { renderDashboard } from '/features/dashboard/dashboard.js';
import { renderCameras } from '/features/cameras/cameras.js';
import { renderShell, setLinkState, setActiveRoute } from './shell.js';

const ROUTES = {
    dashboard: { label: 'Riepilogo', render: renderDashboard },
    cameras: { label: 'Telecamere', render: renderCameras }
};

const state = {
    session: null,
    route: 'dashboard',
    disconnect: null
};

const root = document.getElementById('app');

function currentRoute() {
    const hash = location.hash.replace('#/', '').trim();
    return ROUTES[hash] ? hash : 'dashboard';
}

async function mountRoute() {
    const name = currentRoute();
    state.route = name;
    setActiveRoute(name);

    const outlet = document.getElementById('outlet');
    if (!outlet) return;

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
        routes: ROUTES,
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

async function start() {
    const session = await api.get('/api/auth/session').catch((error) => {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
    });

    if (!session) {
        await showLogin(null);
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
