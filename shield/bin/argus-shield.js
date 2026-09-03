#!/usr/bin/env node
import { loadShieldConfig } from '../src/config.js';
import { createShield } from '../src/service.js';
import { buildRuleset } from '../src/ruleset.js';
import { isAddress } from '../src/addresses.js';
import { log, print, setLevel } from '../src/logger.js';

const args = process.argv.slice(2);
const command = args[0] ?? 'help';

function flag(name) {
    return args.includes('--' + name);
}

function option(name, fallback) {
    const index = args.indexOf('--' + name);
    return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
}

function preferredBackend() {
    return option('backend', flag('report-only') ? 'report-only' : undefined);
}

function usage() {
    print(`
  ARGUS-SHIELD

  Uso
    argus-shield apply              Applica il ruleset e ripristina i blocchi
    argus-shield watch              Applica e resta in ascolto degli eventi
    argus-shield status             Mostra backend, blocchi e sorveglianza
    argus-shield ban <ip> [sec]     Blocca un indirizzo
    argus-shield unban <ip>         Sblocca un indirizzo
    argus-shield ruleset            Stampa il ruleset senza applicarlo
    argus-shield flush              Rimuove ogni regola di ARGUS-SHIELD

  Opzioni
    --backend <nftables|netsh|report-only>
    --config <file>
    --dry-run
    --from-beginning                In watch, rilegge tutto lo storico eventi
`);
}

function configure() {
    const overrides = {};
    const configFile = option('config', undefined);
    if (configFile) overrides.configFile = configFile;
    if (flag('dry-run')) overrides.dryRun = true;
    if (flag('verbose')) setLevel('debug');
    return loadShieldConfig(overrides);
}

async function main() {
    if (command === 'help' || command === '--help' || command === '-h') {
        usage();
        return 0;
    }

    const config = configure();

    if (command === 'ruleset') {
        print(buildRuleset(config));
        return 0;
    }

    const shield = await createShield(config, preferredBackend());

    if (command === 'apply') {
        const outcome = await shield.apply();
        if (!outcome.ok) return 1;
        await shield.restoreBans();
        return 0;
    }

    if (command === 'status') {
        const status = await shield.status();
        print('');
        print(`  Backend        ${status.backend}`);
        print(`  Ruleset        ${status.firewall.installed ? 'attivo' : 'non attivo'}`);
        print(`  Eventi         ${status.eventsFile}${status.eventsPresent ? '' : '  (assente)'}`);
        print(`  Bloccati       ${status.banned.length}`);
        for (const entry of status.banned.slice(0, 20)) {
            print(`    ${entry.address.padEnd(40)} ${entry.remainingSeconds}s  strike ${entry.strikes}  ${entry.reason ?? ''}`);
        }
        print(`  Sorvegliati    ${status.watched.length}`);
        for (const entry of status.watched.slice(0, 10)) {
            print(`    ${entry.address.padEnd(40)} punteggio ${entry.score}`);
        }
        print('');
        return 0;
    }

    if (command === 'ban') {
        const address = args[1];
        if (!isAddress(address)) {
            log.error('indirizzo non valido');
            return 1;
        }
        const seconds = Number.parseInt(args[2] ?? String(config.banSeconds), 10);
        const outcome = await shield.ban(address, Number.isInteger(seconds) && seconds > 0 ? seconds : config.banSeconds);
        if (!outcome.ok) {
            log.error('blocco non applicato', { detail: outcome.detail });
            return 1;
        }
        return 0;
    }

    if (command === 'unban') {
        const address = args[1];
        if (!isAddress(address)) {
            log.error('indirizzo non valido');
            return 1;
        }
        const outcome = await shield.unban(address);
        return outcome.ok ? 0 : 1;
    }

    if (command === 'flush') {
        const outcome = await shield.flush();
        return outcome.ok ? 0 : 1;
    }

    if (command === 'watch') {
        const outcome = await shield.apply();
        if (!outcome.ok && !config.dryRun) return 1;

        await shield.restoreBans();
        const session = await shield.watch({ fromBeginning: flag('from-beginning') });

        const stop = () => {
            session.stop();
            process.exit(0);
        };

        process.on('SIGINT', stop);
        process.on('SIGTERM', stop);

        return new Promise(() => {});
    }

    log.error('comando sconosciuto', { command });
    usage();
    return 1;
}

process.exitCode = await main();
