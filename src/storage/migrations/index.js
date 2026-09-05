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
import storagePolicies from './013_storage_policies.js';
import audioClips from './014_audio_clips.js';
import userProfiles from './015_user_profiles.js';
import auditChain from './016_audit_chain.js';
import floorPlansAndBarriers from './017_floor_plans_and_barriers.js';
import analyticsAttributesAndStats from './018_analytics_attributes_and_stats.js';

export const migrations = [
    core,
    exportsMigration,
    schedules,
    motion,
    detections,
    visionAccess,
    hardening,
    mfa,
    cameraProfiles,
    cameraAnalytics,
    automation,
    storagePools,
    storagePolicies,
    audioClips,
    userProfiles,
    auditChain,
    floorPlansAndBarriers,
    analyticsAttributesAndStats
].sort((a, b) => a.version - b.version);
