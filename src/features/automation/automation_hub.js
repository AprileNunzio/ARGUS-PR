import { subscribe, Topic } from '../../kernel/event_bus.js';
import { createLogger } from '../../kernel/logger.js';
import { onShutdown } from '../../kernel/process_guard.js';
import { evaluateRule, nextState, describeEvent, TriggerKind } from './rule_matcher.js';
import { listActiveRules, getChannel, getChannelSecret, recordRun, pruneRuns } from './automation_repository.js';
import { deliver } from './channels/index.js';

const log = createLogger('automation');

const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const states = new Map();

function messageFor(rule, event, cameraName) {
    const description = describeEvent(event);
    const when = new Date(event.timestamp ?? Date.now()).toLocaleString('it-IT');

    return {
        rule: rule.name,
        event: description,
        camera: cameraName ?? event.cameraId ?? 'canale sconosciuto',
        cameraId: event.cameraId ?? null,
        timestamp: event.timestamp ?? Date.now(),
        subject: `ARGUS-PR: ${rule.name}`,
        text: `${rule.name}\n${description} su ${cameraName ?? event.cameraId ?? 'canale sconosciuto'}\n${when}`
    };
}

async function runActions(rule, event, cameraName) {
    const message = messageFor(rule, event, cameraName);
    const outcomes = [];

    for (const action of rule.actions ?? []) {
        const channel = getChannel(action.channelId);

        if (!channel) {
            outcomes.push(`${action.channelId}: canale assente`);
            continue;
        }

        const outcome = await deliver(channel, getChannelSecret(channel.id), { ...message, ...action.overrides })
            .then((result) => `${channel.name}: ${result.skipped ? result.skipped : 'consegnato'}`)
            .catch((error) => `${channel.name}: errore ${error.message}`);

        outcomes.push(outcome);
    }

    const failed = outcomes.some((entry) => entry.includes('errore'));

    recordRun({
        ruleId: rule.id,
        trigger: describeEvent(event),
        outcome: failed ? 'parziale' : 'eseguita',
        detail: outcomes.join(' | ')
    });

    if (failed) log.warn('automation partially failed', { rule: rule.name, outcomes });
    else log.info('automation executed', { rule: rule.name, actions: outcomes.length });
}

function handleEvent(kind, payload, resolveCameraName) {
    const event = { ...payload, kind, timestamp: payload.timestamp ?? Date.now() };

    for (const rule of listActiveRules()) {
        const state = states.get(rule.id);
        const verdict = evaluateRule(rule, event, { state });

        if (!verdict.fires) continue;

        states.set(rule.id, nextState(state, event.timestamp));
        runActions(rule, event, resolveCameraName(event.cameraId)).catch((error) => {
            log.error('automation crashed', { rule: rule.name, message: error.message });
        });
    }
}

export function installAutomationHub({ cameraRepository }) {
    const resolveCameraName = (cameraId) => {
        if (!cameraId) return null;
        return cameraRepository.list().find((camera) => camera.id === cameraId)?.name ?? cameraId;
    };

    const unsubscribeDetection = subscribe(Topic.DETECTION, (event) => handleEvent(TriggerKind.DETECTION, event.payload, resolveCameraName));
    const unsubscribeAccess = subscribe(Topic.ACCESS, (event) => handleEvent(TriggerKind.ACCESS, event.payload, resolveCameraName));
    const unsubscribeMotion = subscribe(Topic.MOTION, (event) => handleEvent(TriggerKind.MOTION, event.payload, resolveCameraName));

    const pruneTimer = setInterval(() => pruneRuns(), PRUNE_INTERVAL_MS);
    pruneTimer.unref();

    log.info('automation hub ready', { rules: listActiveRules().length });

    onShutdown('automation-hub', () => {
        clearInterval(pruneTimer);
        unsubscribeDetection();
        unsubscribeAccess();
        unsubscribeMotion();
    });

    return {
        async test(rule, channelId) {
            const channel = getChannel(channelId);
            if (!channel) throw new Error('Canale non trovato');

            return deliver(channel, getChannelSecret(channel.id), {
                rule: rule?.name ?? 'Prova manuale',
                event: 'prova di consegna',
                camera: 'prova',
                cameraId: null,
                timestamp: Date.now(),
                subject: 'ARGUS-PR: prova di consegna',
                text: 'Questa e una prova inviata da ARGUS-PR per verificare il canale.'
            });
        }
    };
}
