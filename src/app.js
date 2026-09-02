import { loadConfig } from './kernel/config.js';
import { setLogLevel, createLogger } from './kernel/logger.js';
import { installProcessGuard, onShutdown } from './kernel/process_guard.js';
import { openDatabase } from './storage/database.js';
import { initVault } from './security/vault.js';
import { purgeExpiredSessions } from './security/sessions.js';
import { initMediaTools } from './platform/media_tools.js';
import { createHttpServer, listen } from './http/server.js';
import { attachEventSocket } from './http/websocket.js';
import { prepareSetup } from './features/setup/setup_service.js';
import { registerSetupRoutes } from './features/setup/setup_routes.js';
import { registerAuthRoutes } from './features/auth/auth_routes.js';
import { registerCameraRoutes } from './features/cameras/camera_routes.js';
import { registerDiscoveryRoutes } from './features/discovery/discovery_routes.js';
import { registerSystemRoutes } from './features/system/system_routes.js';
import { registerStreamRoutes } from './features/streaming/stream_routes.js';
import { installStreamHub } from './features/streaming/stream_hub.js';
import { registerRecordingRoutes } from './features/recording/recording_routes.js';
import { registerPlaybackRoutes } from './features/recording/playback_routes.js';
import { installRecordingHub } from './features/recording/recording_hub.js';
import { registerKioskRoutes } from './features/kiosk/kiosk_routes.js';
import { readPackageVersion } from './platform/version.js';

const log = createLogger('app');

function registerRoutes(router) {
    registerSetupRoutes(router);
    registerAuthRoutes(router);
    registerCameraRoutes(router);
    registerDiscoveryRoutes(router);
    registerSystemRoutes(router);
    registerStreamRoutes(router);
    registerRecordingRoutes(router);
    registerPlaybackRoutes(router);
    registerKioskRoutes(router);
}

function startSessionJanitor() {
    const timer = setInterval(() => {
        const removed = purgeExpiredSessions();
        if (removed > 0) log.debug('expired sessions purged', { removed });
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
    openDatabase(config);

    const setup = prepareSetup();
    await initMediaTools(config);

    startSessionJanitor();
    installStreamHub();
    installRecordingHub(config);

    const { server } = createHttpServer(config, registerRoutes);
    attachEventSocket(server);
    await listen(server, config);

    return { config, setup };
}
