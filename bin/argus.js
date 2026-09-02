#!/usr/bin/env node
import { bootstrap } from '../src/app.js';
import { loadConfig } from '../src/kernel/config.js';
import { setLogLevel } from '../src/kernel/logger.js';
import { installProcessGuard } from '../src/kernel/process_guard.js';
import { initVault } from '../src/security/vault.js';
import { openDatabase } from '../src/storage/database.js';
import { discoverFfmpeg } from '../src/platform/ffmpeg.js';
import { isFail } from '../src/kernel/result.js';
import { generatePassword, hashPassword } from '../src/security/password.js';
import { getDatabase } from '../src/storage/database.js';
import { readPackageVersion } from '../src/platform/version.js';

const command = process.argv[2] ?? 'serve';

function printBanner(config, credentials) {
    const lines = [
        '',
        `  ARGUS-PR ${readPackageVersion()}`,
        `  Interface   http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`,
        `  Data        ${config.dataDir}`,
        `  Media       ${config.mediaDir}`,
        ''
    ];

    if (credentials) {
        lines.push(
            '  First run: an administrator account was created.',
            `  Username   ${credentials.username}`,
            `  Password   ${credentials.password}`,
            '  This password is shown once. Change it at first login.',
            ''
        );
    }

    process.stdout.write(lines.join('\n') + '\n');
}

async function serve() {
    const { config, credentials } = await bootstrap();
    printBanner(config, credentials);
}

async function doctor() {
    installProcessGuard();
    const config = loadConfig();
    setLogLevel(config.logLevel);

    const checks = [];

    checks.push({ name: 'node', ok: true, detail: process.version });
    checks.push({ name: 'platform', ok: true, detail: `${process.platform} ${process.arch}` });
    checks.push({ name: 'dataDir', ok: true, detail: config.dataDir });

    const vault = (() => {
        try {
            return { ok: true, detail: initVault(config).keyPath };
        } catch (error) {
            return { ok: false, detail: error.message };
        }
    })();
    checks.push({ name: 'vault', ...vault });

    const database = (() => {
        try {
            openDatabase(config);
            return { ok: true, detail: config.databaseFile };
        } catch (error) {
            return { ok: false, detail: error.message };
        }
    })();
    checks.push({ name: 'database', ...database });

    const media = await discoverFfmpeg({
        ffmpegPath: config.ffmpegPath || undefined,
        ffprobePath: config.ffprobePath || undefined
    });
    checks.push(isFail(media)
        ? { name: 'ffmpeg', ok: false, detail: media.error.message }
        : { name: 'ffmpeg', ok: true, detail: `${media.value.ffmpeg.version} at ${media.value.ffmpeg.path}` });

    process.stdout.write('\n');
    for (const check of checks) {
        process.stdout.write(`  ${check.ok ? 'PASS' : 'FAIL'}  ${check.name.padEnd(10)} ${check.detail}\n`);
    }
    process.stdout.write('\n');

    process.exit(checks.every((check) => check.ok) ? 0 : 1);
}

async function resetAdmin() {
    const config = loadConfig();
    setLogLevel('warn');
    initVault(config);
    openDatabase(config);

    const username = process.argv[3] ?? 'admin';
    const password = generatePassword(20);

    const changes = getDatabase()
        .prepare('UPDATE users SET password_hash = ?, must_change_password = 1, is_active = 1 WHERE username = ?')
        .run(await hashPassword(password), username).changes;

    if (changes === 0) {
        process.stderr.write(`\n  No user named "${username}".\n\n`);
        process.exit(1);
    }

    getDatabase().prepare('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)').run(username);

    process.stdout.write(`\n  Password reset for "${username}".\n  New password: ${password}\n\n`);
    process.exit(0);
}

function usage() {
    process.stdout.write(`
  ARGUS-PR ${readPackageVersion()}

  Usage
    argus serve            Start the NVR server
    argus doctor           Verify environment and dependencies
    argus reset-admin [u]  Reset a user password (default: admin)

`);
    process.exit(0);
}

const commands = { serve, doctor, 'reset-admin': resetAdmin, help: usage, '--help': usage, '-h': usage };
const handler = commands[command];

if (!handler) {
    process.stderr.write(`\n  Unknown command: ${command}\n`);
    usage();
}

await handler();
