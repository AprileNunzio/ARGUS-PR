import { Permission } from '../../security/rbac.js';
import { Exposure } from '../../security/net_zones.js';
import { requireEnum } from '../../security/guards.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { validationError } from '../../kernel/errors.js';
import {
    machineSnapshot,
    serviceStates,
    restartService,
    powerAction,
    clearCaches,
    listServices,
    POWER_ACTIONS,
    CACHE_SCOPES
} from './maintenance_service.js';

function requireScopes(raw) {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw)) throw validationError('Elenco delle cache non valido');

    const scopes = [];
    for (const entry of raw.slice(0, CACHE_SCOPES.length)) {
        scopes.push(requireEnum(entry, 'Cache', [...CACHE_SCOPES]));
    }
    return scopes;
}

export function registerMaintenanceRoutes(router) {
    router.get('/api/system/maintenance', async (ctx) => ({
        body: {
            machine: machineSnapshot(ctx.config),
            services: await serviceStates(),
            powerActions: POWER_ACTIONS,
            cacheScopes: CACHE_SCOPES
        }
    }), { permission: Permission.SYSTEM_MANAGE, exposure: Exposure.PRIVATE });

    router.post('/api/system/maintenance/service/:id/restart', async (ctx) => {
        const id = requireEnum(ctx.params.id, 'Servizio', listServices().map((service) => service.id));
        const outcome = await restartService(id);

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: id,
            remoteAddr: ctx.address,
            detail: { action: 'service_restart', service: id }
        });

        return { status: 202, body: outcome };
    }, {
        permission: Permission.SYSTEM_MANAGE,
        exposure: Exposure.PRIVATE,
        rateLimit: { limit: 10, windowMs: 10 * 60 * 1000 }
    });

    router.post('/api/system/maintenance/power', async (ctx) => {
        const action = requireEnum(ctx.body.action, 'Azione', [...POWER_ACTIONS]);

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: action,
            remoteAddr: ctx.address,
            detail: { action: 'machine_power', operation: action }
        });

        return { status: 202, body: await powerAction(action) };
    }, {
        permission: Permission.SYSTEM_MANAGE,
        exposure: Exposure.PRIVATE,
        rateLimit: { limit: 5, windowMs: 10 * 60 * 1000 }
    });

    router.post('/api/system/maintenance/cache', async (ctx) => {
        const report = clearCaches(ctx.config, requireScopes(ctx.body.scopes));

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: 'cache',
            remoteAddr: ctx.address,
            detail: { action: 'cache_cleared', scopes: report.scopes }
        });

        return { body: report };
    }, {
        permission: Permission.SYSTEM_MANAGE,
        exposure: Exposure.PRIVATE,
        rateLimit: { limit: 20, windowMs: 10 * 60 * 1000 }
    });
}
