import { getCamera } from '../cameras/camera_repository.js';
import { profileFor, replaceProfile } from './analytics_repository.js';
import { catalogView, capabilityIds, isEngineAllowed, findCapability } from './engines_catalog.js';
import { mergeProfile, requiredModels } from './analytics_profile.js';
import { modelsOverview, installModels, missingModels } from './models_service.js';
import { Permission } from '../../security/rbac.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { publish, Topic } from '../../kernel/event_bus.js';
import { notFound, validationError } from '../../kernel/errors.js';
import { requireId, requireBool, requireEnum, requireNumberRange } from '../../security/guards.js';

function readEntries(body) {
    if (!Array.isArray(body?.capabilities)) throw validationError('Il profilo deve elencare le capacita');
    if (body.capabilities.length > 32) throw validationError('Troppe capacita nel profilo');

    const seen = new Set();
    return body.capabilities.map((raw) => {
        const capability = requireEnum(raw.capability, 'Capability', capabilityIds());
        if (seen.has(capability)) throw validationError(`Capacita duplicata: ${capability}`);
        seen.add(capability);

        const engineId = requireId(raw.engineId, 'Engine id');
        const enabled = requireBool(raw.enabled);

        if (enabled && !isEngineAllowed(capability, engineId)) {
            throw validationError(`Il motore ${engineId} non e disponibile per ${capability}`);
        }

        return {
            capability,
            enabled,
            engineId,
            threshold: raw.threshold === undefined || raw.threshold === null
                ? findCapability(capability).defaultThreshold
                : requireNumberRange(raw.threshold, 'Threshold', 0, 1),
            minSize: raw.minSize === undefined || raw.minSize === null
                ? 0
                : requireNumberRange(raw.minSize, 'Min size', 0, 1)
        };
    });
}

export function registerAnalyticsRoutes(router, { config }) {
    router.get('/api/vision/engines', async () => ({
        body: catalogView()
    }), { permission: Permission.LIVE_VIEW });

    router.get('/api/vision/models', async () => ({
        body: modelsOverview(config)
    }), { permission: Permission.CAMERA_MANAGE });

    router.post('/api/vision/models/install', async (ctx) => {
        const names = Array.isArray(ctx.body?.models)
            ? ctx.body.models.map((name) => requireId(name, 'Model name'))
            : null;

        const results = await installModels(names, config);

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            target: 'vision.models',
            remoteAddr: ctx.address,
            detail: { models: results.map((result) => `${result.name}:${result.status}`) }
        });

        return { body: { results, state: modelsOverview(config) } };
    }, { permission: Permission.SYSTEM_MANAGE, rateLimit: { limit: 6, windowMs: 10 * 60 * 1000 } });

    router.get('/api/cameras/:id/analytics', async (ctx) => {
        const id = requireId(ctx.params.id, 'Camera id');
        if (!getCamera(id)) throw notFound('Camera');

        const capabilities = profileFor(id);
        return {
            body: {
                cameraId: id,
                capabilities,
                missingModels: missingModels(requiredModels(capabilities), config)
            }
        };
    }, { permission: Permission.CAMERA_MANAGE });

    router.put('/api/cameras/:id/analytics', async (ctx) => {
        const id = requireId(ctx.params.id, 'Camera id');
        if (!getCamera(id)) throw notFound('Camera');

        const entries = readEntries(ctx.body);
        const capabilities = replaceProfile(id, mergeProfile(entries));
        const pending = missingModels(requiredModels(capabilities), config);

        recordAudit({
            action: AuditAction.CAMERA_UPDATED,
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            target: id,
            remoteAddr: ctx.address,
            detail: {
                analytics: capabilities.filter((entry) => entry.enabled).map((entry) => `${entry.capability}:${entry.engineId}`)
            }
        });

        publish(Topic.ANALYTICS_UPDATED, { cameraId: id });

        return { body: { cameraId: id, capabilities, missingModels: pending } };
    }, { permission: Permission.CAMERA_MANAGE });
}
