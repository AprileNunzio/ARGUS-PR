import { Permission } from '../../security/rbac.js';
import { Exposure } from '../../security/net_zones.js';
import { recordAudit, AuditAction } from '../../security/audit.js';
import { listCameras } from '../cameras/camera_repository.js';
import { listClips, getClip, saveClip, renameClip, deleteClip, clipPath } from './clip_library.js';
import {
    talkbackStatus,
    talkbackActive,
    listTalkbacks,
    playClip,
    closeTalkback,
    forgetTalkback
} from './talkback_service.js';

function decodePayload(value) {
    const text = String(value ?? '');
    const cleaned = text.includes(',') ? text.slice(text.indexOf(',') + 1) : text;
    return Buffer.from(cleaned, 'base64');
}

function trace(ctx, target, detail) {
    recordAudit({
        action: AuditAction.SETTINGS_CHANGED,
        actorId: ctx.actor?.id,
        actorName: ctx.actor?.username,
        target,
        remoteAddr: ctx.address,
        detail
    });
}

export function registerAudioRoutes(router) {
    router.get('/api/audio/clips', async () => ({
        body: { clips: listClips() }
    }), { permission: Permission.LIVE_VIEW, exposure: Exposure.PRIVATE });

    router.post('/api/audio/clips', async (ctx) => {
        const clip = saveClip({
            name: ctx.body?.name,
            description: ctx.body?.description,
            contentType: ctx.body?.contentType,
            data: decodePayload(ctx.body?.data)
        });

        trace(ctx, `audio.clip:${clip.id}`, { name: clip.name, bytes: clip.byteSize });
        return { body: clip };
    }, { permission: Permission.SYSTEM_MANAGE, exposure: Exposure.PRIVATE, rateLimit: { limit: 20, windowMs: 60 * 60 * 1000 } });

    router.put('/api/audio/clips/:id', async (ctx) => {
        const clip = renameClip(ctx.params.id, { name: ctx.body?.name, description: ctx.body?.description });
        if (!clip) return { status: 404, body: { error: { message: 'Clip inesistente' } } };

        trace(ctx, `audio.clip:${clip.id}`, { renamed: clip.name });
        return { body: clip };
    }, { permission: Permission.SYSTEM_MANAGE, exposure: Exposure.PRIVATE });

    router.delete('/api/audio/clips/:id', async (ctx) => {
        const removed = deleteClip(ctx.params.id);
        if (!removed) return { status: 404, body: { error: { message: 'Clip inesistente' } } };

        trace(ctx, `audio.clip:${ctx.params.id}`, { deleted: true });
        return { body: { ok: true } };
    }, { permission: Permission.SYSTEM_MANAGE, exposure: Exposure.PRIVATE });

    router.get('/api/audio/talkback', async () => {
        const cameras = listCameras().filter((camera) => camera.enabled);
        const entries = await Promise.all(cameras.map(async (camera) => ({
            cameraId: camera.id,
            name: camera.name,
            active: talkbackActive(camera.id),
            ...(await talkbackStatus(camera.id))
        })));

        return { body: { cameras: entries, open: listTalkbacks() } };
    }, { permission: Permission.LIVE_VIEW, exposure: Exposure.PRIVATE });

    router.get('/api/audio/talkback/:id', async (ctx) => ({
        body: {
            cameraId: ctx.params.id,
            active: talkbackActive(ctx.params.id),
            ...(await talkbackStatus(ctx.params.id, { refresh: ctx.query.refresh === 'true' }))
        }
    }), { permission: Permission.LIVE_VIEW, exposure: Exposure.PRIVATE });

    router.post('/api/audio/talkback/:id/clip', async (ctx) => {
        const clip = getClip(ctx.body?.clipId);
        if (!clip) return { status: 404, body: { error: { message: 'Clip inesistente' } } };

        const file = clipPath(clip.id);
        if (!file) return { status: 404, body: { error: { message: 'File della clip non trovato' } } };

        const outcome = await playClip(ctx.params.id, file, { source: `clip:${clip.name}` });

        trace(ctx, `audio.talkback:${ctx.params.id}`, { clip: clip.name, durationMs: outcome.durationMs });
        return { body: { ...outcome, clip: clip.name } };
    }, {
        permission: Permission.ALARM_ACKNOWLEDGE,
        exposure: Exposure.PRIVATE,
        rateLimit: { limit: 60, windowMs: 10 * 60 * 1000 }
    });

    router.delete('/api/audio/talkback/:id', async (ctx) => ({
        body: await closeTalkback(ctx.params.id)
    }), { permission: Permission.ALARM_ACKNOWLEDGE, exposure: Exposure.PRIVATE });

    router.delete('/api/audio/talkback/:id/probe', async (ctx) => {
        forgetTalkback(ctx.params.id);
        return { body: await talkbackStatus(ctx.params.id, { refresh: true }) };
    }, { permission: Permission.CAMERA_MANAGE, exposure: Exposure.PRIVATE });
}
