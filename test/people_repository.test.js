import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/storage/database.js';
import { createPeopleRepository } from '../src/features/people/people_repository.js';

test('gestione anagrafica persone, log volti e cancellazione totale GDPR', () => {
    const db = openDatabase({ databaseFile: ':memory:' });
    const repo = createPeopleRepository(db);

    const dummyEmbedding = [0.1, 0.2, 0.3, 0.4];
    const person = repo.createPerson({
        name: 'Mario Rossi',
        notes: 'Direzione',
        embedding: dummyEmbedding
    });

    assert.ok(person.id);
    assert.equal(person.name, 'Mario Rossi');
    assert.deepEqual(person.embedding, dummyEmbedding);

    const people = repo.listPeople();
    assert.equal(people.length, 1);
    assert.equal(people[0].name, 'Mario Rossi');

    const updated = repo.updatePerson(person.id, { name: 'Mario Rossi (Aggiornato)' });
    assert.equal(updated.name, 'Mario Rossi (Aggiornato)');

    const faceLog = repo.recordFaceLog({
        cameraId: 'cam-main',
        personId: person.id,
        confidence: 0.91,
        box: [0.1, 0.2, 0.3, 0.4]
    });

    assert.ok(faceLog.id);
    assert.equal(faceLog.personId, person.id);

    const logsBefore = repo.listFaceLogs({ personId: person.id });
    assert.equal(logsBefore.length, 1);

    const purged = repo.deletePerson(person.id);
    assert.equal(purged, true);

    const peopleAfter = repo.listPeople();
    assert.equal(peopleAfter.length, 0);

    const logsAfter = repo.listFaceLogs({ personId: person.id });
    assert.equal(logsAfter.length, 0);
});
