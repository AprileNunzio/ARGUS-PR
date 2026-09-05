import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDatabase } from '../../storage/database.js';
import { purgeExpiredSessions } from '../../security/sessions.js';
import { purgeLockouts } from '../../security/lockout.js';
import { invalidateSettings } from '../settings/settings_repository.js';
import { clearUpdateCache } from '../updates/update_service.js';
import { createLogger } from '../../kernel/logger.js';
import { AppError, ErrorCode } from '../../kernel/errors.js';

const run = promisify(execFile);
const log = createLogger('maintenance');

const RESTART_EXIT_CODE = 75;
const SERVICES = Object.freeze({
    'argus-pr': 'Servizio principale ARGUS-PR',
    'argus-pr-kiosk': 'Kiosk HDMI (Xorg + Chromium)',
    'argus-shield': 'Firewall perimetrale ARGUS-SHIELD'
});

export const POWER_ACTIONS = Object.freeze(['reboot', 'poweroff']);
export const CACHE_SCOPES = Object.freeze(['runtime', 'database', 'temporary', 'thumbnails']);

export function listServices() {
    return Object.entries(SERVICES).map(([id, label]) => ({ id, label }));
}

async function shell(command, args, timeout = 15000) {
    const result = await run(command, args, { windowsHide: true, shell: false, timeout, maxBuffer: 256 * 1024 })
        .catch((error) => ({ failed: true, message: error.message, stdout: error.stdout ?? '' }));

    if (result.failed) return { ok: false, output: String(result.stdout ?? '').trim(), error: result.message };
    return { ok: true, output: String(result.stdout ?? '').trim() };
}

export async function serviceStates() {
    if (process.platform !== 'linux') {
        return listServices().map((service) => ({ ...service, state: 'unmanaged', available: false }));
    }

    const states = [];
    for (const service of listServices()) {
        const active = await shell('systemctl', ['is-active', service.id], 5000);
        const enabled = await shell('systemctl', ['is-enabled', service.id], 5000);
        const state = active.output.length > 0 ? active.output : 'unknown';

        states.push({
            ...service,
            state,
            available: state !== 'unknown' && state !== 'inactive' ? true : enabled.output.length > 0,
            enabled: enabled.output === 'enabled'
        });
    }

    return states;
}

export function machineSnapshot(config) {
    const memory = { totalBytes: os.totalmem(), freeBytes: os.freemem() };

    return {
        hostname: os.hostname(),
        platform: `${os.type()} ${os.release()} ${os.arch()}`,
        uptimeSeconds: Math.round(os.uptime()),
        processUptimeSeconds: Math.round(process.uptime()),
        loadAverage: os.loadavg(),
        memory,
        dataDir: config.dataDir,
        mediaDir: config.mediaDir,
        powerSupported: process.platform === 'linux' || process.platform === 'win32'
    };
}

export function scheduleSelfRestart(delayMs = 600) {
    log.warn('operator requested a service restart');
    setTimeout(() => process.exit(RESTART_EXIT_CODE), delayMs).unref();
}

export async function restartService(serviceId) {
    if (!Object.prototype.hasOwnProperty.call(SERVICES, serviceId)) {
        throw new AppError(ErrorCode.VALIDATION, 'Servizio non gestito');
    }

    if (serviceId === 'argus-pr') {
        scheduleSelfRestart();
        return { service: serviceId, restarting: true, method: 'exit-code', message: 'Il servizio si riavvia da solo entro pochi secondi.' };
    }

    if (process.platform !== 'linux') {
        throw new AppError(ErrorCode.CONFLICT, 'Il riavvio dei servizi e disponibile solo su Linux con systemd');
    }

    const result = await shell('systemctl', ['restart', serviceId], 30000);
    if (!result.ok) {
        throw new AppError(ErrorCode.DEPENDENCY, `Riavvio di ${serviceId} non riuscito: ${result.error}`, { exposable: true });
    }

    log.warn('service restarted by the operator', { service: serviceId });
    return { service: serviceId, restarting: true, method: 'systemctl' };
}

const SYSTEMCTL_PATHS = Object.freeze(['systemctl', '/bin/systemctl', '/usr/bin/systemctl']);
const SHUTDOWN_PATHS = Object.freeze(['/sbin/shutdown', '/usr/sbin/shutdown', 'shutdown']);
const SUDO = '/usr/bin/sudo';

export const POWER_REMEDY = 'installa la regola sudo deploy/linux/argus-maintenance.sudoers in /etc/sudoers.d/argus-maintenance, '
    + 'oppure la regola polkit deploy/linux/argus-maintenance.rules in /etc/polkit-1/rules.d/, '
    + 'oppure riavvia dal terminale.';

const NOISE = /^(Failed to set wall message, ignoring:.*|Call to \w+ failed:.*)$/;

