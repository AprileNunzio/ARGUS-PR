import { Permission } from '../../security/rbac.js';
import { recordAudit } from '../../security/audit.js';
import { publish, Topic } from '../../kernel/event_bus.js';
import { describe, updateSettings, resetSettings } from './settings_service.js';

export function registerSettingsRoutes(router) {
    router.get('/api/settings', async () => ({
        body: describe()
    }), { permission: Permission.SYSTEM_MANAGE });

    router.put('/api/settings', async (ctx) => {
        const changes = updateSettings(ctx.body);

        for (const change of changes) {
            recordAudit({
                actorId: ctx.actor.id,
                actorName: ctx.actor.username,
                action: 'settings.update',
                target: change.key,
                remoteAddr: ctx.address,
                detail: change.sensitive
                    ? { changed: true }
                    : { from: change.previous, to: change.next }
            });
        }

        if (changes.length > 0) {
            publish(Topic.SETTINGS, { keys: changes.map((change) => change.key) });
        }

        return { body: { changed: changes.map((change) => change.key), settings: describe() } };
    }, {
        permission: Permission.SYSTEM_MANAGE,
        rateLimit: { limit: 60, windowMs: 10 * 60 * 1000 }
    });

    router.post('/api/settings/reset', async (ctx) => {
        resetSettings();

        recordAudit({
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            action: 'settings.reset',
            target: null,
            remoteAddr: ctx.address,
            detail: null
        });

        publish(Topic.SETTINGS, { keys: ['*'] });

        return { body: describe() };
    }, {
        permission: Permission.SYSTEM_MANAGE,
        rateLimit: { limit: 5, windowMs: 60 * 60 * 1000 }
    });
}
