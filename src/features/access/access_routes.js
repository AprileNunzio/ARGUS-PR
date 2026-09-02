import { requireId, requireString, requireBool, requireListType, requirePlatePattern, requireIsoDay } from '../../security/guards.js';
import { notFound } from '../../kernel/errors.js';
import { Permission } from '../../security/rbac.js';

export function registerAccessRoutes({ router, accessRepository }) {
    router.get('/api/access/rules', async () => {
        const rules = accessRepository.listRules();
        return { body: { rules } };
    }, { permission: Permission.LIVE_VIEW });

    router.post('/api/access/rules', async (ctx) => {
        const platePattern = requirePlatePattern(ctx.body?.platePattern, 'platePattern');
        const label = requireString(ctx.body?.label, 'label', { min: 1, max: 120 });
        const listType = requireListType(ctx.body?.listType, 'listType');
        const isActive = ctx.body?.isActive !== undefined ? requireBool(ctx.body.isActive) : true;
        const validFrom = ctx.body?.validFrom ? requireIsoDay(ctx.body.validFrom, 'validFrom') : null;
        const validTo = ctx.body?.validTo ? requireIsoDay(ctx.body.validTo, 'validTo') : null;

        const rule = accessRepository.createRule({ platePattern, label, listType, isActive, validFrom, validTo });
        return { body: { rule }, status: 201 };
    }, { permission: Permission.CAMERA_MANAGE });

    router.put('/api/access/rules/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'id');
        const changes = {};

        if (ctx.body?.platePattern !== undefined) {
            changes.platePattern = requirePlatePattern(ctx.body.platePattern, 'platePattern');
        }
        if (ctx.body?.label !== undefined) {
            changes.label = requireString(ctx.body.label, 'label', { min: 1, max: 120 });
        }
        if (ctx.body?.listType !== undefined) {
            changes.listType = requireListType(ctx.body.listType, 'listType');
        }
        if (ctx.body?.isActive !== undefined) {
            changes.isActive = requireBool(ctx.body.isActive);
        }

        if (ctx.body?.validFrom !== undefined) {
            changes.validFrom = ctx.body.validFrom ? requireIsoDay(ctx.body.validFrom, 'validFrom') : null;
        }
        if (ctx.body?.validTo !== undefined) {
            changes.validTo = ctx.body.validTo ? requireIsoDay(ctx.body.validTo, 'validTo') : null;
        }

        const updated = accessRepository.updateRule(id, changes);
        if (!updated) throw notFound('Access rule not found');
        return { body: { rule: updated } };
    }, { permission: Permission.CAMERA_MANAGE });

    router.delete('/api/access/rules/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'id');
        const deleted = accessRepository.deleteRule(id);
        if (!deleted) throw notFound('Access rule not found');
        return { body: { ok: true } };
    }, { permission: Permission.CAMERA_MANAGE });

    router.get('/api/access/events', async (ctx) => {
        const limit = Number(ctx.query?.limit ?? 50);
        const offset = Number(ctx.query?.offset ?? 0);
        const plate = ctx.query?.plate ?? null;

        const events = accessRepository.listEvents({ limit, offset, plate });
        return { body: { events } };
    }, { permission: Permission.LIVE_VIEW });
}