export function cleanFailure(message) {
    const lines = String(message ?? '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !NOISE.test(line));

    if (lines.length > 0) return lines.join(' ').slice(0, 240);

    const raw = String(message ?? '').trim();
    return raw.length > 0 ? raw.slice(0, 240) : 'nessun dettaglio';
}

export function powerAttempts(action) {
    const verb = action === 'reboot' ? 'reboot' : 'poweroff';
    const flag = action === 'reboot' ? '-r' : '-h';
    const attempts = [];

    for (const binary of SYSTEMCTL_PATHS) attempts.push([binary, ['--no-block', verb]]);
    for (const binary of SYSTEMCTL_PATHS) attempts.push([binary, ['--force', '--no-block', verb]]);
    for (const binary of SHUTDOWN_PATHS) attempts.push([binary, [flag, 'now']]);

    attempts.push([SUDO, ['-n', '/bin/systemctl', '--no-block', verb]]);
    attempts.push([SUDO, ['-n', '/usr/bin/systemctl', '--no-block', verb]]);
    attempts.push([SUDO, ['-n', '/sbin/shutdown', flag, 'now']]);
    attempts.push([SUDO, ['-n', '/usr/sbin/shutdown', flag, 'now']]);

    attempts.push([`/sbin/${verb}`, ['--force']]);
    attempts.push([`/sbin/${verb}`, []]);

    return attempts;
}

export async function powerAction(action) {
    if (!POWER_ACTIONS.includes(action)) {
        throw new AppError(ErrorCode.VALIDATION, 'Azione di alimentazione non ammessa');
    }

    if (process.platform === 'linux') {
        const failures = [];

        for (const [command, args] of powerAttempts(action)) {
            const result = await shell(command, args, 10000);
            if (result.ok) {
                log.warn('power action accepted', { action, command, args: args.join(' ') });
                return { action, accepted: true, command: [command, ...args].join(' ') };
            }
            failures.push(`${[command, ...args].join(' ')}: ${cleanFailure(result.error)}`);
        }

        log.error('every power method was refused', { action, attempts: failures.length });

        throw new AppError(
            ErrorCode.FORBIDDEN,
            `Nessun metodo di ${action} ha funzionato. Il servizio gira come utente non privilegiato: ${POWER_REMEDY} Dettagli: ${failures.join(' | ')}`,
            { exposable: true }
        );
    }

    if (process.platform === 'win32') {
        const args = action === 'reboot' ? ['/r', '/t', '5'] : ['/s', '/t', '5'];
        const result = await shell('shutdown', args, 10000);
        if (!result.ok) {
            throw new AppError(ErrorCode.FORBIDDEN, `Comando di alimentazione rifiutato: ${result.error}`, { exposable: true });
        }
        return { action, accepted: true };
    }

    throw new AppError(ErrorCode.CONFLICT, 'Azione di alimentazione non supportata su questa piattaforma');
}

function removeChildren(directory) {
    if (!fs.existsSync(directory)) return { files: 0, bytes: 0 };

    let files = 0;
    let bytes = 0;

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        const size = entry.isFile() ? (fs.statSync(target).size ?? 0) : 0;

        try {
            fs.rmSync(target, { recursive: true, force: true });
        } catch (error) {
            log.warn('cache entry not removed', { target, message: error.message });
            continue;
        }

        files += 1;
        bytes += size;
    }

    return { files, bytes };
}

export function clearCaches(config, scopes) {
    const requested = Array.isArray(scopes) && scopes.length > 0
        ? scopes.filter((scope) => CACHE_SCOPES.includes(scope))
        : [...CACHE_SCOPES];

    const report = { scopes: requested, sessions: 0, lockouts: 0, files: 0, bytes: 0, reclaimedBytes: 0 };

    if (requested.includes('runtime')) {
        invalidateSettings();
        clearUpdateCache();
        report.sessions = purgeExpiredSessions();
        report.lockouts = purgeLockouts();
    }

    if (requested.includes('temporary')) {
        for (const directory of [path.join(config.dataDir, 'tmp'), path.join(config.dataDir, 'cache')]) {
            const removed = removeChildren(directory);
            report.files += removed.files;
            report.bytes += removed.bytes;
        }
    }

    if (requested.includes('thumbnails')) {
        const removed = removeChildren(path.join(config.mediaDir, 'thumbnails'));
        report.files += removed.files;
        report.bytes += removed.bytes;
    }

    if (requested.includes('database')) {
        const db = getDatabase();
        const before = fs.existsSync(config.databaseFile) ? fs.statSync(config.databaseFile).size : 0;
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.exec('VACUUM');
        const after = fs.existsSync(config.databaseFile) ? fs.statSync(config.databaseFile).size : 0;
        report.reclaimedBytes = Math.max(0, before - after);
    }

    log.warn('caches cleared by the operator', report);
    return report;
}
