import { createNftablesBackend } from './nftables.js';
import { createNetshBackend } from './netsh.js';
import { buildRuleset } from '../ruleset.js';

function createReportOnlyBackend(config) {
    const banned = new Map();

    return {
        name: 'report-only',
        async available() { return true; },
        async apply() { return { ok: true, stage: 'report-only', detail: buildRuleset(config) }; },
        async ban(address, seconds) {
            banned.set(address, Date.now() + seconds * 1000);
            return { ok: true };
        },
        async unban(address) {
            banned.delete(address);
            return { ok: true };
        },
        async listBanned() {
            const now = Date.now();
            return [...banned.entries()]
                .filter(([, expiry]) => expiry > now)
                .map(([address, expiry]) => ({ address, expiresInSeconds: Math.round((expiry - now) / 1000) }));
        },
        async flush() {
            banned.clear();
            return { ok: true };
        },
        async status() { return { installed: false, detail: 'nessun motore firewall disponibile' }; }
    };
}

export async function selectBackend(config, preferred) {
    const candidates = [];

    if (preferred === 'nftables') candidates.push(createNftablesBackend(config));
    else if (preferred === 'netsh') candidates.push(createNetshBackend(config));
    else if (preferred === 'report-only') candidates.push(createReportOnlyBackend(config));
    else if (process.platform === 'win32') candidates.push(createNetshBackend(config), createNftablesBackend(config));
    else candidates.push(createNftablesBackend(config), createNetshBackend(config));

    for (const candidate of candidates) {
        if (await candidate.available()) return candidate;
    }

    return createReportOnlyBackend(config);
}
