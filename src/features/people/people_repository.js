import { randomUUID } from 'node:crypto';

function parseJsonSafe(val, fallback) {
    if (!val) return fallback;
    try {
        return JSON.parse(val);
    } catch {
        return fallback;
    }
}

function mapPerson(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        role: row.role ?? 'dipendente',
        department: row.department ?? '',
        specialPermissions: parseJsonSafe(row.special_permissions, []),
        face3dParams: parseJsonSafe(row.face_3d_params, {}),
        gallery: parseJsonSafe(row.gallery, []),
        sampleCount: Number(row.sample_count ?? 1),
        notes: row.notes ?? '',
        embedding: parseJsonSafe(row.embedding, []),
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
        personName: row.person_name ?? null,
        personRole: row.person_role ?? null,
        confidence: row.confidence,
        box: [row.box_x, row.box_y, row.box_w, row.box_h],
        pose3d: parseJsonSafe(row.pose_3d, {}),
        isVerified: Boolean(row.is_verified),
        correctedPersonId: row.corrected_person_id ?? null,
        hasEmbedding: parseJsonSafe(row.embedding, []).length > 0,
        snapshotPath: row.snapshot_path,
        createdAt: row.created_at
    };
}

export function createPeopleRepository(db) {
    const listPeopleStmt = db.prepare('SELECT * FROM people ORDER BY name ASC');
    const getPersonStmt = db.prepare('SELECT * FROM people WHERE id = ?');
    const insertPersonStmt = db.prepare(`
        INSERT INTO people (id, name, role, department, special_permissions, face_3d_params, gallery, sample_count, notes, embedding, photo_path, created_at, updated_at)
        VALUES (@id, @name, @role, @department, @specialPermissions, @face3dParams, @gallery, @sampleCount, @notes, @embedding, @photoPath, @createdAt, @updatedAt)
    `);
    const updatePersonStmt = db.prepare(`
        UPDATE people
        SET name = @name,
            role = @role,
            department = @department,
            special_permissions = @specialPermissions,
            face_3d_params = @face3dParams,
            gallery = @gallery,
            sample_count = @sampleCount,
            notes = @notes,
            embedding = @embedding,
            photo_path = @photoPath,
            updated_at = @updatedAt
        WHERE id = @id
    `);
    const deletePersonStmt = db.prepare('DELETE FROM people WHERE id = ?');
    const deletePersonLogsStmt = db.prepare('DELETE FROM face_logs WHERE person_id = ?');

    const insertFaceLogStmt = db.prepare(`
        INSERT INTO face_logs (id, camera_id, person_id, confidence, box_x, box_y, box_w, box_h, pose_3d, is_verified, corrected_person_id, snapshot_path, embedding, created_at)
        VALUES (@id, @cameraId, @personId, @confidence, @boxX, @boxY, @boxW, @boxH, @pose3d, @isVerified, @correctedPersonId, @snapshotPath, @embedding, @createdAt)
    `);
    const listFaceLogsStmt = db.prepare(`
        SELECT f.*, c.name AS camera_name, p.name AS person_name, p.role AS person_role
        FROM face_logs f
        LEFT JOIN cameras c ON c.id = f.camera_id
        LEFT JOIN people p ON p.id = COALESCE(f.corrected_person_id, f.person_id)
        ORDER BY f.created_at DESC
        LIMIT ? OFFSET ?
    `);
    const listFaceLogsByPersonStmt = db.prepare(`
        SELECT f.*, c.name AS camera_name, p.name AS person_name, p.role AS person_role
        FROM face_logs f
        LEFT JOIN cameras c ON c.id = f.camera_id
        LEFT JOIN people p ON p.id = COALESCE(f.corrected_person_id, f.person_id)
        WHERE COALESCE(f.corrected_person_id, f.person_id) = ?
        ORDER BY f.created_at DESC
        LIMIT ? OFFSET ?
    `);
    const correctFaceLogStmt = db.prepare(`
        UPDATE face_logs
        SET corrected_person_id = @correctedPersonId,
            is_verified = 1
        WHERE id = @id
    `);
    const mergeFaceLogsCorrectedStmt = db.prepare(`
        UPDATE face_logs
        SET corrected_person_id = @targetId
        WHERE corrected_person_id = @sourceId
    `);
    const mergeFaceLogsPersonStmt = db.prepare(`
        UPDATE face_logs
        SET person_id = @targetId
        WHERE person_id = @sourceId
    `);
    const getFaceLogStmt = db.prepare('SELECT * FROM face_logs WHERE id = ?');
    const deleteFaceLogStmt = db.prepare('DELETE FROM face_logs WHERE id = ?');
    const deleteAllFaceLogsStmt = db.prepare('DELETE FROM face_logs');
    const deleteAllPeopleStmt = db.prepare('DELETE FROM people');
    const countPeopleStmt = db.prepare('SELECT COUNT(*) AS total FROM people');
    const countFaceLogsStmt = db.prepare('SELECT COUNT(*) AS total FROM face_logs');

    return {
        listPeople() {
            return listPeopleStmt.all().map(mapPerson);
        },
        getPerson(id) {
            return mapPerson(getPersonStmt.get(id));
        },
        createPerson({ name, role = 'dipendente', department = '', specialPermissions = [], face3dParams = {}, gallery = [], sampleCount = 1, notes = '', embedding = [], photoPath = null }) {
            const now = new Date().toISOString();
            const person = {
                id: randomUUID(),
                name: name.trim(),
                role: String(role || 'dipendente').trim(),
                department: String(department || '').trim(),
                specialPermissions: JSON.stringify(Array.isArray(specialPermissions) ? specialPermissions : []),
                face3dParams: JSON.stringify(face3dParams || {}),
                gallery: JSON.stringify(Array.isArray(gallery) ? gallery.slice(0, 3) : []),
                sampleCount: Number.isInteger(sampleCount) ? sampleCount : 1,
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
                role: changes.role !== undefined ? String(changes.role).trim() : current.role,
                department: changes.department !== undefined ? String(changes.department).trim() : current.department,
                specialPermissions: changes.specialPermissions !== undefined ? JSON.stringify(changes.specialPermissions) : JSON.stringify(current.specialPermissions),
                face3dParams: changes.face3dParams !== undefined ? JSON.stringify(changes.face3dParams) : JSON.stringify(current.face3dParams),
                gallery: changes.gallery !== undefined ? JSON.stringify(changes.gallery.slice(0, 3)) : JSON.stringify(current.gallery),
                sampleCount: changes.sampleCount !== undefined ? Number(changes.sampleCount) : current.sampleCount,
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
        recordFaceLog({ cameraId, personId = null, confidence, box = [0, 0, 0, 0], pose3d = {}, isVerified = 0, correctedPersonId = null, snapshotPath = null, embedding = [], createdAt = new Date().toISOString() }) {
            const log = {
                id: randomUUID(),
                cameraId,
                personId,
                confidence,
                boxX: box[0] ?? 0,
                boxY: box[1] ?? 0,
                boxW: box[2] ?? 0,
                boxH: box[3] ?? 0,
                pose3d: JSON.stringify(pose3d || {}),
                isVerified: isVerified ? 1 : 0,
                correctedPersonId,
                snapshotPath,
                embedding: JSON.stringify(Array.isArray(embedding) ? embedding : []),
                createdAt
            };
            insertFaceLogStmt.run(log);
            return {
                id: log.id,
                cameraId: log.cameraId,
                personId: log.personId,
                confidence: log.confidence,
                box: [log.boxX, log.boxY, log.boxW, log.boxH],
                pose3d: parseJsonSafe(log.pose3d, {}),
                isVerified: Boolean(log.isVerified),
                correctedPersonId: log.correctedPersonId,
                snapshotPath: log.snapshotPath,
                createdAt: log.createdAt
            };
        },
        getFaceLog(id) {
            const row = getFaceLogStmt.get(id);
            if (!row) return null;
            return { ...mapFaceLog(row), embedding: parseJsonSafe(row.embedding, []) };
        },
        correctFaceLog(id, correctedPersonId) {
            const result = correctFaceLogStmt.run({ id, correctedPersonId });
            return result.changes > 0;
        },
        deleteFaceLog(id) {
            const result = deleteFaceLogStmt.run(id);
            return result.changes > 0;
        },
        deleteAllFaceLogs() {
            const total = countFaceLogsStmt.get().total;
            deleteAllFaceLogsStmt.run();
            return total;
        },
        deleteAllPeople() {
            const total = countPeopleStmt.get().total;
            db.transaction(() => {
                deleteAllFaceLogsStmt.run();
                deleteAllPeopleStmt.run();
            })();
            return total;
        },
        mergePerson(sourceId, targetId) {
            db.transaction(() => {
                mergeFaceLogsCorrectedStmt.run({ sourceId, targetId });
                mergeFaceLogsPersonStmt.run({ sourceId, targetId });
                deletePersonStmt.run(sourceId);
            })();
            return true;
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
