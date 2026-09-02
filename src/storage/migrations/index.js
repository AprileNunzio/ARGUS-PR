import core from './001_core.js';
import exportsMigration from './002_exports.js';

export const migrations = [core, exportsMigration].sort((a, b) => a.version - b.version);
