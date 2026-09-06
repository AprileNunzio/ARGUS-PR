import { serveFile } from '../../http/static_files.js';
import { Permission } from '../../security/rbac.js';
import { recordAudit } from '../../security/audit.js';
import { requireId, requireString } from '../../security/guards.js';
import { validationError, notFound } from '../../kernel/errors.js';
import { createExport, verifyExport, removeExport } from './export_service.js';
import { listExports, getExport, deleteExport } from './export_repository.js';
import { assertExportId, exportDir, OUTPUT_NAME, MANIFEST_NAME, SEAL_NAME } from './export_paths.js';

const DOWNLOADABLE = new Map([
    ['video', OUTPUT_NAME],
    ['manifest', MANIFEST_NAME],
    ['seal', SEAL_NAME]
]);

function parseTimestamp(value, label) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) throw validationError(`${label} non valido`);
    return parsed;
}

export function registerExportRoutes(router) {
    router.get('/api/exports', async () => ({
        body: { exports: listExports() }
    }), { permission: Permission.ARCHIVE_EXPORT });

    router.post('/api/exports', async (ctx) => {
        const cameraId = requireId(ctx.body.cameraId, 'Camera id');
        const fromMs = parseTimestamp(ctx.body.fromMs, 'Inizio');
        const toMs = parseTimestamp(ctx.body.toMs, 'Fine');
        const reason = ctx.body.reason ? requireString(ctx.body.reason, 'Motivo', { max: 300 }) : null;

        const record = await createExport(ctx.config, {
            cameraId,
            fromMs,
            toMs,
            reason,
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            address: ctx.address
        });

        recordAudit({
            action: 'archive.export',
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            target: `${cameraId}:${record.id}`,
            remoteAddr: ctx.address,
            detail: {
                from: fromMs,
                to: toMs,
                segments: record.segmentCount,
                bytes: record.outputBytes,
                sha256: record.outputSha256,
                sourcesIntact: record.sourcesIntact,
                reason
            }
        });

        return { status: 201, body: { export: record } };
    }, {
        permission: Permission.ARCHIVE_EXPORT,
        rateLimit: { limit: 10, windowMs: 10 * 60 * 1000 }
    });

    router.get('/api/exports/:id', async (ctx) => {
        const record = getExport(assertExportId(ctx.params.id));
        if (!record) throw notFound('Export');
        return { body: { export: record } };
    }, { permission: Permission.ARCHIVE_EXPORT });

    router.get('/api/exports/:id/verify', async (ctx) => ({
        body: verifyExport(ctx.config, assertExportId(ctx.params.id))
    }), { permission: Permission.ARCHIVE_EXPORT });

    router.get('/api/exports/:id/download/:part', async (ctx) => {
        const id = assertExportId(ctx.params.id);
        const name = DOWNLOADABLE.get(ctx.params.part);
        if (!name) throw notFound('File');

        const record = getExport(id);
        if (!record || record.state !== 'ready') throw notFound('Export');

        recordAudit({
            action: 'archive.export.download',
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            target: `${id}:${ctx.params.part}`,
            remoteAddr: ctx.address,
            detail: null
        });

        const served = serveFile(ctx.req, ctx.res, exportDir(ctx.config, id), name, {
            cacheControl: 'private, no-store',
            download: `argus-${record.cameraName.replace(/[^\w-]/g, '_')}-${id.slice(0, 8)}-${name}`
        });

        if (!served) throw notFound('File');
        return { raw: true };
    }, { permission: Permission.ARCHIVE_EXPORT });

    router.delete('/api/exports/:id', async (ctx) => {
        const id = assertExportId(ctx.params.id);
        const record = removeExport(ctx.config, id);
        deleteExport(id);

        recordAudit({
            action: 'archive.export.delete',
            actorId: ctx.actor.id,
            actorName: ctx.actor.username,
            target: id,
            remoteAddr: ctx.address,
            detail: { cameraId: record.cameraId }
        });

        return { body: { removed: id } };
    }, { permission: Permission.ARCHIVE_EXPORT });
}
