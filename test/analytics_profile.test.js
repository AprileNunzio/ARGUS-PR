import test from 'node:test';
import assert from 'node:assert/strict';
import {
    mergeProfile,
    buildWorkerProfile,
    needsWorker,
    requiredModels,
    acceptedClasses,
    faceMatchThreshold
} from '../src/features/vision/analytics_profile.js';
import { CAPABILITIES, ENGINES, enginesFor, defaultEngineFor, isEngineAllowed } from '../src/features/vision/engines_catalog.js';

const MODEL_FILES = {
    yolox_nano: 'yolox_nano.onnx',
    yolox_tiny: 'yolox_tiny.onnx',
    face_detection_yunet: 'face_detection_yunet_2023mar.onnx',
    face_recognition_sface: 'face_recognition_sface_2021dec.onnx',
    text_recognition_crnn_en: 'text_recognition_CRNN_EN_2021sep.onnx',
    face_detection_scrfd: 'scrfd_500m.onnx',
    face_recognition_mobilefacenet: 'mobilefacenet.onnx'
};

function profileOf(entries) {
    return mergeProfile(entries);
}

test('senza righe salvate solo il movimento e attivo', () => {
    const merged = profileOf([]);
    const active = merged.filter((entry) => entry.enabled).map((entry) => entry.capability);

    assert.deepEqual(active, ['motion']);
    assert.equal(needsWorker(merged), false);
    assert.deepEqual(requiredModels(merged), []);
});

test('il riconoscimento facciale non si accende senza il rilevamento volti', () => {
    const merged = profileOf([
        { capability: 'face_recognize', enabled: true, engineId: 'sface', threshold: 0.4 }
    ]);

    const recognize = merged.find((entry) => entry.capability === 'face_recognize');
    assert.equal(recognize.enabled, false);
    assert.equal(recognize.blockedBy, 'face_detect');
});

test('con volti e riconoscimento attivi il worker carica entrambi i modelli', () => {
    const merged = profileOf([
        { capability: 'face_detect', enabled: true, engineId: 'yunet', threshold: 0.7 },
        { capability: 'face_recognize', enabled: true, engineId: 'sface', threshold: 0.4 }
    ]);

    assert.equal(needsWorker(merged), true);
    assert.deepEqual(requiredModels(merged).sort(), ['face_detection_yunet', 'face_recognition_sface']);

    const worker = buildWorkerProfile(merged, MODEL_FILES);
    assert.equal(worker.tasks.faces.enabled, true);
    assert.equal(worker.tasks.faces.model, 'face_detection_yunet_2023mar.onnx');
    assert.equal(worker.tasks.faces.embed, true);
    assert.equal(worker.tasks.faces.embedModel, 'face_recognition_sface_2021dec.onnx');
    assert.equal(worker.tasks.objects.enabled, false);
    assert.equal(worker.tasks.plates.enabled, false);
    assert.equal(faceMatchThreshold(merged), 0.4);
});

test('le classi degli oggetti sono l unione delle capacita attive', () => {
    const merged = profileOf([
        { capability: 'person', enabled: true, engineId: 'yolox_nano', threshold: 0.5 },
        { capability: 'animal', enabled: true, engineId: 'yolox_nano', threshold: 0.6 }
    ]);

    const worker = buildWorkerProfile(merged, MODEL_FILES);
    assert.deepEqual(
        worker.tasks.objects.classes.sort(),
        ['bear', 'bird', 'cat', 'cow', 'dog', 'elephant', 'giraffe', 'horse', 'person', 'sheep', 'zebra']
    );
    assert.equal(worker.tasks.objects.model, 'yolox_nano.onnx');
    assert.equal(worker.tasks.objects.threshold, 0.5);
    assert.equal(acceptedClasses(merged).has('person'), true);
    assert.equal(acceptedClasses(merged).has('car'), false);
});

test('le targhe accendono comunque il rilevamento dei veicoli nel worker', () => {
    const merged = profileOf([
        { capability: 'vehicle', enabled: true, engineId: 'yolox_nano', threshold: 0.4 },
        { capability: 'plate', enabled: true, engineId: 'plate_crnn', threshold: 0.5 }
    ]);

    const worker = buildWorkerProfile(merged, MODEL_FILES);
    assert.equal(worker.tasks.plates.enabled, true);
    assert.equal(worker.tasks.plates.model, 'text_recognition_CRNN_EN_2021sep.onnx');
    assert.equal(worker.tasks.objects.classes.includes('car'), true);
    assert.deepEqual(requiredModels(merged).sort(), ['text_recognition_crnn_en', 'yolox_nano']);
});

test('un motore non consentito viene sostituito con quello predefinito', () => {
    const merged = profileOf([
        { capability: 'person', enabled: true, engineId: 'sface', threshold: 0.4 }
    ]);

    assert.equal(merged.find((entry) => entry.capability === 'person').engineId, 'yolox_nano');
    assert.equal(isEngineAllowed('person', 'sface'), false);
    assert.equal(isEngineAllowed('person', 'yolox_tiny'), true);
    assert.equal(isEngineAllowed('person', 'edge_objects'), false);
});

test('una soglia fuori scala torna al valore predefinito della capacita', () => {
    const merged = profileOf([
        { capability: 'person', enabled: true, engineId: 'yolox_nano', threshold: 12 }
    ]);

    assert.equal(merged.find((entry) => entry.capability === 'person').threshold, 0.4);
});

test('il catalogo dei motori e coerente', () => {
    for (const capability of CAPABILITIES) {
        const engines = enginesFor(capability.id);
        assert.ok(engines.length > 0, `nessun motore per ${capability.id}`);

        const fallback = defaultEngineFor(capability.id);
        assert.ok(engines.some((engine) => engine.id === fallback && engine.status === 'ready'),
            `il motore predefinito di ${capability.id} non e pronto`);
    }

    for (const engine of ENGINES) {
        assert.ok(typeof engine.license === 'string' && engine.license.length > 0, `${engine.id} senza licenza`);
        assert.ok(['ready', 'planned'].includes(engine.status), `${engine.id} con stato ignoto`);
        for (const model of engine.models) {
            assert.ok(Object.prototype.hasOwnProperty.call(MODEL_FILES, model), `modello ignoto ${model} in ${engine.id}`);
        }
    }
});
