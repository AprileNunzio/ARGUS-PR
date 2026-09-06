import fs from 'node:fs';
import { log } from './logger.js';
import { selectBackend } from './backends/index.js';
import { createBanlist } from './banlist.js';
import { createDetector } from './detectors.js';
import { createEventWatcher } from './watcher.js';

const SAVE_INTERVAL_MS = 30000;
const PRUNE_INTERVAL_MS = 300000;

export async function createShield(config, preferredBackend) {
    const backend = await selectBackend(config, preferredBackend);
    const banlist = createBanlist(config);
    const detector = createDetector(config);

    try {
        fs.mkdirSync(config.stateDir, { recursive: true });
    } catch (error) {
        log.warn('cannot create the state directory', { message: error.message });
    }

    banlist.load();

    async function enforce(decision, reason) {
        const outcome = await backend.ban(decision.address, decision.seconds);

        if (outcome.ok) {
            log.warn('address banned', {
                address: decision.address,
                seconds: decision.seconds,
                strikes: decision.strikes,
                reason: reason ?? decision.reason
            });
        } else {
            log.error('ban not applied', { address: decision.address, detail: outcome.detail });
        }

        return outcome.ok;
    }

    async function handle(event) {
        const signal = detector.evaluate(event);
        if (!signal) return;

        if (detector.isProtected(signal.address)) {
            if (signal.weight > 0) {
                log.info('event from a protected address, no action', {
                    address: signal.address,
                    reason: signal.reason
                });
            }
            return;
        }

        if (signal.immediate) {
            const decision = banlist.forceBan(signal.address, config.banSeconds, signal.reason);
            await enforce(decision, signal.reason);
            return;
        }

        const decision = banlist.register(signal.address, signal.weight, signal.reason);
        if (decision) await enforce(decision);
    }

    return {
        backendName: backend.name,

        async apply() {
            const outcome = await backend.apply();

            if (outcome.ok) log.info('ruleset applied', { backend: backend.name, stage: outcome.stage });
            else log.error('ruleset not applied', { backend: backend.name, stage: outcome.stage, detail: outcome.detail });

            return outcome;
        },

        async restoreBans() {
            let restored = 0;
            for (const entry of banlist.active()) {
                const outcome = await backend.ban(entry.address, entry.remainingSeconds);
                if (outcome.ok) restored += 1;
            }
            if (restored > 0) log.info('bans restored', { restored });
            return restored;
        },

        async ban(address, seconds, reason) {
            if (detector.isProtected(address)) {
                return { ok: false, detail: 'indirizzo protetto da allowlist o rete locale' };
            }
            const decision = banlist.forceBan(address, seconds, reason ?? 'manuale');
            const applied = await enforce(decision, reason ?? 'manuale');
            banlist.save();
            return { ok: applied, decision };
        },

        async unban(address) {
            banlist.release(address);
            const outcome = await backend.unban(address);
            banlist.save();
            return outcome;
        },

        async status() {
            const firewall = await backend.status();
            return {
                backend: backend.name,
                firewall,
                banned: banlist.active(),
                watched: banlist.watched().slice(0, 20),
                eventsFile: config.eventsFile,
                eventsPresent: fs.existsSync(config.eventsFile)
            };
        },

        async flush() {
            const outcome = await backend.flush();
            log.warn('ruleset removed', { backend: backend.name, ok: outcome.ok });
            return outcome;
        },

        async watch({ fromBeginning = false } = {}) {
            const queue = [];
            let draining = false;

            const drain = async () => {
                if (draining) return;
                draining = true;
                while (queue.length > 0) {
                    const event = queue.shift();
                    try {
                        await handle(event);
                    } catch (error) {
                        log.error('event handling failed', { message: error.message });
                    }
                }
                draining = false;
            };

            const watcher = createEventWatcher(config, (event) => {
                queue.push(event);
                void drain();
            });

            watcher.start(fromBeginning);

            const saver = setInterval(() => banlist.save(), SAVE_INTERVAL_MS);
            const pruner = setInterval(() => banlist.prune(), PRUNE_INTERVAL_MS);
            saver.unref();
            pruner.unref();

            log.info('surveillance active', {
                backend: backend.name,
                events: config.eventsFile,
                threshold: config.scoreThreshold
            });

            return {
                stop() {
                    watcher.stop();
                    clearInterval(saver);
                    clearInterval(pruner);
                    banlist.save();
                }
            };
        }
    };
}
