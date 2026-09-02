import crypto from 'node:crypto';
import os from 'node:os';
import { getDatabase } from '../../storage/database.js';
import { hashPassword, generatePassword } from '../../security/password.js';
import { issueSession } from '../../security/sessions.js';
import { Role } from '../../security/rbac.js';
import { AppError, ErrorCode } from '../../kernel/errors.js';
import { isSetupRequired } from '../setup/setup_service.js';

const KIOSK_USERNAME = '__kiosk__';
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);

export function isLoopback(address) {
    return LOOPBACK.has(String(address ?? '').trim());
}

export function assertLocalConsole(address) {
    if (!isLoopback(address)) {
        throw new AppError(ErrorCode.FORBIDDEN, 'The console is available only from the machine itself');
    }
}

async function ensureKioskUser() {
    const existing = getDatabase()
        .prepare('SELECT id FROM users WHERE username = ?')
        .get(KIOSK_USERNAME);

    if (existing) return existing.id;

    const id = crypto.randomUUID();
    getDatabase()
        .prepare(`INSERT INTO users (id, username, password_hash, role, is_active, must_change_password, created_at)
                  VALUES (?, ?, ?, ?, 1, 0, ?)`)
        .run(id, KIOSK_USERNAME, await hashPassword(generatePassword(32)), Role.VIEWER, new Date().toISOString());

    return id;
}

export async function issueConsoleSession(address, ttlHours) {
    assertLocalConsole(address);

    if (isSetupRequired()) {
        throw new AppError(ErrorCode.CONFLICT, 'Complete the initial setup before opening the console');
    }

    const id = await ensureKioskUser();
    const session = issueSession({ id }, ttlHours, { remoteAddr: address, userAgent: 'argus-console' });

    return session;
}

export function localAddresses() {
    const found = [];
    for (const [name, entries] of Object.entries(os.networkInterfaces())) {
        for (const entry of entries ?? []) {
            if (entry.family !== 'IPv4' || entry.internal) continue;
            found.push({ interface: name, address: entry.address });
        }
    }
    return found;
}
