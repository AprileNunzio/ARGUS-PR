import core from './001_core.js';
import exportsMigration from './002_exports.js';
import schedules from './003_schedules.js';
import motion from './004_motion.js';
import detections from './005_detections.js';

export const migrations = [core, exportsMigration, schedules, motion, detections].sort((a, b) => a.version - b.version);

