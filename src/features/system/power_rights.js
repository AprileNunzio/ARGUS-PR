import os from 'node:os';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const SUDOERS_FILE = '/etc/sudoers.d/argus-maintenance';
const POLKIT_FILE = '/etc/polkit-1/rules.d/49-argus-maintenance.rules';
const LOGIND_UNIT = 'systemd-logind.service';

export const Grant = Object.freeze({
    ROOT: 'root',
    SUDO: 'sudo',
    POLKIT: 'polkit',
    NONE: 'none'
});

async function probe(command, args, timeout = 4000) {
    return run(command, args, { windowsHide: true, shell: false, timeout, maxBuffer: 64 * 1024 })
        .then((result) => ({ ok: true, output: String(result.stdout ?? '').trim() }))
        .catch((error) => ({ ok: false, output: String(error.stdout ?? '').trim(), error: error.message }));
}

export function serviceAccount() {
    return os.userInfo().username;
}

export function sudoersRecipe(account = serviceAccount()) {
    return [
        `printf '${account} ALL=(root) NOPASSWD: /bin/systemctl --no-block reboot, `
            + '/bin/systemctl --no-block poweroff, /sbin/shutdown -r now, /sbin/shutdown -h now, '
            + `/bin/systemctl restart argus-pr.service\\n' > ${SUDOERS_FILE}`,
        `chmod 0440 ${SUDOERS_FILE}`,
        `visudo -cqf ${SUDOERS_FILE}`
    ].join(' && ');
}

async function sudoGrants() {
    if (!existsSync('/usr/bin/sudo') && !existsSync('/bin/sudo')) {
        return { available: false, reason: 'sudo non e installato su questa macchina' };
    }

    const listing = await probe('sudo', ['-n', '-l']);

    if (!listing.ok) {
        return { available: false, reason: 'sudo rifiuta di elencare i permessi senza password' };
    }

    const reboot = /systemctl[^\n]*reboot|shutdown[^\n]*-r/.test(listing.output);
    const poweroff = /systemctl[^\n]*poweroff|shutdown[^\n]*-h/.test(listing.output);

    return {
        available: reboot || poweroff,
        reboot,
        poweroff,
        reason: reboot || poweroff ? null : 'sudo non concede riavvio ne spegnimento a questo utente'
    };
}

export async function powerRights() {
    if (process.platform === 'win32') {
        return {
            platform: 'win32',
            grant: Grant.ROOT,
            ready: true,
            account: serviceAccount(),
            detail: 'Su Windows il servizio usa il comando shutdown di sistema.',
            remedy: null
        };
    }

    if (process.platform !== 'linux') {
        return {
            platform: process.platform,
            grant: Grant.NONE,
            ready: false,
            account: serviceAccount(),
            detail: 'Riavvio e spegnimento non sono gestiti su questo sistema operativo.',
            remedy: null
        };
    }

    const account = serviceAccount();
    const root = typeof process.getuid === 'function' && process.getuid() === 0;
    const logind = await probe('systemctl', ['is-active', LOGIND_UNIT]);
    const logindReady = logind.output === 'active';
    const polkit = existsSync(POLKIT_FILE);
    const sudo = root ? { available: false } : await sudoGrants();

    const grant = root ? Grant.ROOT : (sudo.available ? Grant.SUDO : (polkit && logindReady ? Grant.POLKIT : Grant.NONE));
    const ready = grant !== Grant.NONE;

    const detail = root
        ? 'Il servizio gira come root: riavvio e spegnimento sono diretti.'
        : ready
            ? grant === Grant.SUDO
                ? `L utente ${account} puo riavviare attraverso sudo, senza password.`
                : `La regola polkit e installata e systemd-logind risponde: ${account} puo riavviare.`
            : `L utente ${account} non ha alcun diritto di riavvio.${logindReady ? '' : ' Inoltre systemd-logind non e attivo, quindi polkit da solo non basterebbe.'}`;

    return {
        platform: 'linux',
        account,
        root,
        grant,
        ready,
        logindActive: logindReady,
        sudoersInstalled: existsSync(SUDOERS_FILE),
        polkitInstalled: polkit,
        detail,
        remedy: ready ? null : sudoersRecipe(account)
    };
}
