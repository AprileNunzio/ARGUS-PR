import crypto from 'node:crypto';
import {
    listRules, getRule, saveRule, deleteRule,
    listChannels, getChannel, saveChannel, deleteChannel,
    listRuns
} from './automation_repository.js';
import { TRIGGER_KINDS, PLATE_SCOPES, PERSON_SCOPES } from './rule_matcher.js';
import { CHANNEL_KINDS, CHANNEL_LABELS, SECRET_LABELS } from './channels/index.js';
import { Permission } from '../../security/rbac.js';
import { Exposure } from '../../security/net_zones.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { notFound, validationError } from '../../kernel/errors.js';
import {
    requireId, requireString, optionalString, requireBool, requireEnum,
    requireNumberRange, requireWeekMask, requireDetectionClass
} from '../../security/guards.js';

const CONFIG_LIMIT = 4096;

function readActions(raw) {
    if (!Array.isArray(raw) || raw.length === 0) throw validationError('La regola deve avere almeno un azione');
    if (raw.length > 8) throw validationError('Troppe azioni in una sola regola');

    return raw.map((entry) => ({ channelId: requireId(entry.channelId, 'Channel id') }));
}

function readRule(body) {
    return {
        name: requireString(body.name, 'Nome', { max: 120 }),
        enabled: body.enabled === undefined ? true : requireBool(body.enabled),
        triggerKind: requireEnum(body.triggerKind, 'Trigger', TRIGGER_KINDS),
        cameraId: body.cameraId === undefined || body.cameraId === null || body.cameraId === ''
            ? null
            : requireId(body.cameraId, 'Camera id'),
        className: body.className === undefined || body.className === null || body.className === ''
            ? null
            : requireDetectionClass(body.className),
        minConfidence: body.minConfidence === undefined || body.minConfidence === null
            ? 0
            : requireNumberRange(body.minConfidence, 'Confidenza minima', 0, 1),
        plateScope: requireEnum(body.plateScope ?? 'any', 'Ambito targa', PLATE_SCOPES),
        personScope: requireEnum(body.personScope ?? 'any', 'Ambito persona', PERSON_SCOPES),
        targetPlate: body.targetPlate ? optionalString(body.targetPlate, 'Targa specifica', { max: 32 }) : null,
        targetPersonId: body.targetPersonId ? optionalString(body.targetPersonId, 'Persona specifica', { max: 64 }) : null,
        upperColor: body.upperColor ? optionalString(body.upperColor, 'Colore abito', { max: 32 }) : null,
        minOccurrences: body.minOccurrences ? Math.trunc(requireNumberRange(body.minOccurrences, 'Occorrenze minime', 1, 1000)) : 1,
        occurrenceWindowMinutes: body.occurrenceWindowMinutes ? Math.trunc(requireNumberRange(body.occurrenceWindowMinutes, 'Finestra minuti', 1, 10080)) : 60,
        weekMask: body.weekMask === undefined || body.weekMask === null || body.weekMask === ''
            ? null
            : requireWeekMask(body.weekMask),
        cooldownSeconds: body.cooldownSeconds === undefined
            ? 60
            : Math.trunc(requireNumberRange(body.cooldownSeconds, 'Cooldown', 0, 86400)),
        dailyLimit: body.dailyLimit === undefined || body.dailyLimit === null || body.dailyLimit === ''
            ? null
            : Math.trunc(requireNumberRange(body.dailyLimit, 'Limite giornaliero', 1, 10000)),
        actions: readActions(body.actions)
    };
}

function readChannel(body) {
    const config = body.config ?? {};
    if (typeof config !== 'object' || Array.isArray(config)) throw validationError('Configurazione del canale non valida');

    const serialised = JSON.stringify(config);
    if (serialised.length > CONFIG_LIMIT) throw validationError('Configurazione del canale troppo grande');

    for (const value of Object.values(config)) {
        if (typeof value === 'string' && value.length > 512) throw validationError('Valore di configurazione troppo lungo');
    }

    return {
        kind: requireEnum(body.kind, 'Tipo canale', CHANNEL_KINDS),
        name: requireString(body.name, 'Nome', { max: 120 }),
        enabled: body.enabled === undefined ? true : requireBool(body.enabled),
        config,
        secret: body.secret === undefined ? undefined : optionalString(body.secret, 'Segreto', { max: 512 })
    };
}

