import { spawn } from 'node:child_process';
import { getMediaTools } from '../../platform/media_tools.js';
import { getCameraSecrets } from '../cameras/camera_repository.js';
import { resolveInput, isLocalKind } from '../cameras/camera_input.js';
import { attachLocalConsumer } from '../cameras/local_capture.js';
import { buildMotionArgs } from '../streaming/ffmpeg_args.js';
import { MotionDetector, FRAME_BYTES } from './motion_detector.js';
import { getSetting } from '../settings/settings_repository.js';
import { DEFAULT_PERFORMANCE_SETTINGS } from '../settings/performance_tuning.js';
import { createLogger } from '../../kernel/logger.js';

import { notFound } from '../../kernel/errors.js';

const log = createLogger('motion-process');
const MAX_PENDING_BYTES = 20 * FRAME_BYTES;
const MAX_RESTART_DELAY_MS = 60000;

export class MotionProcess {
    constructor(config, cameraId, zones = [], onEvent = () => {}) {
        this.config = config;
        this.cameraId = cameraId;
        this.onEvent = onEvent;
        this.detector = new MotionDetector(zones);
        this.process = null;
        this.restartTimer = null;
        this.attempts = 0;
        this.stopped = false;
        this.pending = Buffer.alloc(0);
    }

    setZones(zones) {
        this.detector.setZones(zones);
    }

    start() {
        if (this.process || this.stopped) return;

        const camera = getCameraSecrets(this.cameraId);
        if (!camera) throw notFound('Camera');

        const tools = getMediaTools();
        if (!tools.available) {
            log.warn('motion process deferred: ffmpeg unavailable', { camera: this.cameraId });
            return;
        }

        const input = resolveInput(camera, { preferSub: true });

        if (isLocalKind(camera.sourceKind)) {
            this.startLocal(camera);
            return;
        }

        const perf = getSetting('performance', DEFAULT_PERFORMANCE_SETTINGS);
        const args = buildMotionArgs(input, tools.accelerators, perf);

        const child = spawn(tools.ffmpeg.path, args, {

            windowsHide: true,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        this.process = child;
        this.pending = Buffer.alloc(0);
        this.detector.reset();

        log.info('motion analysis started', { camera: this.cameraId });

        child.stdout.on('data', (chunk) => this.consume(chunk));

        child.stderr.on('data', (chunk) => {
            const text = chunk.toString('utf8').trim();
            if (text.length > 0) {
                log.debug('ffmpeg motion stderr', { camera: this.cameraId, message: text.slice(0, 200) });
            }
        });

        child.on('error', (error) => {
            log.error('motion process error', { camera: this.cameraId, message: error.message });
            this.recycle();
        });

        child.on('close', (code) => {
            if (this.stopped) return;
            log.warn('motion process closed', { camera: this.cameraId, code });
            this.recycle();
        });
    }

    startLocal(camera) {
        this.localHandle = attachLocalConsumer(camera, 'motion');
        this.pending = Buffer.alloc(0);
        this.detector.reset();
        this.localHandle.stream.on('data', (chunk) => this.consume(chunk));
        log.info('motion analysis started', { camera: this.cameraId, source: camera.deviceId });
    }

    consume(chunk) {
        if (this.stopped) return;

        this.pending = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]);

        if (this.pending.length > MAX_PENDING_BYTES) {
            log.warn('motion analysis buffer overflow, discarding backlog', {
                camera: this.cameraId,
                bytes: this.pending.length
            });
            this.pending = this.pending.subarray(this.pending.length - FRAME_BYTES);
        }

        while (this.pending.length >= FRAME_BYTES) {
            const frame = this.pending.subarray(0, FRAME_BYTES);
            this.pending = this.pending.subarray(FRAME_BYTES);

            const events = this.detector.processFrame(frame, Date.now());
            if (events.length > 0) this.onEvent(events);
        }
    }

    recycle() {
        this.teardown();
        if (this.stopped) return;

        this.attempts += 1;
        const delay = Math.min(2000 * 2 ** Math.min(this.attempts, 5), MAX_RESTART_DELAY_MS);

        this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            this.start();
        }, delay);
        this.restartTimer.unref();
    }

    teardown() {
        if (this.localHandle) {
            this.localHandle.stop();
            this.localHandle = null;
        }
        if (!this.process) return;
        const child = this.process;
        this.process = null;
        child.removeAllListeners('close');
        child.kill('SIGKILL');
    }

    stop() {
        this.stopped = true;
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }
        this.teardown();
        log.info('motion analysis stopped', { camera: this.cameraId });
    }
}
