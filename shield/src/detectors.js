import { normalise, isAddress, inAnyNetwork, parseNetworks } from './addresses.js';

const WEIGHTS = Object.freeze({
    'auth.failure': 3,
    'auth.locked': 6,
    'auth.admin_from_wan': 10,
    'zone.denied': 5,
    'origin.rejected': 4,
    'rate.limited': 2,
    'route.probe': 4,
    'auth.success': -4
});

const IMMEDIATE = Object.freeze(new Set(['auth.admin_from_wan']));

export function createDetector(config) {
    const lan = parseNetworks(config.lanNetworks);
    const allow = parseNetworks(config.allowlist);

    return {
        isProtected(address) {
            if (inAnyNetwork(address, allow)) return true;
            if (!config.banLocalNetworks && inAnyNetwork(address, lan)) return true;
            return false;
        },

        evaluate(event) {
            if (!event || typeof event.kind !== 'string') return null;

            const address = normalise(event.address);
            if (!address || !isAddress(address)) return null;

            const declared = Number.isFinite(event.weight) ? Math.min(Math.abs(event.weight), 20) : 1;
            const weight = WEIGHTS[event.kind] ?? declared;

            return {
                address,
                weight,
                immediate: IMMEDIATE.has(event.kind),
                reason: event.kind,
                detail: typeof event.detail === 'string' ? event.detail : null
            };
        }
    };
}

export { WEIGHTS };
