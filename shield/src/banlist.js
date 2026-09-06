import fs from 'node:fs';
import path from 'node:path';

const MAX_TRACKED = 20000;

function decayFactor(elapsedMs, halfLifeSeconds) {
    if (halfLifeSeconds <= 0) return 0;
    return Math.pow(0.5, elapsedMs / (halfLifeSeconds * 1000));
}

export function createBanlist(config) {
    const entries = new Map();
    let dirty = false;

    function load() {
        if (!fs.existsSync(config.stateFile)) return;

        const parsed = (() => {
            try {
                return JSON.parse(fs.readFileSync(config.stateFile, 'utf8'));
            } catch {
                return null;
            }
        })();

        for (const entry of parsed?.entries ?? []) {
            if (typeof entry?.address !== 'string') continue;
            entries.set(entry.address, {
                score: Number(entry.score) || 0,
                strikes: Number(entry.strikes) || 0,
                lastSeen: Number(entry.lastSeen) || Date.now(),
                bannedUntil: Number(entry.bannedUntil) || 0,
                reason: typeof entry.reason === 'string' ? entry.reason : null
            });
        }
    }

    function save() {
        if (!dirty) return;

        const payload = {
            savedAt: new Date().toISOString(),
            entries: [...entries.entries()].map(([address, entry]) => ({ address, ...entry }))
        };

        try {
            fs.mkdirSync(path.dirname(config.stateFile), { recursive: true });
            fs.writeFileSync(config.stateFile, JSON.stringify(payload), { mode: 0o600 });
            dirty = false;
        } catch {
            dirty = true;
        }
    }

    function entryFor(address) {
        const existing = entries.get(address);
        if (existing) return existing;

        if (entries.size >= MAX_TRACKED) {
            const oldest = [...entries.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen)[0];
            if (oldest) entries.delete(oldest[0]);
        }

        const created = { score: 0, strikes: 0, lastSeen: Date.now(), bannedUntil: 0, reason: null };
        entries.set(address, created);
        return created;
    }

    function currentScore(entry, now) {
        return entry.score * decayFactor(now - entry.lastSeen, config.scoreHalfLifeSeconds);
    }

    function banDuration(strikes) {
        const scaled = config.banSeconds * Math.pow(4, Math.max(0, strikes - 1));
        return Math.min(scaled, config.maxBanSeconds);
    }

    return {
        load,
        save,

        register(address, weight, reason) {
            const now = Date.now();
            const entry = entryFor(address);

            entry.score = Math.max(0, currentScore(entry, now) + weight);
            entry.lastSeen = now;
            entry.reason = reason ?? entry.reason;
            dirty = true;

            if (entry.bannedUntil > now) return null;
            if (entry.score < config.scoreThreshold) return null;

            entry.strikes += 1;
            entry.score = 0;

            const seconds = banDuration(entry.strikes);
            entry.bannedUntil = now + seconds * 1000;

            return { address, seconds, strikes: entry.strikes, reason: entry.reason };
        },

        forceBan(address, seconds, reason) {
            const now = Date.now();
            const entry = entryFor(address);
            entry.strikes += 1;
            entry.bannedUntil = now + seconds * 1000;
            entry.reason = reason ?? 'manuale';
            entry.lastSeen = now;
            dirty = true;
            return { address, seconds, strikes: entry.strikes, reason: entry.reason };
        },

        release(address) {
            const entry = entries.get(address);
            if (!entry) return false;
            entry.bannedUntil = 0;
            entry.score = 0;
            dirty = true;
            return true;
        },

        active() {
            const now = Date.now();
            return [...entries.entries()]
                .filter(([, entry]) => entry.bannedUntil > now)
                .map(([address, entry]) => ({
                    address,
                    remainingSeconds: Math.round((entry.bannedUntil - now) / 1000),
                    strikes: entry.strikes,
                    reason: entry.reason
                }))
                .sort((a, b) => b.remainingSeconds - a.remainingSeconds);
        },

        watched() {
            const now = Date.now();
            return [...entries.entries()]
                .map(([address, entry]) => ({ address, score: Math.round(currentScore(entry, now) * 10) / 10, strikes: entry.strikes }))
                .filter((entry) => entry.score > 0)
                .sort((a, b) => b.score - a.score);
        },

        prune() {
            const now = Date.now();
            let removed = 0;

            for (const [address, entry] of entries) {
                const stale = now - entry.lastSeen > config.scoreHalfLifeSeconds * 8000;
                if (stale && entry.bannedUntil < now) {
                    entries.delete(address);
                    removed += 1;
                }
            }

            if (removed > 0) dirty = true;
            return removed;
        }
    };
}
