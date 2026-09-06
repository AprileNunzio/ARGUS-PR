import { buildZoneMask } from './motion_math.js';

export const FRAME_WIDTH = 160;
export const FRAME_HEIGHT = 90;
export const FRAME_BYTES = FRAME_WIDTH * FRAME_HEIGHT;
export const DEFAULT_ALPHA = 0.02;
export const DEFAULT_PIXEL_THRESHOLD = 25;
export const LIGHT_CHANGE_RATIO = 0.60;
export const DEFAULT_SENSITIVITY = 0.015;
export const DEFAULT_COOLDOWN_SECONDS = 15;
export const HYSTERESIS_ON_FRAMES = 2;
export const HYSTERESIS_OFF_FRAMES = 10;

export class MotionDetector {
    constructor(zones = [], options = {}) {
        this.width = options.width ?? FRAME_WIDTH;
        this.height = options.height ?? FRAME_HEIGHT;
        this.totalPixels = this.width * this.height;
        this.alpha = options.alpha ?? DEFAULT_ALPHA;
        this.pixelThreshold = options.pixelThreshold ?? DEFAULT_PIXEL_THRESHOLD;
        this.lightChangeThreshold = Math.floor(this.totalPixels * LIGHT_CHANGE_RATIO);
        this.defaultSensitivity = options.sensitivity ?? DEFAULT_SENSITIVITY;
        this.defaultCooldownSeconds = options.cooldownSeconds ?? DEFAULT_COOLDOWN_SECONDS;

        this.background = null;
        this.zoneStates = [];
        this.setZones(zones);
    }

    setZones(zones) {
        const activeZones = (zones ?? []).filter((z) => z.isActive !== false && z.is_active !== 0).slice(0, 32);
        this.zones = activeZones;

        if (activeZones.length > 0) {
            const { mask, zoneCounts } = buildZoneMask(activeZones, this.width, this.height);
            this.zoneMask = mask;
            this.zoneAreas = zoneCounts;
        } else {
            this.zoneMask = null;
            this.zoneAreas = [this.totalPixels];
        }

        const count = activeZones.length > 0 ? activeZones.length : 1;
        this.zoneStates = Array.from({ length: count }, (_, index) => {
            const zone = activeZones[index];
            return {
                id: zone?.id ?? 'default',
                name: zone?.name ?? 'Intero fotogramma',
                sensitivity: zone?.sensitivity ?? this.defaultSensitivity,
                cooldownMs: (zone?.cooldownSeconds ?? zone?.cooldown_seconds ?? this.defaultCooldownSeconds) * 1000,
                consecutiveActive: 0,
                consecutiveInactive: 0,
                isEngaged: false,
                lastEventAt: -86400000,
                eventStartedAt: 0
            };
        });
    }


    processFrame(frameBuffer, now = Date.now()) {
        if (!frameBuffer || frameBuffer.length < this.totalPixels) return [];

        if (!this.background) {
            this.background = new Float32Array(this.totalPixels);
            for (let i = 0; i < this.totalPixels; i += 1) {
                this.background[i] = frameBuffer[i];
            }
            return [];
        }

        let totalChanged = 0;
        const diffMask = new Uint8Array(this.totalPixels);
        const zoneHits = new Uint32Array(this.zoneStates.length);

        const hasZones = this.zoneMask !== null;
        const mask = this.zoneMask;

        for (let i = 0; i < this.totalPixels; i += 1) {
            const currentVal = frameBuffer[i];
            const diff = Math.abs(currentVal - this.background[i]);

            if (diff > this.pixelThreshold) {
                diffMask[i] = 1;
                totalChanged += 1;

                if (hasZones) {
                    const bits = mask[i];
                    if (bits > 0) {
                        for (let z = 0; z < this.zoneStates.length; z += 1) {
                            if ((bits & (1 << z)) !== 0) zoneHits[z] += 1;
                        }
                    }
                } else {
                    zoneHits[0] += 1;
                }
            }

            this.background[i] = (1 - this.alpha) * this.background[i] + this.alpha * currentVal;
        }

        if (totalChanged > this.lightChangeThreshold) {
            for (let i = 0; i < this.totalPixels; i += 1) {
                this.background[i] = frameBuffer[i];
            }
            for (const state of this.zoneStates) {
                state.consecutiveActive = 0;
                state.consecutiveInactive = 0;
                state.isEngaged = false;
            }
            return [];
        }

        const events = [];

        for (let z = 0; z < this.zoneStates.length; z += 1) {
            const state = this.zoneStates[z];
            const area = this.zoneAreas[z] || 1;
            const ratio = zoneHits[z] / area;
            const aboveThreshold = ratio > state.sensitivity;

            if (aboveThreshold) {
                state.consecutiveActive += 1;
                state.consecutiveInactive = 0;

                if (!state.isEngaged && state.consecutiveActive >= HYSTERESIS_ON_FRAMES) {
                    const elapsedSinceLast = now - state.lastEventAt;
                    if (elapsedSinceLast >= state.cooldownMs) {
                        state.isEngaged = true;
                        state.eventStartedAt = now;
                        state.lastEventAt = now;

                        events.push({
                            type: 'motion_start',
                            zoneId: state.id,
                            zoneName: state.name,
                            ratio,
                            changedPixels: zoneHits[z],
                            area,
                            at: now
                        });
                    }
                }
            } else {
                state.consecutiveInactive += 1;
                state.consecutiveActive = 0;

                if (state.isEngaged && state.consecutiveInactive >= HYSTERESIS_OFF_FRAMES) {
                    state.isEngaged = false;
                    events.push({
                        type: 'motion_end',
                        zoneId: state.id,
                        zoneName: state.name,
                        durationMs: now - state.eventStartedAt,
                        at: now
                    });
                }
            }
        }

        return events;
    }

    reset() {
        this.background = null;
        for (const state of this.zoneStates) {
            state.consecutiveActive = 0;
            state.consecutiveInactive = 0;
            state.isEngaged = false;
            state.lastEventAt = 0;
            state.eventStartedAt = 0;
        }
    }
}
