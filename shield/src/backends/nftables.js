import { spawn } from 'node:child_process';
import { family, isAddress } from '../addresses.js';
import { buildRuleset, TABLE } from '../ruleset.js';

const BINARY = 'nft';

function run(args, input) {
    return new Promise((resolve) => {
        const child = spawn(BINARY, args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.on('error', (error) => resolve({ ok: false, code: -1, stdout, stderr: error.message }));
        child.on('close', (code) => resolve({ ok: code === 0, code, stdout, stderr }));

        if (input !== undefined) child.stdin.end(input);
        else child.stdin.end();
    });
}

function setFor(address) {
    const kind = family(address);
    if (kind === 'ipv4') return 'banned4';
    if (kind === 'ipv6') return 'banned6';
    return null;
}

export function createNftablesBackend(config) {
    return {
        name: 'nftables',

        async available() {
            const outcome = await run(['--version']);
            return outcome.ok;
        },

        async apply() {
            const ruleset = buildRuleset(config);

            const validation = await run(['-c', '-f', '-'], ruleset);
            if (!validation.ok) {
                return { ok: false, stage: 'validate', detail: validation.stderr.trim() };
            }

            if (config.dryRun) return { ok: true, stage: 'dry-run', detail: ruleset };

            const applied = await run(['-f', '-'], ruleset);
            return applied.ok
                ? { ok: true, stage: 'applied', detail: null }
                : { ok: false, stage: 'apply', detail: applied.stderr.trim() };
        },

        async ban(address, seconds) {
            if (!isAddress(address)) return { ok: false, detail: 'invalid address' };
            const target = setFor(address);
            if (!target) return { ok: false, detail: 'unsupported family' };
            if (config.dryRun) return { ok: true, detail: 'dry-run' };

            const outcome = await run([
                'add', 'element', 'inet', TABLE, target,
                `{ ${address} timeout ${Math.max(1, Math.floor(seconds))}s }`
            ]);

            return outcome.ok ? { ok: true } : { ok: false, detail: outcome.stderr.trim() };
        },

        async unban(address) {
            if (!isAddress(address)) return { ok: false, detail: 'invalid address' };
            const target = setFor(address);
            if (!target) return { ok: false, detail: 'unsupported family' };
            if (config.dryRun) return { ok: true, detail: 'dry-run' };

            const outcome = await run(['delete', 'element', 'inet', TABLE, target, `{ ${address} }`]);
            return outcome.ok ? { ok: true } : { ok: false, detail: outcome.stderr.trim() };
        },

        async listBanned() {
            const entries = [];

            for (const target of ['banned4', 'banned6']) {
                const outcome = await run(['-j', 'list', 'set', 'inet', TABLE, target]);
                if (!outcome.ok) continue;

                const parsed = (() => {
                    try {
                        return JSON.parse(outcome.stdout);
                    } catch {
                        return null;
                    }
                })();

                for (const node of parsed?.nftables ?? []) {
                    for (const element of node.set?.elem ?? []) {
                        const value = typeof element === 'string' ? element : element.elem?.val;
                        const expires = typeof element === 'string' ? null : element.elem?.expires;
                        if (value) entries.push({ address: value, expiresInSeconds: expires ?? null });
                    }
                }
            }

            return entries;
        },

        async flush() {
            if (config.dryRun) return { ok: true, detail: 'dry-run' };
            const outcome = await run(['delete', 'table', 'inet', TABLE]);
            return outcome.ok ? { ok: true } : { ok: false, detail: outcome.stderr.trim() };
        },

        async status() {
            const outcome = await run(['list', 'table', 'inet', TABLE]);
            return { installed: outcome.ok, detail: outcome.ok ? null : outcome.stderr.trim() };
        }
    };
}
