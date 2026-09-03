import { spawn } from 'node:child_process';
import { isAddress } from '../addresses.js';

const BINARY = 'netsh';
const PREFIX = 'ARGUS-SHIELD';

function run(args) {
    return new Promise((resolve) => {
        const child = spawn(BINARY, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.on('error', (error) => resolve({ ok: false, stdout, stderr: error.message }));
        child.on('close', (code) => resolve({ ok: code === 0, stdout, stderr }));
    });
}

function banRuleName(address) {
    return `${PREFIX} ban ${address}`;
}

export function createNetshBackend(config) {
    return {
        name: 'netsh',

        async available() {
            const outcome = await run(['advfirewall', 'show', 'allprofiles', 'state']);
            return outcome.ok;
        },

        async apply() {
            if (config.dryRun) return { ok: true, stage: 'dry-run', detail: null };

            const steps = [
                ['advfirewall', 'set', 'allprofiles', 'state', 'on'],
                ['advfirewall', 'set', 'allprofiles', 'firewallpolicy', 'blockinbound,allowoutbound']
            ];

            for (const port of config.publicPorts) {
                steps.push([
                    'advfirewall', 'firewall', 'add', 'rule',
                    `name=${PREFIX} public ${port}`,
                    'dir=in', 'action=allow', 'protocol=TCP', `localport=${port}`
                ]);
            }

            for (const port of config.localOnlyPorts) {
                steps.push([
                    'advfirewall', 'firewall', 'add', 'rule',
                    `name=${PREFIX} local ${port}`,
                    'dir=in', 'action=allow', 'protocol=TCP', `localport=${port}`,
                    `remoteip=${config.lanNetworks.join(',')}`
                ]);
            }

            for (const step of steps) {
                const outcome = await run(step);
                if (!outcome.ok) return { ok: false, stage: 'apply', detail: outcome.stderr.trim() || outcome.stdout.trim() };
            }

            return { ok: true, stage: 'applied', detail: null };
        },

        async ban(address) {
            if (!isAddress(address)) return { ok: false, detail: 'invalid address' };
            if (config.dryRun) return { ok: true, detail: 'dry-run' };

            const outcome = await run([
                'advfirewall', 'firewall', 'add', 'rule',
                `name=${banRuleName(address)}`,
                'dir=in', 'action=block', `remoteip=${address}`
            ]);

            return outcome.ok ? { ok: true } : { ok: false, detail: outcome.stderr.trim() };
        },

        async unban(address) {
            if (!isAddress(address)) return { ok: false, detail: 'invalid address' };
            if (config.dryRun) return { ok: true, detail: 'dry-run' };

            const outcome = await run(['advfirewall', 'firewall', 'delete', 'rule', `name=${banRuleName(address)}`]);
            return outcome.ok ? { ok: true } : { ok: false, detail: outcome.stderr.trim() };
        },

        async listBanned() {
            const outcome = await run(['advfirewall', 'firewall', 'show', 'rule', 'name=all']);
            if (!outcome.ok) return [];

            const entries = [];
            for (const line of outcome.stdout.split('\n')) {
                const match = line.match(new RegExp(`${PREFIX} ban ([0-9a-f.:]+)`, 'i'));
                if (match) entries.push({ address: match[1], expiresInSeconds: null });
            }
            return entries;
        },

        async flush() {
            if (config.dryRun) return { ok: true, detail: 'dry-run' };

            const listing = await run(['advfirewall', 'firewall', 'show', 'rule', 'name=all']);
            if (!listing.ok) return { ok: false, detail: listing.stderr.trim() };

            const names = new Set();
            for (const line of listing.stdout.split('\n')) {
                const match = line.match(/^\s*(?:Rule Name|Nome regola):\s*(.+?)\s*$/i);
                if (match && match[1].startsWith(PREFIX)) names.add(match[1]);
            }

            for (const name of names) {
                await run(['advfirewall', 'firewall', 'delete', 'rule', `name=${name}`]);
            }

            return { ok: true, detail: `${names.size} regole rimosse` };
        },

        async status() {
            const outcome = await run(['advfirewall', 'show', 'allprofiles', 'state']);
            return { installed: outcome.ok, detail: outcome.ok ? null : outcome.stderr.trim() };
        }
    };
}
