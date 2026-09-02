import { login, logout, changePassword } from './auth_service.js';
import { requireString } from '../../security/guards.js';
import { buildCookie } from '../../http/http_utils.js';
import { SESSION_COOKIE } from '../../http/server.js';

const LOGIN_RATE_LIMIT = Object.freeze({ limit: 8, windowMs: 5 * 60 * 1000 });

export function registerAuthRoutes(router) {
    router.post('/api/auth/login', async (ctx) => {
        const username = requireString(ctx.body.username, 'Username', { max: 64 });
        const password = requireString(ctx.body.password, 'Password', { max: 200 });

        const result = await login({
            username,
            password,
            remoteAddr: ctx.address,
            userAgent: ctx.req.headers['user-agent'] ?? null,
            ttlHours: ctx.config.sessionTtlHours
        });

        const cookie = buildCookie(SESSION_COOKIE, result.session.token, {
            secure: ctx.req.socket.encrypted === true,
            maxAge: ctx.config.sessionTtlHours * 3600
        });

        return {
            status: 200,
            headers: { 'Set-Cookie': cookie },
            body: { profile: result.profile, expiresAt: result.session.expiresAt }
        };
    }, { anonymous: true, rateLimit: LOGIN_RATE_LIMIT });

    router.post('/api/auth/logout', async (ctx) => {
        logout(ctx.sessionToken, ctx.actor, ctx.address);
        const cookie = buildCookie(SESSION_COOKIE, '', {
            secure: ctx.req.socket.encrypted === true,
            maxAge: 0
        });
        return { status: 200, headers: { 'Set-Cookie': cookie }, body: { ok: true } };
    });

    router.get('/api/auth/session', async (ctx) => ({
        body: {
            username: ctx.actor.username,
            role: ctx.actor.role,
            permissions: ctx.actor.permissions,
            mustChangePassword: ctx.actor.mustChangePassword
        }
    }));

    router.post('/api/auth/password', async (ctx) => {
        const currentPassword = requireString(ctx.body.currentPassword, 'Current password', { max: 200 });
        const newPassword = requireString(ctx.body.newPassword, 'New password', { max: 200 });

        await changePassword({
            actor: ctx.actor,
            currentPassword,
            newPassword,
            remoteAddr: ctx.address
        });

        return { body: { ok: true } };
    }, { rateLimit: { limit: 5, windowMs: 10 * 60 * 1000 } });
}
