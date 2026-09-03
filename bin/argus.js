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
import { ensureTlsMaterial, desiredAltNames } from '../src/platform/tls.js';

const command = process.argv[2] ?? 'serve';

function interfaceUrl(config) {
    const address = config.host === '0.0.0.0' ? 'localhost' : config.host;
    const suffix = config.port === 443 ? '' : `:${config.port}`;
    return `https://${address}${suffix}`;
}

function printBanner(config, setup, tls) {
    const url = interfaceUrl(config);
    const provided = tls.source === 'provided';

    const lines = [
        '',
        `  ARGUS-PR ${readPackageVersion()}`,
        `  Interfaccia   ${url}`,
        `  Certificato   ${provided ? 'fornito' : 'interno autofirmato'}`,
        `  Impronta      ${tls.fingerprint}`,
        `  Accesso WAN   ${config.publicAccess ? 'attivo, sola visione' : 'disabilitato'}`,
        `  Dati          ${config.dataDir}`,
        `  Media         ${config.mediaDir}`,
        ''
    ];

    if (!provided) {
        lines.push(
            '  Il certificato non e\' emesso da un ente pubblico: il browser',
            '  avvisa finche\' non installi l\'autorita\' interna sui client.',
            `  Autorita\'     ${tls.authorityFile ?? '-'}`,
            '  Confronta sempre l\'impronta prima di accettare.',
            ''
        );
    }

    if (setup) {
        lines.push(
            '  ────────────────────────────────────────────────────',
            '  CONFIGURAZIONE INIZIALE RICHIESTA',
            '',
            `  Apri  ${url}  dalla rete locale`,
            '  e segui la procedura guidata.',
            '',
            '  Finche\' non e\' completata, chiunque raggiunga questo',
            '  indirizzo dalla rete locale puo\' creare l\'amministratore:',
            '  completala subito.',
            '  ────────────────────────────────────────────────────',
            ''
        );
    }

    process.stdout.write(lines.join('\n') + '\n');
}

async function serve() {
    const outcome = await bootstrap();

    if (outcome.upgrading) {
        process.stdout.write([
            '',
            `  ARGUS-PR ${readPackageVersion()}`,
            `  Aggiornamento a ${outcome.target} in corso.`,
            '  Il servizio si riavvia da solo; se la nuova versione non parte',
            '  viene ripristinata automaticamente quella precedente.',
            ''
        ].join('\n') + '\n');
        return;
    }

    printBanner(outcome.config, outcome.setup, outcome.tls);
}

async function cert() {
    const config = loadConfig();
    setLogLevel('warn');

    const material = ensureTlsMaterial(config);

    process.stdout.write([
        '',
        `  Origine       ${material.source === 'provided' ? 'certificato fornito' : 'autorita interna'}`,
        `  Impronta      ${material.fingerprint}`,
        `  Scadenza      ${material.notAfter}`,
        `  Autorita      ${material.authorityFile ?? '-'}`,
        `  Nomi          ${desiredAltNames(config).join(', ')}`,
        ''
    ].join('\n') + '\n');

    process.exit(0);
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
    argus cert             Show the TLS certificate fingerprint and authority

`);
    process.exit(0);
}

const commands = { serve, doctor, cert, 'reset-admin': resetAdmin, help: usage, '--help': usage, '-h': usage };
const handler = commands[command];

if (!handler) {
    process.stderr.write(`\n  Unknown command: ${command}\n`);
    usage();
}

await handler();
