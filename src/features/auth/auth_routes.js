import {
    login,
    verifyMfaLogin,
    logout,
    changePassword,
    setupMfa,
    confirmMfa,
    disableMfa,
    getMfaStatus
} from './auth_service.js';
import { requireString } from '../../security/guards.js';
import { buildCookie } from '../../http/http_utils.js';
import { Exposure, Zone } from '../../security/net_zones.js';
import { sessionTtlHoursFor } from '../settings/settings_service.js';
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
            ttlHours: sessionTtlHoursFor(ctx.config),
            zone: ctx.zone
        });

        if (result.mfaRequired) {
            return {
                status: 200,
                body: {
                    mfaRequired: true,
                    challenge: result.challenge,
                    profile: result.profile
                }
            };
        }

        const cookie = buildCookie(SESSION_COOKIE, result.session.token, {
            secure: ctx.req.socket.encrypted === true,
            maxAge: sessionTtlHoursFor(ctx.config) * 3600
        });

        return {
            status: 200,
            headers: { 'Set-Cookie': cookie },
            body: { profile: result.profile, expiresAt: result.session.expiresAt }
        };
    }, { anonymous: true, rateLimit: LOGIN_RATE_LIMIT, exposure: Exposure.PUBLIC });

    router.post('/api/auth/mfa', async (ctx) => {
        const challenge = requireString(ctx.body.challenge, 'Challenge', { max: 128 });
        const code = requireString(ctx.body.code, 'Code', { max: 64 });

        const result = await verifyMfaLogin({
            challenge,
            code,
            remoteAddr: ctx.address,
            zone: ctx.zone
        });

        const cookie = buildCookie(SESSION_COOKIE, result.session.token, {
            secure: ctx.req.socket.encrypted === true,
            maxAge: sessionTtlHoursFor(ctx.config) * 3600
        });

        return {
            status: 200,
            headers: { 'Set-Cookie': cookie },
            body: { profile: result.profile, expiresAt: result.session.expiresAt }
        };
    }, { anonymous: true, rateLimit: LOGIN_RATE_LIMIT, exposure: Exposure.PUBLIC });

    router.post('/api/auth/logout', async (ctx) => {
        logout(ctx.sessionToken, ctx.actor, ctx.address);
        const cookie = buildCookie(SESSION_COOKIE, '', {
            secure: ctx.req.socket.encrypted === true,
            maxAge: 0
        });
        return { status: 200, headers: { 'Set-Cookie': cookie }, body: { ok: true } };
    }, { allowWhilePasswordPending: true, allowWhileMfaPending: true, exposure: Exposure.PUBLIC });

    router.get('/api/auth/session', async (ctx) => ({
        body: {
            username: ctx.actor.username,
            role: ctx.actor.role,
            permissions: ctx.actor.permissions,
            mustChangePassword: ctx.actor.mustChangePassword,
            mustEnrollMfa: ctx.actor.mustEnrollMfa === true,
            mfaEnabled: ctx.actor.totpEnabled === true,
            zone: ctx.zone,
            managementAllowed: ctx.zone !== Zone.WAN
        }
    }), { allowWhilePasswordPending: true, allowWhileMfaPending: true, exposure: Exposure.PUBLIC });

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
    }, { rateLimit: { limit: 5, windowMs: 10 * 60 * 1000 }, allowWhilePasswordPending: true });

    router.get('/api/account/mfa/status', async (ctx) => ({
        body: getMfaStatus(ctx.actor.id)
    }), { allowWhileMfaPending: true });

    router.post('/api/account/mfa/setup', async (ctx) => {
        const result = await setupMfa(ctx.actor.id);
        return { body: result };
    }, { rateLimit: { limit: 10, windowMs: 10 * 60 * 1000 }, allowWhileMfaPending: true });

    router.post('/api/account/mfa/confirm', async (ctx) => {
        const code = requireString(ctx.body.code, 'Code', { max: 32 });
        const result = await confirmMfa(ctx.actor.id, code);
        return { body: result };
    }, { rateLimit: { limit: 10, windowMs: 10 * 60 * 1000 }, allowWhileMfaPending: true });

    router.post('/api/account/mfa/disable', async (ctx) => {
        const password = requireString(ctx.body.password, 'Password', { max: 200 });
        const code = requireString(ctx.body.code, 'Code', { max: 32 });
        const result = await disableMfa(ctx.actor, { password, code });
        return { body: result };
    }, { rateLimit: { limit: 5, windowMs: 10 * 60 * 1000 } });
}
