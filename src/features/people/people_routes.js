import { requireId, requireString, optionalString, requireEmbedding } from '../../security/guards.js';
import { notFound } from '../../kernel/errors.js';
import { Permission } from '../../security/rbac.js';
import { recordAudit } from '../../security/audit.js';
import { findBestMatch, updateMovingCentroid } from '../vision/face_matcher.js';
import { blendFaceGeometry } from '../vision/face_geometry.js';
import { createFaceEnrollService } from './face_enroll_service.js';

const CORRECTION_LEARNING_WEIGHT = 0.7;

function learnFromCorrectedLog(peopleRepository, personId, log) {
    if (!personId || !log || !Array.isArray(log.embedding) || log.embedding.length === 0) return false;
    const person = peopleRepository.getPerson(personId);
    if (!person) return false;

    const current = Array.isArray(person.embedding) ? person.embedding : [];
    const embedding = current.length === log.embedding.length
        ? updateMovingCentroid(current, log.embedding, CORRECTION_LEARNING_WEIGHT)
        : log.embedding;

    const gallery = Array.isArray(person.gallery) ? person.gallery.slice(0, 3) : [];
    if (log.snapshotPath && gallery.length < 3 && !gallery.includes(log.snapshotPath)) {
        gallery.push(log.snapshotPath);
    }

    const changes = {
        embedding,
        gallery,
        sampleCount: (person.sampleCount || 1) + 1,
        photoPath: person.photoPath ?? log.snapshotPath ?? null
    };

    const geometry = blendFaceGeometry(person.face3dParams ?? {}, {
        biometrics: log.pose3d?.biometrics,
        pose: log.pose3d ?? {},
        confidence: log.confidence ?? 0
    });
    if (geometry) changes.face3dParams = geometry;

    peopleRepository.updatePerson(personId, changes);
    return true;
}

