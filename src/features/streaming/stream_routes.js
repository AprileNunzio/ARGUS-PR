import { sessionStates, stopSession } from './stream_hub.js';
import { Permission } from '../../security/rbac.js';
import { Exposure } from '../../security/net_zones.js';
import { requireId } from '../../security/guards.js';

export function registerStreamRoutes(router) {
    router.get('/api/streams', async () => ({
        body: { sessions: sessionStates() }
    }), { permission: Permission.LIVE_VIEW, exposure: Exposure.PUBLIC });

    router.delete('/api/streams/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'Camera id');
        return { body: { stopped: stopSession(id, 'operator') } };
    }, { permission: Permission.CAMERA_MANAGE });
}
