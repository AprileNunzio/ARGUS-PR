import Database from 'better-sqlite3';
import { createLogger } from '../kernel/logger.js';
import { internal } from '../kernel/errors.js';
import { onShutdown } from '../kernel/process_guard.js';
import { migrations } from './migrations/index.js';

const log = createLogger('database');

let handle = null;

function applyPragmas(db) {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.pragma('temp_store = MEMORY');
}

function currentVersion(db) {
    return db.pragma('user_version', { simple: true });
}

function runMigrations(db) {
    const from = currentVersion(db);
    const pending = migrations.filter((migration) => migration.version > from);
    if (pending.length === 0) return from;

    for (const migration of pending) {
        const apply = db.transaction(() => {
            db.exec(migration.sql);
            db.pragma(`user_version = ${migration.version}`);
        });
        apply();
        log.info('migration applied', { version: migration.version, name: migration.name });
    }

    return currentVersion(db);
}

export function openDatabase(config) {
    if (handle) return handle;

    const db = (() => {
        try {
            return new Database(config.databaseFile);
        } catch (error) {
            throw internal(`Cannot open database at ${config.databaseFile}`, error);
        }
    })();

    applyPragmas(db);
    const version = runMigrations(db);
    log.info('database ready', { file: config.databaseFile, schemaVersion: version });

    onShutdown('database', () => {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
    });

    handle = db;
    return handle;
}

export function getDatabase() {
    if (!handle) throw internal('Database accessed before initialisation');
    return handle;
}

export function withTransaction(work) {
    const db = getDatabase();
    return db.transaction(work)();
}
