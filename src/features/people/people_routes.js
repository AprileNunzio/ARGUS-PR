import { requireId, requireString, optionalString, requireEmbedding } from '../../security/guards.js';
import { notFound } from '../../kernel/errors.js';
import { Permission } from '../../security/rbac.js';
import { recordAudit } from '../../security/audit.js';
import { findBestMatch } from '../vision/face_matcher.js';

export function registerPeopleRoutes({ router, peopleRepository, db }) {
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
        const notes = optionalString(ctx.body?.notes, 'notes', { max: 1000 }) ?? '';
        const embedding = ctx.body?.embedding ? requireEmbedding(ctx.body.embedding, 'embedding') : [];
        const photoPath = optionalString(ctx.body?.photoPath, 'photoPath', { max: 500 });

        const person = peopleRepository.createPerson({ name, notes, embedding, photoPath });
        recordAudit(db, {
            userId: ctx.actor?.id,
            action: 'people.create',
            resource: person.id,
            details: { name: person.name }
        });
        return { body: { person }, status: 201 };
    }, { permission: Permission.CAMERA_MANAGE });

    router.put('/api/people/:id', async (ctx) => {
        const id = requireId(ctx.params.id, 'id');
        const changes = {};

        if (ctx.body?.name !== undefined) {
            changes.name = requireString(ctx.body.name, 'name', { min: 1, max: 120 });
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
}
