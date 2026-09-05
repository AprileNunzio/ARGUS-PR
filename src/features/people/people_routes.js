import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { requireId, requireString, optionalString, requireEmbedding } from '../../security/guards.js';
import { notFound, validationError } from '../../kernel/errors.js';
import { Permission } from '../../security/rbac.js';
import { recordAudit } from '../../security/audit.js';
import { findBestMatch } from '../vision/face_matcher.js';
import { resolvePythonBin } from '../vision/vision_process.js';

const execFileAsync = promisify(execFile);

export function registerPeopleRoutes({ router, peopleRepository, db, config }) {
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
        const photoPath = optionalString(ctx.body?.photoPath, 'photoPath', { max: 500 });

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
        recordAudit(db, {
            userId: ctx.actor?.id,
            action: 'people.create',
            resource: person.id,
            details: { name: person.name, role: person.role }
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
            changes.photoPath = optionalString(ctx.body.photoPath, 'photoPath', { max: 500 });
        }

        const updated = peopleRepository.updatePerson(id, changes);
        if (!updated) throw notFound('Person not found');
        recordAudit(db, {
            userId: ctx.actor?.id,
            action: 'people.update',
            resource: id,
            details: { name: updated.name }
        });
        return { body: { person: updated } };
    }, { permission: Permission.CAMERA_MANAGE });

    router.delete('/api/people/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'id');
        const person = peopleRepository.getPerson(id);
        if (!person) throw notFound('Person not found');

        peopleRepository.deletePerson(id);
        recordAudit(db, {
            userId: ctx.actor?.id,
            action: 'people.purge_gdpr',
            resource: id,
            details: { name: person.name }
        });
        return { body: { ok: true, purged: true } };
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

    router.post('/api/people/logs/:id/correct', async (ctx) => {
        const logId = requireId(ctx.params.id, 'id');
        const newPersonId = ctx.body?.personId ? requireId(ctx.body.personId, 'personId') : null;

        const updated = peopleRepository.correctFaceLog(logId, newPersonId);
        if (!updated) throw notFound('Face log not found');

        recordAudit(db, {
            userId: ctx.actor?.id,
            action: 'people.correct_log',
            resource: logId,
            details: { correctedPersonId: newPersonId }
        });
        return { body: { ok: true, logId, correctedPersonId: newPersonId } };
    }, { permission: Permission.CAMERA_MANAGE });

    router.post('/api/people/extract-face', async (ctx) => {
        const imageBase64 = requireString(ctx.body?.imageBase64, 'imageBase64', { min: 10, max: 15000000 });
        const cleanBase64 = imageBase64.replace(/^data:image\/[a-z0-9.+]+;base64,/, '');
        const dataDir = config?.dataDir ?? process.env.ARGUS_DATA_DIR ?? join(process.cwd(), 'data');
        const tempPath = join(dataDir, `face_enroll_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
        await writeFile(tempPath, Buffer.from(cleanBase64, 'base64'));

        const pythonBin = resolvePythonBin(dataDir);
        const workerScript = join(process.cwd(), 'vision', 'worker.py');
        const modelsDir = join(dataDir, 'models');

        try {
            const { stdout } = await execFileAsync(pythonBin, [
                workerScript,
                '--models-dir', modelsDir,
                '--enroll', tempPath
            ]);
            const res = JSON.parse(stdout);
            if (!res.ok) throw validationError(res.error ?? 'Rilevamento volto non riuscito');
            return { body: res };
        } finally {
            try { await unlink(tempPath); } catch {}
        }
    }, { permission: Permission.CAMERA_MANAGE });
}
