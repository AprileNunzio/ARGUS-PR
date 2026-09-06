import { Exposure } from '../../security/net_zones.js';
import { readManifest, readCatalog } from './i18n_service.js';

export function registerI18nRoutes(router) {
    router.get('/api/i18n/manifest', async () => ({
        body: readManifest(),
        headers: {
            'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400'
        }
    }), { exposure: Exposure.PUBLIC });

    router.get('/api/i18n/:locale/:namespace', async (ctx) => {
        const { locale, namespace } = ctx.params;
        const catalog = readCatalog(locale, namespace);
        return {
            body: catalog,
            headers: {
                'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400'
            }
        };
    }, { exposure: Exposure.PUBLIC });
}