export function registerPeopleRoutes({ router, peopleRepository, db, config }) {
    const faceEnrollService = createFaceEnrollService({ config });

    router.delete('/api/people/all', async (ctx) => {
        const removed = peopleRepository.deleteAllPeople();
        recordAudit({
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            action: 'people.purge_all',
            target: 'people',
            detail: { removed }
        });
        return { body: { ok: true, removed } };
    }, { permission: Permission.CAMERA_MANAGE });

    router.delete('/api/people/logs/all', async (ctx) => {
        const removed = peopleRepository.deleteAllFaceLogs();
        recordAudit({
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            action: 'people.purge_all_logs',
            target: 'face_logs',
            detail: { removed }
        });
        return { body: { ok: true, removed } };
    }, { permission: Permission.CAMERA_MANAGE });
    router.get('/api/people', async () => {
        const people = peopleRepository.listPeople();
        return { body: { people } };
    }, { permission: Permission.LIVE_VIEW });

    router.get('/api/people/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'id');
        const person = peopleRepository.getPerson(id);
        if (!person) throw notFound('Person not found');
        return { body: { person } };
    }, { permission: Permission.LIVE_VIEW });

    router.post('/api/people', async (ctx) => {
        const name = requireString(ctx.body?.name, 'name', { min: 1, max: 120 });
        const role = optionalString(ctx.body?.role, 'role', { max: 64 }) ?? 'dipendente';
        const department = optionalString(ctx.body?.department, 'department', { max: 120 }) ?? '';
        const specialPermissions = Array.isArray(ctx.body?.specialPermissions) ? ctx.body.specialPermissions : [];
        const face3dParams = typeof ctx.body?.face3dParams === 'object' && ctx.body.face3dParams !== null ? ctx.body.face3dParams : {};
        const gallery = Array.isArray(ctx.body?.gallery) ? ctx.body.gallery.slice(0, 3) : [];
        const notes = optionalString(ctx.body?.notes, 'notes', { max: 1000 }) ?? '';
        const embedding = ctx.body?.embedding ? requireEmbedding(ctx.body.embedding, 'embedding') : [];
        const photoPath = optionalString(ctx.body?.photoPath, 'photoPath', { max: 500000 });

        const person = peopleRepository.createPerson({
            name,
            role,
            department,
            specialPermissions,
            face3dParams,
            gallery,
            notes,
            embedding,
            photoPath
        });
        recordAudit({
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            action: 'people.create',
            target: person.id,
            detail: { name: person.name, role: person.role }
        });
        return { body: { person }, status: 201 };
    }, { permission: Permission.CAMERA_MANAGE });

    router.put('/api/people/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'id');
        const changes = {};

        if (ctx.body?.name !== undefined) {
            changes.name = requireString(ctx.body.name, 'name', { min: 1, max: 120 });
        }
        if (ctx.body?.role !== undefined) {
            changes.role = optionalString(ctx.body.role, 'role', { max: 64 }) ?? 'dipendente';
        }
        if (ctx.body?.department !== undefined) {
            changes.department = optionalString(ctx.body.department, 'department', { max: 120 }) ?? '';
        }
        if (ctx.body?.specialPermissions !== undefined) {
            changes.specialPermissions = Array.isArray(ctx.body.specialPermissions) ? ctx.body.specialPermissions : [];
        }
        if (ctx.body?.face3dParams !== undefined) {
            changes.face3dParams = typeof ctx.body.face3dParams === 'object' && ctx.body.face3dParams !== null ? ctx.body.face3dParams : {};
        }
        if (ctx.body?.gallery !== undefined) {
            changes.gallery = Array.isArray(ctx.body.gallery) ? ctx.body.gallery.slice(0, 3) : [];
        }
        if (ctx.body?.notes !== undefined) {
            changes.notes = optionalString(ctx.body.notes, 'notes', { max: 1000 }) ?? '';
        }
        if (ctx.body?.embedding !== undefined) {
            changes.embedding = requireEmbedding(ctx.body.embedding, 'embedding');
        }
        if (ctx.body?.photoPath !== undefined) {
            changes.photoPath = optionalString(ctx.body.photoPath, 'photoPath', { max: 500000 });
        }

        const updated = peopleRepository.updatePerson(id, changes);
        if (!updated) throw notFound('Person not found');
        recordAudit({
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            action: 'people.update',
            target: id,
            detail: { name: updated.name }
        });
        return { body: { person: updated } };
    }, { permission: Permission.CAMERA_MANAGE });

    router.delete('/api/people/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'id');
        const person = peopleRepository.getPerson(id);
        if (!person) throw notFound('Person not found');

        peopleRepository.deletePerson(id);
        recordAudit({
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            action: 'people.purge_gdpr',
            target: id,
            detail: { name: person.name }
        });
        return { body: { ok: true, purged: true } };
    }, { permission: Permission.CAMERA_MANAGE });

    router.post('/api/people/:id/merge', async (ctx) => {
        const id = requireId(ctx.params.id, 'id');
        const targetId = requireId(ctx.body?.targetId, 'targetId');
        
        const sourcePerson = peopleRepository.getPerson(id);
        if (!sourcePerson) throw notFound('Source person not found');
        const targetPerson = peopleRepository.getPerson(targetId);
        if (!targetPerson) throw notFound('Target person not found');

        peopleRepository.mergePerson(id, targetId);

        recordAudit({
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            action: 'people.merge',
            target: id,
            detail: { sourceName: sourcePerson.name, targetId, targetName: targetPerson.name }
        });
        return { body: { ok: true, mergedTo: targetId } };
    }, { permission: Permission.CAMERA_MANAGE });

    router.post('/api/people/match', async (ctx) => {
        const candidate = requireEmbedding(ctx.body?.embedding, 'embedding');
        const threshold = typeof ctx.body?.threshold === 'number' ? ctx.body.threshold : 0.363;
        const people = peopleRepository.listPeople();
        const match = findBestMatch(candidate, people, threshold);
        return { body: { match } };
    }, { permission: Permission.LIVE_VIEW });

    router.get('/api/people/logs/faces', async (ctx) => {
        const limit = Number(ctx.query?.limit ?? 50);
        const offset = Number(ctx.query?.offset ?? 0);
        const personId = ctx.query?.personId ?? null;

        const faceLogs = peopleRepository.listFaceLogs({ limit, offset, personId });
        return { body: { faceLogs } };
    }, { permission: Permission.LIVE_VIEW });

    router.get('/api/people/logs/:id', async (ctx) => {
        const logId = requireId(ctx.params.id, 'id');
        const faceLog = peopleRepository.getFaceLog(logId);
        if (!faceLog) throw notFound('Face log not found');
        return { body: { faceLog } };
    }, { permission: Permission.LIVE_VIEW });

    router.post('/api/people/logs/:id/correct', async (ctx) => {
        const logId = requireId(ctx.params.id, 'id');
        const newPersonId = ctx.body?.personId ? requireId(ctx.body.personId, 'personId') : null;

        const log = peopleRepository.getFaceLog(logId);
        if (!log) throw notFound('Face log not found');

        peopleRepository.correctFaceLog(logId, newPersonId);
        const learned = learnFromCorrectedLog(peopleRepository, newPersonId, log);

        recordAudit({
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            action: 'people.correct_log',
            target: logId,
            detail: { correctedPersonId: newPersonId, learned }
        });
        return { body: { ok: true, logId, correctedPersonId: newPersonId, learned } };
    }, { permission: Permission.CAMERA_MANAGE });

    router.delete('/api/people/logs/:id', async (ctx) => {
        const logId = requireId(ctx.params.id, 'id');
        const deleted = peopleRepository.deleteFaceLog(logId);
        if (!deleted) throw notFound('Face log not found');

        recordAudit({
            actorId: ctx.actor?.id,
            actorName: ctx.actor?.username,
            action: 'people.delete_log',
            target: logId,
            detail: {}
        });
        return { body: { ok: true, purged: true } };
    }, { permission: Permission.CAMERA_MANAGE });

    router.post('/api/people/extract-face', async (ctx) => {
        const imageBase64 = requireString(ctx.body?.imageBase64, 'imageBase64', { min: 10, max: 15000000 });
        const result = await faceEnrollService.extractFromBase64(imageBase64);
        return { body: result };
    }, { permission: Permission.CAMERA_MANAGE });
}
