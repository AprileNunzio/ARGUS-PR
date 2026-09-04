import { spawn } from 'node:child_process';
import { getMediaTools } from '../../platform/media_tools.js';
import { getCameraSecrets } from '../cameras/camera_repository.js';
import { resolveInput, isLocalKind } from '../cameras/camera_input.js';
import { attachLocalConsumer } from '../cameras/local_capture.js';
import { createFragmentSplitter } from './mp4_splitter.js';
import { buildPreviewArgs } from './ffmpeg_args.js';
import { probeStream } from '../cameras/stream_probe.js';
import { createLogger } from '../../kernel/logger.js';
import { publish, Topic } from '../../kernel/event_bus.js';
import { AppError, ErrorCode, notFound } from '../../kernel/errors.js';
import { redactCredentials } from '../../security/guards.js';
import { getSetting } from '../settings/settings_repository.js';
import { DEFAULT_PERFORMANCE_SETTINGS } from '../settings/performance_tuning.js';


const log = createLogger('stream');

const IDLE_SHUTDOWN_MS = 12000;
const MAX_RESTART_DELAY_MS = 30000;
const STALL_TIMEOUT_MS = 20000;

export class StreamSession {
    constructor(cameraId, quality = 'sub') {
        this.cameraId = cameraId;
        this.quality = quality === 'main' ? 'main' : 'sub';
        this.viewers = new Set();
        this.process = null;
        this.initSegment = null;
        this.restartAttempts = 0;
        this.idleTimer = null;
        this.stallTimer = null;
        this.restartTimer = null;
        this.state = 'idle';
        this.lastError = null;
        this.stopped = false;
        this.startPromise = null;
    }

    addViewer(viewer) {
        this.viewers.add(viewer);
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
        if (this.initSegment) viewer.sendInit(this.initSegment);
        if (!this.process && !this.restartTimer) {
            this.start().catch((error) => {
                log.error('stream start failed', { camera: this.cameraId, message: error.message });
            });
        }
    }

    removeViewer(viewer) {
        this.viewers.delete(viewer);
        if (this.viewers.size > 0 || this.idleTimer) return;

        this.idleTimer = setTimeout(() => {
            this.idleTimer = null;
            if (this.viewers.size === 0) this.stop('idle');
        }, IDLE_SHUTDOWN_MS);
        this.idleTimer.unref();
    }

    broadcastInit(segment) {
        this.initSegment = segment;
        for (const viewer of this.viewers) viewer.sendInit(segment);
    }

    broadcastFragment(fragment) {
        for (const viewer of this.viewers) viewer.sendFragment(fragment);
    }

    setState(state, detail = null) {
        if (this.state === state) return;
        this.state = state;
        this.lastError = detail;
        publish(Topic.CAMERA_STATE, { cameraId: this.cameraId, state, detail });
    }

    armStallTimer() {
        if (this.stallTimer) clearTimeout(this.stallTimer);
        this.stallTimer = setTimeout(() => {
            log.warn('stream stalled', { camera: this.cameraId });
            this.recycle('stalled');
        }, STALL_TIMEOUT_MS);
        this.stallTimer.unref();
    }

    start() {
        if (this.stopped || this.process) return Promise.resolve();

        if (!this.startPromise) {
            this.startPromise = this.launch().finally(() => {
                this.startPromise = null;
            });
        }

        return this.startPromise;
    }

    async launch() {
        if (this.stopped || this.process) return;

        const camera = getCameraSecrets(this.cameraId);
        if (!camera) throw notFound('Camera');

        const tools = getMediaTools();

        if (isLocalKind(camera.sourceKind)) {
            this.startLocal(camera);
            return;
        }

        const preferSub = this.quality !== 'main';
        const input = resolveInput(camera, { preferSub });

        const probe = await probeStream(this.cameraId, { preferSub })
            .then((result) => result.video)
            .catch(() => null);

        const perf = getSetting('performance', DEFAULT_PERFORMANCE_SETTINGS);
        const { args, transcoded } = buildPreviewArgs(input, probe, tools, perf);


        log.info('stream starting', {
            camera: this.cameraId,
            quality: this.quality,
            source: input.label,
            transcoded
        });

        const child = spawn(tools.ffmpeg.path, args, {
            windowsHide: true,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        this.process = child;
        this.setState('connecting');

        const splitter = this.buildSplitter();
        child.stdout.on('data', (chunk) => splitter(chunk));

        child.stderr.on('data', (chunk) => {
            const text = chunk.toString('utf8').trim();
            if (text.length > 0) log.warn('ffmpeg', { camera: this.cameraId, message: text.slice(0, 300) });
        });

        child.on('error', (error) => {
            log.error('stream process error', { camera: this.cameraId, message: error.message });
            this.recycle('process-error');
        });

        child.on('close', (code) => {
            if (this.stopped) return;
            log.warn('stream ended', { camera: this.cameraId, code });
            this.recycle(`exit-${code}`);
        });

        this.armStallTimer();
    }

    buildSplitter() {
        return createFragmentSplitter(
            (segment) => {
                this.restartAttempts = 0;
                this.setState('live');
                this.broadcastInit(segment);
            },
            (fragment) => {
                this.armStallTimer();
                this.broadcastFragment(fragment);
            }
        );
    }

    startLocal(camera) {
        const handle = attachLocalConsumer(camera, 'live');
        this.localHandle = handle;
        this.setState('connecting');

        const splitter = this.buildSplitter();
        handle.stream.on('data', (chunk) => splitter(chunk));

        log.info('stream starting', { camera: this.cameraId, source: camera.deviceId, transcoded: true });
        this.armStallTimer();
    }

    recycle(reason) {
        this.killProcess();
        this.initSegment = null;

        if (this.stopped || this.viewers.size === 0) {
            this.setState('idle', reason);
            return;
        }

        this.restartAttempts += 1;
        const delay = Math.min(1000 * 2 ** Math.min(this.restartAttempts, 5), MAX_RESTART_DELAY_MS);
        this.setState('reconnecting', reason);

        this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            this.start().catch((error) => {
                log.error('restart failed', { camera: this.cameraId, message: error.message });
            });
        }, delay);
        this.restartTimer.unref();
    }

    killProcess() {
        if (this.stallTimer) {
            clearTimeout(this.stallTimer);
            this.stallTimer = null;
        }
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

    stop(reason = 'stopped') {
        this.stopped = true;
        if (this.restartTimer) clearTimeout(this.restartTimer);
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.killProcess();
        for (const viewer of this.viewers) viewer.close();
        this.viewers.clear();
        this.setState('idle', reason);
        log.info('stream stopped', { camera: this.cameraId, reason });
    }

    snapshot() {
        return {
            cameraId: this.cameraId,
            quality: this.quality,
            state: this.state,
            viewers: this.viewers.size,
            lastError: this.lastError
        };
    }
}

export function assertStreamable(cameraId) {
    const camera = getCameraSecrets(cameraId);
    if (!camera) throw notFound('Camera');
    if (isLocalKind(camera.sourceKind)) {
        if (!camera.deviceId) throw new AppError(ErrorCode.VALIDATION, 'Camera has no capture device configured');
        return camera;
    }
    if (!camera.mainStreamUrl && !camera.subStreamUrl) {
        throw new AppError(ErrorCode.VALIDATION, 'Camera has no stream URL configured');
    }
    return camera;
}
