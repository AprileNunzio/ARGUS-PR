import os from 'node:os';
import fs from 'node:fs';
import { setupStatus, claimInstance, assertSetupOpen } from './setup_service.js';
import { login } from '../auth/auth_service.js';
import { mediaToolsStatus, provisionMediaTools } from '../../platform/media_tools.js';
import { requireString } from '../../security/guards.js';
import { assessPassword } from '../../security/password.js';
import { validationError } from '../../kernel/errors.js';
import { readPackageVersion } from '../../platform/version.js';
import { buildCookie } from '../../http/http_utils.js';
import { sessionTtlHoursFor } from '../settings/settings_service.js';
import { SESSION_COOKIE } from '../../http/server.js';

const CLAIM_RATE_LIMIT = Object.freeze({ limit: 10, windowMs: 10 * 60 * 1000 });

function diskUsage(target) {
    const stat = (() => {
        try {
            return fs.statfsSync(target);
        } catch {
            return null;
        }
    })();

    if (!stat) return null;

    const total = stat.blocks * stat.bsize;
    const free = stat.bavail * stat.bsize;
    return { totalBytes: total, freeBytes: free, usedPercent: total > 0 ? Math.round(((total - free) / total) * 1000) / 10 : 0 };
}

export function registerSetupRoutes(router) {
    router.get('/api/setup/status', async (ctx) => ({
        body: {
            ...setupStatus(),
            version: readPackageVersion(),
            system: {
                hostname: os.hostname(),
                platform: `${os.type()} ${os.release()}`,
                arch: os.arch(),
                node: process.version,
                cpus: os.cpus().length,
                totalMemoryBytes: os.totalmem()
            },
            media: mediaToolsStatus(),
            storage: {
                dataDir: ctx.config.dataDir,
                mediaDir: ctx.config.mediaDir,
                mediaDisk: diskUsage(ctx.config.mediaDir)
            },
            network: {
                host: ctx.config.host,
                port: ctx.config.port
            }
        }
    }), { anonymous: true });

    router.post('/api/setup/claim', async (ctx) => {
        const username = requireString(ctx.body.username, 'Nome utente', { min: 3, max: 64 });
        const password = requireString(ctx.body.password, 'Password', { max: 200 });
        const confirmation = requireString(ctx.body.passwordConfirm, 'Conferma password', { max: 200 });

        if (password !== confirmation) throw validationError('Le due password non coincidono');

        const problems = assessPassword(password);
        if (problems.length > 0) throw validationError('Password troppo debole', { problems });

        await claimInstance({ username, password });

        const result = await login({
            username,
            password,
            remoteAddr: ctx.address,
            userAgent: ctx.req.headers['user-agent'] ?? null,
            ttlHours: sessionTtlHoursFor(ctx.config),
            zone: ctx.zone
        });

        const cookie = buildCookie(SESSION_COOKIE, result.session.token, {
            secure: ctx.req.socket.encrypted === true,
            maxAge: sessionTtlHoursFor(ctx.config) * 3600
        });

        return {
            status: 201,
            headers: { 'Set-Cookie': cookie },
            body: { profile: result.profile }
        };
    }, { anonymous: true, rateLimit: CLAIM_RATE_LIMIT });

    router.post('/api/setup/dependencies/ffmpeg', async () => {
        assertSetupOpen();
        return { body: { media: await provisionMediaTools() } };
    }, { anonymous: true, rateLimit: { limit: 3, windowMs: 10 * 60 * 1000 } });
}
