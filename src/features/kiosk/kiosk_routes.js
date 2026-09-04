import { issueConsoleSession, localAddresses, assertLocalConsole } from './kiosk_service.js';
import { buildCookie } from '../../http/http_utils.js';
import { SESSION_COOKIE } from '../../http/server.js';
import { listCameras } from '../cameras/camera_repository.js';
import { recordingStates } from '../recording/recording_hub.js';
import { readPackageVersion } from '../../platform/version.js';
import { isSetupRequired } from '../setup/setup_service.js';
import { Exposure } from '../../security/net_zones.js';
import { liveMetrics } from '../../platform/metrics.js';

export function registerKioskRoutes(router) {
    router.post('/api/console/session', async (ctx) => {
        if (ctx.actor && ctx.actor.username && ctx.actor.username !== '__kiosk__') {
            return {
                status: 200,
                body: { expiresAt: null, existingUser: ctx.actor.username }
            };
        }

        const session = await issueConsoleSession(ctx.address, ctx.config.sessionTtlHours);

        const cookie = buildCookie(SESSION_COOKIE, session.token, {
            secure: ctx.req.socket.encrypted === true,
            maxAge: ctx.config.sessionTtlHours * 3600
        });

        return {
            status: 201,
            headers: { 'Set-Cookie': cookie },
            body: { expiresAt: session.expiresAt }
        };
    }, { anonymous: true, rateLimit: { limit: 30, windowMs: 60000 }, exposure: Exposure.LOCAL });

    router.get('/api/console/status', async (ctx) => {
        if (!ctx.actor) {
            assertLocalConsole(ctx.address);
        }

        const setupRequired = isSetupRequired();
        const cameras = setupRequired ? [] : listCameras();
        const recorders = setupRequired ? [] : recordingStates();

        return {
            body: {
                version: readPackageVersion(),
                setupRequired,
                port: ctx.config.port,
                addresses: localAddresses(),
                cameras: cameras.length,
                enabled: cameras.filter((camera) => camera.enabled).length,
                recording: recorders.filter((item) => item.state === 'recording').length,
                uptimeSeconds: Math.round(process.uptime()),
                metrics: liveMetrics()
            }
        };
    }, { anonymous: true, exposure: Exposure.PRIVATE });
}