export function registerAutomationRoutes(router, { hub }) {
    router.get('/api/automation/catalog', async () => ({
        body: {
            triggers: TRIGGER_KINDS,
            plateScopes: PLATE_SCOPES,
            personScopes: PERSON_SCOPES,
            channels: CHANNEL_KINDS.map((kind) => ({ kind, label: CHANNEL_LABELS[kind], secretLabel: SECRET_LABELS[kind] ?? null }))
        }
    }), { permission: Permission.ALARM_MANAGE });

    router.get('/api/automation/rules', async () => ({ body: { rules: listRules() } }), { permission: Permission.ALARM_MANAGE });

    router.post('/api/automation/rules', async (ctx) => {
        const rule = saveRule({ id: crypto.randomUUID(), ...readRule(ctx.body) });
        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            target: `automation:${rule.id}`,
            remoteAddr: ctx.address,
            detail: { name: rule.name, trigger: rule.triggerKind }
        });
        return { status: 201, body: { rule } };
    }, { permission: Permission.ALARM_MANAGE, exposure: Exposure.PRIVATE });

    router.put('/api/automation/rules/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'Rule id');
        if (!getRule(id)) throw notFound('Regola');

        const rule = saveRule({ id, ...readRule(ctx.body) });
        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            target: `automation:${id}`,
            remoteAddr: ctx.address,
            detail: { name: rule.name }
        });
        return { body: { rule } };
    }, { permission: Permission.ALARM_MANAGE, exposure: Exposure.PRIVATE });

    router.post('/api/automation/cameras/:id/enabled', async (ctx) => {
        const cameraId = requireId(ctx.params.id, 'Camera id');
        const enabled = requireBool(ctx.body.enabled);

        const affected = listRules().filter((rule) => rule.cameraId === cameraId);
        for (const rule of affected) saveRule({ ...rule, enabled });

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            target: cameraId,
            remoteAddr: ctx.address,
            detail: { action: 'automation_camera_toggle', enabled, rules: affected.length }
        });

        return { body: { cameraId, enabled, rules: affected.length } };
    }, { permission: Permission.ALARM_MANAGE });

    router.get('/api/automation/cameras/:id', async (ctx) => {
        const cameraId = requireId(ctx.params.id, 'Camera id');
        const rules = listRules().filter((rule) => rule.cameraId === cameraId);

        return {
            body: {
                cameraId,
                total: rules.length,
                enabled: rules.filter((rule) => rule.enabled).length
            }
        };
    }, { permission: Permission.LIVE_VIEW });

    router.delete('/api/automation/rules/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'Rule id');
        if (!deleteRule(id)) throw notFound('Regola');
        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            target: `automation:${id}`,
            remoteAddr: ctx.address,
            detail: { deleted: true }
        });
        return { body: { ok: true } };
    }, { permission: Permission.ALARM_MANAGE, exposure: Exposure.PRIVATE });

    router.get('/api/automation/channels', async () => ({ body: { channels: listChannels() } }), { permission: Permission.ALARM_MANAGE });

    router.post('/api/automation/channels', async (ctx) => {
        const channel = saveChannel({ id: crypto.randomUUID(), ...readChannel(ctx.body) });
        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            target: `channel:${channel.id}`,
            remoteAddr: ctx.address,
            detail: { kind: channel.kind, name: channel.name }
        });
        return { status: 201, body: { channel } };
    }, { permission: Permission.ALARM_MANAGE, exposure: Exposure.PRIVATE });

    router.put('/api/automation/channels/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'Channel id');
        if (!getChannel(id)) throw notFound('Canale');

        const channel = saveChannel({ id, ...readChannel(ctx.body) });
        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            target: `channel:${id}`,
            remoteAddr: ctx.address,
            detail: { kind: channel.kind }
        });
        return { body: { channel } };
    }, { permission: Permission.ALARM_MANAGE, exposure: Exposure.PRIVATE });

    router.delete('/api/automation/channels/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'Channel id');
        if (!deleteChannel(id)) throw notFound('Canale');
        return { body: { ok: true } };
    }, { permission: Permission.ALARM_MANAGE, exposure: Exposure.PRIVATE });

    router.post('/api/automation/channels/:id/test', async (ctx) => {
        const id = requireId(ctx.params.id, 'Channel id');
        const channel = getChannel(id);
        if (!channel) throw notFound('Canale');

        const outcome = await hub.test(null, id);

        recordAudit({
            action: AuditAction.SETTINGS_CHANGED,
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            target: `channel:${id}`,
            remoteAddr: ctx.address,
            detail: { test: true, kind: channel.kind }
        });

        return { body: { ok: true, outcome } };
    }, { permission: Permission.ALARM_MANAGE, exposure: Exposure.PRIVATE, rateLimit: { limit: 10, windowMs: 10 * 60 * 1000 } });

    router.get('/api/automation/runs', async (ctx) => ({
        body: { runs: listRuns(Number.parseInt(ctx.query?.limit, 10) || 100) }
    }), { permission: Permission.ALARM_MANAGE });
}
