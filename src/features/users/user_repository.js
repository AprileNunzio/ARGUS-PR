import { randomUUID } from 'node:crypto';
import { getDatabase } from '../../storage/database.js';
import { roleExists, permissionsFor, Role } from '../../security/rbac.js';
import { hashPassword, assessPassword } from '../../security/password.js';
import { sanitiseProfile, fullName, profileCompleteness } from './user_profile.js';

const USERNAME = /^[a-zA-Z0-9._-]{3,32}$/;

export function toPublic(row) {
    if (!row) return null;

    return {
        id: row.id,
        username: row.username,
        role: row.role,
        permissions: permissionsFor(row.role),
        active: row.is_active === 1,
        mustChangePassword: row.must_change_password === 1,
        mfaEnabled: row.totp_enabled === 1,
        mfaConfirmedAt: row.totp_confirmed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastLoginAt: row.last_login_at,
        firstName: row.first_name,
        lastName: row.last_name,
        fullName: fullName(row),
        email: row.email,
        emailVerifiedAt: row.email_verified_at,
        phone: row.phone,
        birthDate: row.birth_date,
        birthPlace: row.birth_place,
        taxCode: row.tax_code,
        address: row.address,
        city: row.city,
        province: row.province,
        postalCode: row.postal_code,
        country: row.country,
        jobTitle: row.job_title,
        department: row.department,
        emergencyContact: row.emergency_contact,
        emergencyPhone: row.emergency_phone,
        language: row.language,
        notifyEmail: row.notify_email === 1,
        notifyAlarm: row.notify_alarm === 1,
        notifySystem: row.notify_system === 1,
        notifyDigest: row.notify_digest === 1,
        notes: row.notes,
        completeness: profileCompleteness(row)
    };
}

export function listUsers() {
    return getDatabase().prepare('SELECT * FROM users ORDER BY username').all().map(toPublic);
}

export function getUser(id) {
    return toPublic(getDatabase().prepare('SELECT * FROM users WHERE id = ?').get(id));
}

export function getUserRow(id) {
    return getDatabase().prepare('SELECT * FROM users WHERE id = ?').get(id) ?? null;
}

export function findByEmail(email) {
    if (!email) return null;
    return getDatabase().prepare('SELECT * FROM users WHERE email = ?').get(email) ?? null;
}

export function countAdmins({ excluding = null } = {}) {
    const row = excluding
        ? getDatabase().prepare('SELECT COUNT(*) AS total FROM users WHERE role = ? AND is_active = 1 AND id <> ?').get(Role.ADMIN, excluding)
        : getDatabase().prepare('SELECT COUNT(*) AS total FROM users WHERE role = ? AND is_active = 1').get(Role.ADMIN);

    return row.total;
}

export function requireUsername(value) {
    const username = String(value ?? '').trim();
    if (!USERNAME.test(username)) {
        throw new Error('Nome utente non valido: da 3 a 32 caratteri fra lettere, numeri, punto, trattino e trattino basso');
    }
    return username.toLowerCase();
}

export function requireRole(value) {
    const role = String(value ?? '').trim();
    if (!roleExists(role)) throw new Error('Ruolo sconosciuto');
    return role;
}

function assertEmailFree(email, excluding = null) {
    if (!email) return;

    const existing = findByEmail(email);
    if (existing && existing.id !== excluding) throw new Error('Questa email e gia associata a un altro utente');
}

export async function createUser(payload) {
    const username = requireUsername(payload.username);
    const role = requireRole(payload.role);
    const profile = sanitiseProfile(payload);

    if (getDatabase().prepare('SELECT id FROM users WHERE username = ?').get(username)) {
        throw new Error('Nome utente gia in uso');
    }

    assertEmailFree(profile.email);

    const problems = assessPassword(payload.password);
    if (problems.length > 0) throw new Error(`Password troppo debole: ${problems.join(', ')}`);

    const id = randomUUID();
    const now = new Date().toISOString();
    const columns = ['id', 'username', 'password_hash', 'role', 'is_active', 'must_change_password', 'created_at', 'updated_at'];
    const values = [
        id,
        username,
        await hashPassword(payload.password),
        role,
        payload.active === false ? 0 : 1,
        payload.mustChangePassword === false ? 0 : 1,
        now,
        now
    ];

    for (const [column, value] of Object.entries(profile)) {
        columns.push(column);
        values.push(value);
    }

    getDatabase()
        .prepare(`INSERT INTO users (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
        .run(...values);

    return getUser(id);
}

export function updateProfile(id, patch) {
    const existing = getUserRow(id);
    if (!existing) return null;

    const profile = sanitiseProfile(patch, { partial: true });
    assertEmailFree(profile.email, id);

    if (profile.email !== undefined && profile.email !== existing.email) profile.email_verified_at = null;

    const assignments = Object.keys(profile).map((column) => `${column} = ?`);
    assignments.push('updated_at = ?');

    getDatabase()
        .prepare(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`)
        .run(...Object.values(profile), new Date().toISOString(), id);

    return getUser(id);
}

export function updateAccess(id, { role, active }) {
    const existing = getUserRow(id);
    if (!existing) return null;

    const nextRole = role === undefined ? existing.role : requireRole(role);
    const nextActive = active === undefined ? existing.is_active === 1 : active === true;

    const losesAdmin = existing.role === Role.ADMIN && (nextRole !== Role.ADMIN || !nextActive);
    if (losesAdmin && countAdmins({ excluding: id }) === 0) {
        throw new Error('Deve restare almeno un amministratore attivo');
    }

    getDatabase()
        .prepare('UPDATE users SET role = ?, is_active = ?, updated_at = ? WHERE id = ?')
        .run(nextRole, nextActive ? 1 : 0, new Date().toISOString(), id);

    return getUser(id);
}

export async function replacePassword(id, password, { mustChange = false } = {}) {
    const problems = assessPassword(password);
    if (problems.length > 0) throw new Error(`Password troppo debole: ${problems.join(', ')}`);

    const hash = await hashPassword(password);

    getDatabase()
        .prepare('UPDATE users SET password_hash = ?, must_change_password = ?, updated_at = ? WHERE id = ?')
        .run(hash, mustChange ? 1 : 0, new Date().toISOString(), id);

    return getUser(id);
}

export function markEmailVerified(id) {
    getDatabase()
        .prepare('UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), new Date().toISOString(), id);
}

export function deleteUser(id) {
    const existing = getUserRow(id);
    if (!existing) return false;

    if (existing.role === Role.ADMIN && countAdmins({ excluding: id }) === 0) {
        throw new Error('Deve restare almeno un amministratore attivo');
    }

    return getDatabase().prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
}
