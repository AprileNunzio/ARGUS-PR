import os from 'node:os';
import fs from 'node:fs';
import { mediaToolsStatus, provisionMediaTools } from '../../platform/media_tools.js';
import { getDatabase } from '../../storage/database.js';
import { queryAudit } from '../../security/audit.js';
import { Permission } from '../../security/rbac.js';
import { readPackageVersion } from '../../platform/version.js';

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
    return {
        totalBytes: total,
        freeBytes: free,
        usedBytes: total - free,
        usedPercent: total > 0 ? Math.round(((total - free) / total) * 1000) / 10 : 0
    };
}

export function registerSystemRoutes(router) {
    router.get('/api/system/health', async () => ({
        body: {
            status: 'ok',
            uptimeSeconds: Math.round(process.uptime()),
            version: readPackageVersion()
        }
    }), { anonymous: true });

    router.get('/api/system/info', async (ctx) => {
        const cameraCount = getDatabase().prepare('SELECT COUNT(*) AS total FROM cameras').get().total;

        return {
            body: {
                version: readPackageVersion(),
                node: process.version,
                platform: `${os.type()} ${os.release()} ${os.arch()}`,
                hostname: os.hostname(),
                cpus: os.cpus().length,
                totalMemoryBytes: os.totalmem(),
                freeMemoryBytes: os.freemem(),
                loadAverage: os.loadavg(),
                uptimeSeconds: Math.round(process.uptime()),
                media: mediaToolsStatus(),
                storage: {
                    dataDir: ctx.config.dataDir,
                    mediaDir: ctx.config.mediaDir,
                    mediaDisk: diskUsage(ctx.config.mediaDir)
                },
                cameraCount
            }
        };
    }, { permission: Permission.LIVE_VIEW });

    router.get('/api/system/audit', async (ctx) => ({
        body: { entries: queryAudit(ctx.query) }
    }), { permission: Permission.AUDIT_VIEW });

    router.post('/api/system/dependencies/ffmpeg', async () => ({
        body: { media: await provisionMediaTools() }
    }), {
        permission: Permission.SYSTEM_MANAGE,
        rateLimit: { limit: 3, windowMs: 10 * 60 * 1000 }
    });
}
