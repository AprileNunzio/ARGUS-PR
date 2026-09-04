import { Permission } from '../../security/rbac.js';
import { recordAudit } from '../../security/audit.js';
import { checkForUpdate, updateStatus, requestUpdate, cancelUpdate, scheduleRestart, resetWatchdog } from './update_service.js';
import { approveRestart, dismissPendingUpgrade } from './auto_update.js';
import { scanForBundles, verifyBundle, applyOfflineBundle, fetchRemoteBundle } from './offline_update.js';
import { requireString, optionalString } from '../../security/guards.js';
import { validationError } from '../../kernel/errors.js';

export function registerUpdateRoutes(router) {
    router.get('/api/updates/status', async (ctx) => ({
        body: updateStatus(ctx.config)
    }), { permission: Permission.SYSTEM_MANAGE });

    router.post('/api/updates/check', async () => ({
        body: await checkForUpdate({ force: true })
    }), {
        permission: Permission.SYSTEM_MANAGE,
        rateLimit: { limit: 10, windowMs: 10 * 60 * 1000 }
    });

    router.post('/api/updates/apply', async (ctx) => {
        const state = await requestUpdate(ctx.config, ctx.body.ref);

        recordAudit({
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            action: 'update.request',
            target: state.targetRef,
            remoteAddr: ctx.address,
            detail: { from: state.previousVersion }
        });

        scheduleRestart();

        return { status: 202, body: { state, restarting: true } };
    }, {
        permission: Permission.SYSTEM_MANAGE,
        rateLimit: { limit: 5, windowMs: 60 * 60 * 1000 }
    });

    router.post('/api/updates/approve', async (ctx) => {
        const outcome = await approveRestart(ctx.config);

        if (!outcome.approved) {
            return { status: 409, body: outcome };
        }

        recordAudit({
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            action: 'update.approve',
            target: outcome.target,
            remoteAddr: ctx.address,
            detail: null
        });

        return { status: 202, body: { ...outcome, restarting: true } };
    }, {
        permission: Permission.SYSTEM_MANAGE,
        rateLimit: { limit: 10, windowMs: 60 * 60 * 1000 }
    });

    router.post('/api/updates/postpone', async (ctx) => {
        const state = dismissPendingUpgrade(ctx.config);

        recordAudit({
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            action: 'update.postpone',
            target: state.targetRef,
            remoteAddr: ctx.address,
            detail: null
        });

        return { body: { state } };
    }, { permission: Permission.SYSTEM_MANAGE });

    router.get('/api/updates/offline/scan', async (ctx) => ({
        body: { bundles: scanForBundles(ctx.query.path ? [String(ctx.query.path)] : []) }
    }), { permission: Permission.SYSTEM_MANAGE });

    router.post('/api/updates/offline/verify', async (ctx) => {
        const bundlePath = requireString(ctx.body.path, 'Percorso del pacchetto', { max: 400 });
        return { body: { bundle: await verifyBundle(bundlePath) } };
    }, {
        permission: Permission.SYSTEM_MANAGE,
        rateLimit: { limit: 20, windowMs: 10 * 60 * 1000 }
    });

    router.post('/api/updates/offline/download', async (ctx) => {
        const url = requireString(ctx.body.url, 'Indirizzo del pacchetto', { max: 1024 });
        const bundle = await fetchRemoteBundle(ctx.config, url);
        if (!bundle) throw validationError('Pacchetto scaricato ma non riconosciuto');

        recordAudit({
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            action: 'update.offline.download',
            target: bundle.tag,
            remoteAddr: ctx.address,
            detail: { name: bundle.name }
        });

        return { body: { bundle } };
    }, {
        permission: Permission.SYSTEM_MANAGE,
        rateLimit: { limit: 5, windowMs: 30 * 60 * 1000 }
    });

    router.post('/api/updates/offline/apply', async (ctx) => {
        const bundlePath = requireString(ctx.body.path, 'Percorso del pacchetto', { max: 400 });
        const expected = optionalString(ctx.body.sha256, 'Impronta SHA-256', { max: 64 });
        const outcome = await applyOfflineBundle(ctx.config, bundlePath, expected);

        recordAudit({
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            action: 'update.offline.apply',
            target: outcome.bundle.tag,
            remoteAddr: ctx.address,
            detail: { name: outcome.bundle.name, sha256: outcome.bundle.sha256 }
        });

        scheduleRestart();

        return { status: 202, body: { ...outcome, restarting: true } };
    }, {
        permission: Permission.SYSTEM_MANAGE,
        rateLimit: { limit: 5, windowMs: 60 * 60 * 1000 }
    });

    router.post('/api/updates/watchdog/reset', async (ctx) => {
        const watchdog = resetWatchdog(ctx.config);

        recordAudit({
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            action: 'update.watchdog.reset',
            target: null,
            remoteAddr: ctx.address,
            detail: null
        });

        return { body: { watchdog, status: updateStatus(ctx.config) } };
    }, {
        permission: Permission.SYSTEM_MANAGE,
        rateLimit: { limit: 10, windowMs: 60 * 60 * 1000 }
    });

    router.post('/api/updates/cancel', async (ctx) => {
        const state = cancelUpdate(ctx.config);

        recordAudit({
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            action: 'update.cancel',
            target: null,
            remoteAddr: ctx.address,
            detail: null
        });

        return { body: { state } };
    }, { permission: Permission.SYSTEM_MANAGE });
}
