import core from './001_core.js';
import exportsMigration from './002_exports.js';
import schedules from './003_schedules.js';
import motion from './004_motion.js';
import detections from './005_detections.js';
import visionAccess from './006_vision_access.js';
import hardening from './007_hardening.js';
import mfa from './008_mfa.js';
import cameraProfiles from './009_camera_profiles.js';
import cameraAnalytics from './010_camera_analytics.js';
import automation from './011_automation.js';
import storagePools from './012_storage_pools.js';

export const migrations = [core, exportsMigration, schedules, motion, detections, visionAccess, hardening, mfa, cameraProfiles, cameraAnalytics, automation, storagePools].sort((a, b) => a.version - b.version);



