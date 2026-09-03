import { loadConfig } from './kernel/config.js';
import { setLogLevel, createLogger } from './kernel/logger.js';
import { installProcessGuard, onShutdown } from './kernel/process_guard.js';
import { openDatabase } from './storage/database.js';
import { initVault } from './security/vault.js';
import { purgeExpiredSessions } from './security/sessions.js';
import { purgeLockouts } from './security/lockout.js';
import { initSecurityEvents } from './security/security_events.js';
import { tlsStatus } from './platform/tls.js';
import { initMediaTools } from './platform/media_tools.js';
import { createHttpServer, createRedirectServer, listen, listenRedirect } from './http/server.js';
import { attachEventSocket } from './http/websocket.js';
import { prepareSetup } from './features/setup/setup_service.js';
import { registerSetupRoutes } from './features/setup/setup_routes.js';
import { registerAuthRoutes } from './features/auth/auth_routes.js';
import { registerCameraRoutes } from './features/cameras/camera_routes.js';
import { registerDiscoveryRoutes } from './features/discovery/discovery_routes.js';
import { registerSystemRoutes } from './features/system/system_routes.js';
import { registerSettingsRoutes } from './features/settings/settings_routes.js';
import { seedFromConfig, readSetting } from './features/settings/settings_service.js';
import { registerStreamRoutes } from './features/streaming/stream_routes.js';
import { installStreamHub } from './features/streaming/stream_hub.js';
import { registerRecordingRoutes } from './features/recording/recording_routes.js';
import { registerPlaybackRoutes } from './features/recording/playback_routes.js';
import { installRecordingHub } from './features/recording/recording_hub.js';
import { registerKioskRoutes } from './features/kiosk/kiosk_routes.js';
import { registerExportRoutes } from './features/export/export_routes.js';
import { registerUpdateRoutes } from './features/updates/update_routes.js';
import { installUpdateWatchdog, onPeriodicCheck } from './features/updates/update_service.js';
import { runAutomaticUpgrade, Outcome } from './features/updates/auto_update.js';
import { registerSchedulingRoutes } from './features/scheduling/scheduling_routes.js';
import { registerMotionRoutes } from './features/motion/motion_routes.js';
import { installMotionHub } from './features/motion/motion_hub.js';
import { registerDetectionRoutes } from './features/detections/detections_routes.js';
import { registerAccessRoutes } from './features/access/access_routes.js';
import { createAccessRepository } from './features/access/access_repository.js';
import { registerPeopleRoutes } from './features/people/people_routes.js';
import { createPeopleRepository } from './features/people/people_repository.js';
import { installVisionHub } from './features/vision/vision_hub.js';
import { listCameras } from './features/cameras/camera_repository.js';
import { insertDetectionEvent } from './features/detections/detections_repository.js';
import { readPackageVersion } from './platform/version.js';



const log = createLogger('app');

function registerRoutes(router, { db, accessRepository, peopleRepository, config }) {
    registerSetupRoutes(router);
    registerAuthRoutes(router);
    registerCameraRoutes(router);
    registerDiscoveryRoutes(router);
    registerSystemRoutes(router);
    registerSettingsRoutes(router);
    registerStreamRoutes(router);
    registerRecordingRoutes(router);
    registerPlaybackRoutes(router);
    registerKioskRoutes(router);
    registerExportRoutes(router);
    registerUpdateRoutes(router);
    registerSchedulingRoutes(router);
    registerMotionRoutes(router);
    registerDetectionRoutes(router);
    registerAccessRoutes({ router, accessRepository });
    registerPeopleRoutes({ router, peopleRepository, db, config });
}

function startMaintenanceWatch(config) {
    const timer = setInterval(() => {
        if (readSetting('updates.restartPolicy') !== 'window') return;
        runAutomaticUpgrade(config, 'window').catch((error) => log.debug('maintenance check failed', { message: error.message }));
    }, 10 * 60 * 1000);

    timer.unref();
    onShutdown('maintenance-watch', () => clearInterval(timer));
}

function startSessionJanitor() {
    const timer = setInterval(() => {
        const removed = purgeExpiredSessions();
        const unlocked = purgeLockouts();
        if (removed > 0 || unlocked > 0) log.debug('security janitor', { removed, unlocked });
    }, 15 * 60 * 1000);
    timer.unref();
    onShutdown('session-janitor', () => clearInterval(timer));
}

export async function bootstrap(overrides = {}) {
    installProcessGuard();

    const config = loadConfig(overrides);
    setLogLevel(config.logLevel);

    log.info('starting', {
        version: readPackageVersion(),
        node: process.version,
        platform: process.platform,
        dataDir: config.dataDir
    });

    initVault(config);
    initSecurityEvents(config);
    const db = openDatabase(config);

    seedFromConfig(config);

    if (process.platform === 'win32') {
        const { handleWindowsStartup } = await import('./features/updates/windows_updater.js');
        handleWindowsStartup(config);
    }

    const upgrade = await runAutomaticUpgrade(config, 'startup');

    if (upgrade.outcome === Outcome.UPGRADING) {
        log.warn('startup interrupted to apply the upgrade', { target: upgrade.target });
        return { config, upgrading: true, target: upgrade.target };
    }

    const setup = prepareSetup();
    await initMediaTools(config);

    startSessionJanitor();
    installStreamHub();
    installRecordingHub(config);
    installMotionHub(config);
    installUpdateWatchdog(config);
    onPeriodicCheck((current) => runAutomaticUpgrade(current, 'periodic'));
    startMaintenanceWatch(config);

    const accessRepository = createAccessRepository(db);
    const peopleRepository = createPeopleRepository(db);

    const visionHub = installVisionHub({
        config,
        cameraRepository: { list: listCameras },
        detectionsRepository: { recordEvent: insertDetectionEvent },
        peopleRepository,
        accessRepository
    });
    onShutdown('vision-hub', () => visionHub.stop());



    const { server } = createHttpServer(config, (router) => registerRoutes(router, { db, accessRepository, peopleRepository, config }));
    attachEventSocket(server, config);
    await listen(server, config);

    let redirecting = false;
    if (config.httpPort > 0 && config.httpPort !== config.port) {
        redirecting = await listenRedirect(createRedirectServer(config), config);
    }

    const tls = tlsStatus();

    log.info('security posture', {
        autoUpdate: upgrade.outcome,
        tls: tls.source,
        certificateTrusted: tls.trusted,
        remoteAccess: config.publicAccess,
        trustedNetworks: config.trustedNetworkList.length,
        redirect: redirecting
    });

    return { config, setup, tls, redirecting, upgrading: false, upgrade: upgrade.outcome };
}

