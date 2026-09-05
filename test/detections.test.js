import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/storage/database.js';
import {
    createDetectionSource,
    authenticateSourceKey,
    listDetectionSources,
    deleteDetectionSource,
    insertDetectionEvent,
    listDetectionEvents,
    hasRecentEvent,
    getDetectionStats,
    countRecentOccurrences
} from '../src/features/detections/detections_repository.js';

test('gestione sorgenti di inferenza e autenticazione chiave', () => {
    openDatabase({ databaseFile: ':memory:' });

    const { source, rawKey } = createDetectionSource({ name: 'frigate-edge', cameraId: 'cam-1' });
    assert.ok(source.id);
    assert.equal(source.name, 'frigate-edge');
    assert.ok(rawKey.startsWith('argus_src_'));

    const authenticated = authenticateSourceKey(rawKey);
    assert.ok(authenticated);
    assert.equal(authenticated.id, source.id);
    assert.ok(authenticated.lastSeenAt);

    const invalid = authenticateSourceKey('argus_src_invalid_key_123');
    assert.equal(invalid, null);

    const list = listDetectionSources();
    assert.ok(list.some((s) => s.id === source.id));

    const deleted = deleteDetectionSource(source.id);
    assert.equal(deleted, true);
    assert.equal(authenticateSourceKey(rawKey), null);
});

test('inserimento e interrogazione eventi di rilevamento', () => {
    openDatabase({ databaseFile: ':memory:' });

    const now = Date.now();
    const event1 = insertDetectionEvent({
        cameraId: 'cam-2',
        source: 'yolo-worker',
        className: 'person',
        confidence: 0.94,
        box: [0.1, 0.2, 0.3, 0.4],
        startedAt: new Date(now - 10000).toISOString()
    });

    const event2 = insertDetectionEvent({
        cameraId: 'cam-2',
        source: 'plate-reader',
        className: 'plate',
        confidence: 0.88,
        plateText: 'AB123CD',
        startedAt: new Date(now - 5000).toISOString()
    });

    const all = listDetectionEvents({ cameraId: 'cam-2' });
    assert.equal(all.length, 2);

    const persons = listDetectionEvents({ cameraId: 'cam-2', className: 'person' });
    assert.equal(persons.length, 1);
    assert.equal(persons[0].id, event1.id);
    assert.deepEqual(persons[0].box, [0.1, 0.2, 0.3, 0.4]);

    const plates = listDetectionEvents({ cameraId: 'cam-2', className: 'plate' });
    assert.equal(plates.length, 1);
    assert.equal(plates[0].plateText, 'AB123CD');

    const found = hasRecentEvent('cam-2', new Date(now - 15000).toISOString(), new Date(now).toISOString());
    assert.equal(found, true);

    const notFound = hasRecentEvent('cam-2', new Date(now - 60000).toISOString(), new Date(now - 30000).toISOString());
    assert.equal(notFound, false);
});

test('rilevamento veicoli con targa associata e animali domestici e selvatici', () => {
    openDatabase({ databaseFile: ':memory:' });
    const now = Date.now();

    const car = insertDetectionEvent({
        cameraId: 'cam-gate',
        className: 'car',
        confidence: 0.95,
        plateText: 'MI987XY',
        box: [0.2, 0.3, 0.4, 0.5],
        startedAt: new Date(now - 8000).toISOString()
    });

    const dog = insertDetectionEvent({
        cameraId: 'cam-garden',
        className: 'dog',
        confidence: 0.91,
        box: [0.5, 0.6, 0.1, 0.15],
        startedAt: new Date(now - 4000).toISOString()
    });

    const horse = insertDetectionEvent({
        cameraId: 'cam-ranch',
        className: 'horse',
        confidence: 0.89,
        box: [0.1, 0.2, 0.3, 0.4],
        startedAt: new Date(now - 2000).toISOString()
    });

    assert.equal(car.className, 'car');
    assert.equal(car.plateText, 'MI987XY');

    assert.equal(dog.className, 'dog');
    assert.equal(horse.className, 'horse');

    const animals = listDetectionEvents({}).filter((e) => ['dog', 'cat', 'horse', 'cow', 'sheep', 'bear', 'bird'].includes(e.className));
    assert.equal(animals.length, 2);
});

test('attributi avanzati di abbigliamento, frequenza passaggi e statistiche transiti', () => {
    openDatabase({ databaseFile: ':memory:' });
    const now = Date.now();

    insertDetectionEvent({
        cameraId: 'cam-main',
        className: 'person',
        confidence: 0.95,
        upperColor: 'white',
        startedAt: new Date(now - 120000).toISOString()
    });

    insertDetectionEvent({
        cameraId: 'cam-main',
        className: 'person',
        confidence: 0.92,
        upperColor: 'white',
        startedAt: new Date(now - 60000).toISOString()
    });

    insertDetectionEvent({
        cameraId: 'cam-main',
        className: 'person',
        confidence: 0.89,
        upperColor: 'black',
        startedAt: new Date(now - 30000).toISOString()
    });

    insertDetectionEvent({
        cameraId: 'cam-gate',
        className: 'car',
        confidence: 0.96,
        plateText: 'TEST999',
        startedAt: new Date(now - 100000).toISOString()
    });

    insertDetectionEvent({
        cameraId: 'cam-gate',
        className: 'car',
        confidence: 0.97,
        plateText: 'TEST999',
        startedAt: new Date(now - 50000).toISOString()
    });

    const whiteDetections = listDetectionEvents({ upperColor: 'white' });
    assert.equal(whiteDetections.length, 2);
    assert.equal(whiteDetections[0].upperColor, 'white');

    const recentWhite = countRecentOccurrences({
        cameraId: 'cam-main',
        className: 'person',
        upperColor: 'white',
        windowMinutes: 10
    });
    assert.equal(recentWhite, 2);

    const recentPlate = countRecentOccurrences({
        plateText: 'TEST999',
        windowMinutes: 10
    });
    assert.equal(recentPlate, 2);

    const stats = getDetectionStats({ windowHours: 1 });
    assert.ok(stats.plates.some((p) => p.plateText === 'TEST999' && p.count === 2));
    assert.ok(stats.colors.some((c) => c.upperColor === 'white' && c.count === 2));
    assert.ok(stats.colors.some((c) => c.upperColor === 'black' && c.count === 1));
});

