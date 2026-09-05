import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { openDatabase, getDatabase } from '../src/storage/database.js';
import { recordAudit, verifyAuditIntegrity } from '../src/security/audit.js';
import { appendSegment, verifyDayIntegrity } from '../src/features/recording/segment_index.js';

test('Audit Merkle Chain: correctly verifies untampered entries and detects tamper', () => {
    openDatabase({ databaseFile: ':memory:' });
    const db = getDatabase();

    recordAudit({ action: 'user.login', actorName: 'admin', outcome: 'success' });
    recordAudit({ action: 'camera.create', actorName: 'admin', outcome: 'success', target: 'cam-1' });
    recordAudit({ action: 'settings.change', actorName: 'admin', outcome: 'success' });

    const initial = verifyAuditIntegrity(db);
    assert.equal(initial.verified, true);
    assert.equal(initial.count, 3);
    assert.equal(initial.brokenAt, null);

    db.prepare("UPDATE audit_log SET action = 'camera.delete' WHERE id = 2").run();
    const tampered = verifyAuditIntegrity(db);
    assert.equal(tampered.verified, false);
    assert.equal(tampered.brokenAt, 2);
});

test('Video Segment Merkle Chain: verifies sequence and detects file tampering', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-integrity-test-'));
    const config = { mediaDir: tmpDir };
    const cameraId = 'cam1';
    const day = '2026-09-05';

    const segDir = path.join(tmpDir, 'segments', cameraId, day);
    fs.mkdirSync(segDir, { recursive: true });

    const file1 = path.join(segDir, '20260905-100000.mp4');
    const file2 = path.join(segDir, '20260905-100100.mp4');
    fs.writeFileSync(file1, 'dummy video 1');
    fs.writeFileSync(file2, 'dummy video 2');

    const sha1 = crypto.createHash('sha256').update('dummy video 1').digest('hex');
    const sha2 = crypto.createHash('sha256').update('dummy video 2').digest('hex');

    appendSegment(config, cameraId, {
        startedAt: new Date('2026-09-05T10:00:00Z').getTime(),
        durationMs: 60000,
        bytes: 13,
        file: `${day}/20260905-100000.mp4`,
        sha256: sha1
    });

    appendSegment(config, cameraId, {
        startedAt: new Date('2026-09-05T10:01:00Z').getTime(),
        durationMs: 60000,
        bytes: 13,
        file: `${day}/20260905-100100.mp4`,
        sha256: sha2
    });

    const initialCheck = verifyDayIntegrity(config, cameraId, day);
    assert.equal(initialCheck.verified, true);
    assert.equal(initialCheck.count, 2);

    fs.writeFileSync(file2, 'tampered content');
    const tamperedCheck = verifyDayIntegrity(config, cameraId, day);
    assert.equal(tamperedCheck.verified, false);
    assert.equal(tamperedCheck.brokenAt, `${day}/20260905-100100.mp4`);

    fs.rmSync(tmpDir, { recursive: true, force: true });
});
