import core from './001_core.js';

export const migrations = [core].sort((a, b) => a.version - b.version);
