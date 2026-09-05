import { api, ApiError, connectEvents } from './api.js';
import { renderLogin } from '/features/login/login.js';
import { renderRecoveryRequest, renderRecoveryComplete } from '/features/login/recovery.js';
import { renderSetup } from '/features/setup/setup.js';
import { renderChangePassword } from '/features/account/change_password.js';
import { renderMfaEnrollment } from '/features/account/mfa_enrollment.js';
import { renderDashboard } from '/features/dashboard/dashboard.js';
import { renderCameras } from '/features/cameras/cameras.js';
import { renderLive } from '/features/live/live.js';
import { renderArchive } from '/features/archive/archive.js';
import { renderSystem } from '/features/system/system.js';
import { renderSettings } from '/features/settings/settings.js';
import { renderStorageView } from '/features/storage/storage_view.js';
import { renderDetectionsView } from '/features/detections/detections_view.js';
import { renderAccessView } from '/features/access/access_view.js';
import { renderPeopleView } from '/features/people/people_view.js';
import { renderAutomation } from '/features/automation/automation.js';
import { renderUpdatesView } from '/features/updates/updates_view.js';
import { renderWallSettings } from '/features/wall/wall_settings.js';
import { renderMaintenance } from '/features/system/maintenance_view.js';
import { renderDateTime } from '/features/system/datetime_view.js';
import { renderAudioLibrary } from '/features/system/audio_view.js';
import { renderUsers } from '/features/system/users_view.js';
import { renderShell, setLinkState, setActiveRoute } from './shell.js';
import { parseLocation, go } from './router.js';
import { startVersionWatch } from './version_watch.js';

const ROUTES = {
    dashboard: { label: 'Riepilogo', icon: 'gauge', render: renderDashboard },
    live: { label: 'Diretta', icon: 'play', render: renderLive },
    'wall-settings': { label: 'Regia Muro', icon: 'crop', render: renderWallSettings, permission: 'system.manage' },
    archive: { label: 'Archivio', icon: 'archive', render: renderArchive },
    cameras: { label: 'Telecamere', icon: 'camera', render: renderCameras, permission: 'camera.manage' },
    detections: { label: 'Visione AI', icon: 'eye', render: renderDetectionsView },
    access: { label: 'Targhe & Accessi', icon: 'shield', render: renderAccessView },
    people: { label: 'Persone', icon: 'users', render: renderPeopleView },
    automation: { label: 'Automazioni', icon: 'zap', render: renderAutomation, permission: 'alarm.manage' },
    settings: { label: 'Impostazioni', icon: 'settings', render: renderSettings, permission: 'system.manage' },
    storage: { label: 'Storage & Dischi', icon: 'disk', render: renderStorageView, permission: 'system.manage' },
    system: { label: 'Telemetria', icon: 'activity', render: renderSystem, permission: 'system.manage' },
    updates: { label: 'Aggiornamenti', icon: 'download', render: renderUpdatesView, permission: 'system.manage' },
    maintenance: { label: 'Gestione Macchina', icon: 'power', render: renderMaintenance, permission: 'system.manage' },
    datetime: { label: 'Data & Ora', icon: 'clock', render: renderDateTime, permission: 'system.manage' },
    audio: { label: 'Audio & Messaggi', icon: 'speaker', render: renderAudioLibrary, permission: 'system.manage' },
    users: { label: 'Utenti & Accessi', icon: 'users', render: renderUsers, permission: 'user.manage' }
};


const state = {
    session: null,
    route: 'dashboard',
    disconnect: null,
    stopVersionWatch: null
};

const root = document.getElementById('app');


function visibleRoutes() {
    const granted = state.session?.permissions ?? [];
    return Object.fromEntries(
        Object.entries(ROUTES).filter(([, route]) => !route.permission || granted.includes(route.permission))
    );
}

function currentLocation() {
    const parsed = parseLocation();
    return visibleRoutes()[parsed.name] ? parsed : { name: 'dashboard', params: [] };
}

async function mountRoute() {
    const { name, params } = currentLocation();
    state.route = name;
    setActiveRoute(name, visibleRoutes(), params);

    const outlet = document.getElementById('outlet');
    if (!outlet) return;

    outlet.firstElementChild?.dispatchEvent(new CustomEvent("argus:teardown"));
    outlet.replaceChildren();
    const view = await ROUTES[name].render({ session: state.session, api, params });
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
        onNavigate: (name) => go(name),
        onLogout: async () => {
            await api.post('/api/auth/logout');
            state.disconnect?.();
            state.session = null;
            await start();
        }
    }));

    startEventStream();
    state.stopVersionWatch?.();
    state.stopVersionWatch = startVersionWatch(api);
    await mountRoute();
}

async function showLogin(message) {
    state.disconnect?.();
    root.replaceChildren(renderLogin({
        message,
        onSuccess: async () => { await start(); },
        onRecovery: () => showRecoveryRequest()
    }));
}

function showRecoveryRequest() {
    state.disconnect?.();
    root.replaceChildren(renderRecoveryRequest({ onCancel: () => showLogin(null) }));
}

async function showRecoveryComplete(token) {
    state.disconnect?.();
    root.replaceChildren(await renderRecoveryComplete({
        token,
        onDone: () => showLogin('Password reimpostata: entra con quella nuova.'),
        onCancel: () => showLogin(null)
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

async function showMfaEnrollment(session) {
    state.disconnect?.();
    root.replaceChildren(renderMfaEnrollment({
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
        const location = parseLocation();
        if (location.name === 'recovery' && location.params[0]) {
            await showRecoveryComplete(location.params[0]);
            return;
        }

        await showLogin(null);
        return;
    }

    if (session.mustChangePassword) {
        state.session = session;
        await showPasswordChange(session);
        return;
    }

    if (session.mustEnrollMfa) {
        state.session = session;
        await showMfaEnrollment(session);
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
