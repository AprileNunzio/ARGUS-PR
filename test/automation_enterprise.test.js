import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTemplate, buildTemplateContext } from '../src/features/automation/template_engine.js';
import { calculateSunTimes, isSunUp } from '../src/features/automation/solar_calc.js';
import { evaluateRule, TriggerKind } from '../src/features/automation/rule_matcher.js';

test('template engine interpola correttamente le variabili dell evento', () => {
    const context = {
        rule_name: 'Persona Sospetta',
        camera: 'Cancello Principale',
        plate: 'AB123CD',
        upper_color: 'bianco',
        dwell_formatted: '150s'
    };

    const template = 'Allarme {rule_name}: rilevata auto {plate} con maglia {upper_color} su {camera} (stazionamento {dwell_formatted})';
    const formatted = formatTemplate(template, context);

    assert.equal(formatted, 'Allarme Persona Sospetta: rilevata auto AB123CD con maglia bianco su Cancello Principale (stazionamento 150s)');
});

test('solar calc calcola correttamente alba e tramonto a Roma', () => {
    const summerSolstice = new Date('2026-06-21T12:00:00Z');
    const times = calculateSunTimes(summerSolstice, 41.9028, 12.4964);

    assert.equal(times.polarNight, false);
    assert.equal(times.polarDay, false);
    assert.ok(times.sunrise < times.sunset);

    const noon = new Date('2026-06-21T11:00:00Z');
    assert.equal(isSunUp(noon, 41.9028, 12.4964), true);

    const midnight = new Date('2026-06-21T23:30:00Z');
    assert.equal(isSunUp(midnight, 41.9028, 12.4964), false);
});

test('rule matcher supporta loitering (minDwellSeconds)', () => {
    const loiteringRule = {
        id: 'r_loit',
        name: 'Stazionamento oltre 60s',
        enabled: true,
        triggerKind: TriggerKind.DETECTION,
        minDwellSeconds: 60
    };

    const quickEvent = { kind: TriggerKind.DETECTION, className: 'person', dwellSeconds: 15 };
    assert.equal(evaluateRule(loiteringRule, quickEvent).fires, false);

    const dwellingEvent = { kind: TriggerKind.DETECTION, className: 'person', dwellSeconds: 95 };
    assert.equal(evaluateRule(loiteringRule, dwellingEvent).fires, true);
});

test('rule matcher supporta stati impianto di sicurezza (armStates)', () => {
    const armedRule = {
        id: 'r_arm',
        name: 'Solo quando fuori casa',
        enabled: true,
        triggerKind: TriggerKind.DETECTION,
        armStates: ['armed_away']
    };

    const event = { kind: TriggerKind.DETECTION, className: 'person' };
    assert.equal(evaluateRule(armedRule, event, { currentArmState: 'disarmed' }).fires, false);
    assert.equal(evaluateRule(armedRule, event, { currentArmState: 'armed_home' }).fires, false);
    assert.equal(evaluateRule(armedRule, event, { currentArmState: 'armed_away' }).fires, true);
});
