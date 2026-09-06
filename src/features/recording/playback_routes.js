import { serveFile } from '../../http/static_files.js';
import { cameraSegmentDir } from './segment_paths.js';
import { Permission } from '../../security/rbac.js';
import { requireId, requireString } from '../../security/guards.js';
import { notFound } from '../../kernel/errors.js';

export function registerPlaybackRoutes(router) {
    router.get('/api/archive/:id/media', async (ctx) => {
        const id = requireId(ctx.params.id, 'Camera id');
        const file = requireString(ctx.query.file, 'File', { max: 256 });

        const root = cameraSegmentDir(ctx.config, id);
        const served = serveFile(ctx.req, ctx.res, root, file, { cacheControl: 'private, max-age=3600' });

        if (!served) throw notFound('Segment');
        return { raw: true };
    }, { permission: Permission.ARCHIVE_VIEW });
}
