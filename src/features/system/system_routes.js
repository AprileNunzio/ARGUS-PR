import os from 'node:os';
import fs from 'node:fs';
import { mediaToolsStatus, provisionMediaTools } from '../../platform/media_tools.js';
import { getDatabase } from '../../storage/database.js';
import { queryAudit, recordAudit } from '../../security/audit.js';
import { Permission } from '../../security/rbac.js';
import { readPackageVersion } from '../../platform/version.js';
import { getHardwareProfile } from '../../platform/hardware.js';
import { capabilityReport } from '../../platform/capabilities.js';
import { sanitizePerformanceSettings, applySqlitePerformance, DEFAULT_PERFORMANCE_SETTINGS } from '../settings/performance_tuning.js';
import { getSetting, setSetting } from '../settings/settings_repository.js';


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

    router.get('/api/system/hardware', async () => ({
        body: { hardware: getHardwareProfile() }
    }), { permission: Permission.LIVE_VIEW });

    router.get('/api/system/capabilities', async (ctx) => ({
        body: await capabilityReport(ctx.config)
    }), { permission: Permission.SYSTEM_MANAGE });

    router.get('/api/system/performance', async () => {
        const hardware = getHardwareProfile();
        const performance = sanitizePerformanceSettings(getSetting('performance', DEFAULT_PERFORMANCE_SETTINGS), hardware);
        return { body: { performance, hardware } };
    }, { permission: Permission.LIVE_VIEW });

    router.put('/api/system/performance', async (ctx) => {
        const hardware = getHardwareProfile();
        const sanitized = sanitizePerformanceSettings(ctx.body, hardware);
        setSetting('performance', sanitized);
        applySqlitePerformance(getDatabase(), sanitized);

        recordAudit(getDatabase(), {
            userId: ctx.actor?.id,
            action: 'system.performance.update',
            resource: 'performance',
            details: sanitized
        });

        return { body: { performance: sanitized } };
    }, { permission: Permission.SYSTEM_MANAGE });
}

