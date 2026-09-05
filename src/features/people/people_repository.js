import { randomUUID } from 'node:crypto';

function mapPerson(row) {
    if (!row) return null;
    let emb = [];
    try {
        emb = JSON.parse(row.embedding);
    } catch {
        emb = [];
    }
    return {
        id: row.id,
        name: row.name,
        notes: row.notes,
        embedding: emb,
        photoPath: row.photo_path,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function mapFaceLog(row) {
    if (!row) return null;
    return {
        id: row.id,
        cameraId: row.camera_id,
        cameraName: row.camera_name ?? row.camera_id,
        personId: row.person_id,
        confidence: row.confidence,
        box: [row.box_x, row.box_y, row.box_w, row.box_h],
        snapshotPath: row.snapshot_path,
        createdAt: row.created_at
    };
}

export function createPeopleRepository(db) {
    const listPeopleStmt = db.prepare('SELECT * FROM people ORDER BY name ASC');
    const getPersonStmt = db.prepare('SELECT * FROM people WHERE id = ?');
    const insertPersonStmt = db.prepare(`
        INSERT INTO people (id, name, notes, embedding, photo_path, created_at, updated_at)
        VALUES (@id, @name, @notes, @embedding, @photoPath, @createdAt, @updatedAt)
    `);
    const updatePersonStmt = db.prepare(`
        UPDATE people
        SET name = @name,
            notes = @notes,
            embedding = @embedding,
            photo_path = @photoPath,
            updated_at = @updatedAt
        WHERE id = @id
    `);
    const deletePersonStmt = db.prepare('DELETE FROM people WHERE id = ?');
    const deletePersonLogsStmt = db.prepare('DELETE FROM face_logs WHERE person_id = ?');

    const insertFaceLogStmt = db.prepare(`
        INSERT INTO face_logs (id, camera_id, person_id, confidence, box_x, box_y, box_w, box_h, snapshot_path, created_at)
        VALUES (@id, @cameraId, @personId, @confidence, @boxX, @boxY, @boxW, @boxH, @snapshotPath, @createdAt)
    `);
    const listFaceLogsStmt = db.prepare('SELECT f.*, c.name AS camera_name FROM face_logs f LEFT JOIN cameras c ON c.id = f.camera_id ORDER BY f.created_at DESC LIMIT ? OFFSET ?');
    const listFaceLogsByPersonStmt = db.prepare('SELECT f.*, c.name AS camera_name FROM face_logs f LEFT JOIN cameras c ON c.id = f.camera_id WHERE f.person_id = ? ORDER BY f.created_at DESC LIMIT ? OFFSET ?');

    return {
        listPeople() {
            return listPeopleStmt.all().map(mapPerson);
        },
        getPerson(id) {
            return mapPerson(getPersonStmt.get(id));
        },
        createPerson({ name, notes = '', embedding = [], photoPath = null }) {
            const now = new Date().toISOString();
            const person = {
                id: randomUUID(),
                name: name.trim(),
                notes: String(notes ?? '').trim(),
                embedding: JSON.stringify(embedding),
                photoPath,
                createdAt: now,
                updatedAt: now
            };
            insertPersonStmt.run(person);
            return this.getPerson(person.id);
        },
        updatePerson(id, changes) {
            const current = this.getPerson(id);
            if (!current) return null;
            const now = new Date().toISOString();
            const updated = {
                id,
                name: changes.name !== undefined ? changes.name.trim() : current.name,
                notes: changes.notes !== undefined ? String(changes.notes).trim() : current.notes,
                embedding: changes.embedding !== undefined ? JSON.stringify(changes.embedding) : JSON.stringify(current.embedding),
                photoPath: changes.photoPath !== undefined ? changes.photoPath : current.photoPath,
                updatedAt: now
            };
            updatePersonStmt.run(updated);
            return this.getPerson(id);
        },
        deletePerson(id) {
            const purge = db.transaction(() => {
                deletePersonLogsStmt.run(id);
                return deletePersonStmt.run(id);
            });
            const result = purge();
            return result.changes > 0;
        },
        recordFaceLog({ cameraId, personId = null, confidence, box = [0, 0, 0, 0], snapshotPath = null, createdAt = new Date().toISOString() }) {
            const log = {
                id: randomUUID(),
                cameraId,
                personId,
                confidence,
                boxX: box[0] ?? 0,
                boxY: box[1] ?? 0,
                boxW: box[2] ?? 0,
                boxH: box[3] ?? 0,
                snapshotPath,
                createdAt
            };
            insertFaceLogStmt.run(log);
            return {
                id: log.id,
                cameraId: log.cameraId,
                personId: log.personId,
                confidence: log.confidence,
                box: [log.boxX, log.boxY, log.boxW, log.boxH],
                snapshotPath: log.snapshotPath,
                createdAt: log.createdAt
            };
        },

        listFaceLogs({ limit = 50, offset = 0, personId = null } = {}) {
            const lim = Math.min(Math.max(1, limit), 200);
            const off = Math.max(0, offset);
            if (personId) {
                return listFaceLogsByPersonStmt.all(personId, lim, off).map(mapFaceLog);
            }
            return listFaceLogsStmt.all(lim, off).map(mapFaceLog);
        }
    };
}
