import { spawn } from 'node:child_process';
import { getMediaTools } from '../../platform/media_tools.js';
import { getCameraSecrets } from '../cameras/camera_repository.js';
import { resolveInput, isLocalKind } from '../cameras/camera_input.js';
import { attachLocalConsumer } from '../cameras/local_capture.js';
import { buildRecordArgs } from '../streaming/ffmpeg_args.js';
import { segmentPattern, listingFile, ensureSegmentDays } from './segment_paths.js';
import { createSegmentWatcher } from './segment_watcher.js';
import { createLogger } from '../../kernel/logger.js';
import { publish, Topic } from '../../kernel/event_bus.js';
import { notFound } from '../../kernel/errors.js';

const log = createLogger('recorder');

const MAX_RESTART_DELAY_MS = 60000;

export class Recorder {
    constructor(config, cameraId, options = {}) {
        this.config = config;
        this.cameraId = cameraId;
        this.segmentSeconds = options.segmentSeconds ?? 60;
        this.process = null;
        this.watcher = null;
        this.dayTimer = null;
        this.restartTimer = null;
        this.attempts = 0;
        this.stopped = false;
        this.state = 'stopped';
        this.startedAt = null;
    }

    setState(state, detail = null) {
        if (this.state === state) return;
        this.state = state;
        publish(Topic.RECORDING_STATE, { cameraId: this.cameraId, state, detail });
    }

    start() {
        if (this.process || this.stopped) return;

        const camera = getCameraSecrets(this.cameraId);
        if (!camera) throw notFound('Camera');

        const tools = getMediaTools();
        const listingPath = listingFile(this.config, this.cameraId);

        if (isLocalKind(camera.sourceKind)) {
            this.startLocal(camera, listingPath);
            return;
        }

        const input = resolveInput(camera, { preferSub: false });

        const args = buildRecordArgs(
            input,
            {
                segmentSeconds: this.segmentSeconds,
                pattern: segmentPattern(this.config, this.cameraId),
                listingPath,
                withAudio: camera.audioEnabled !== false
            }
        );

        const child = spawn(tools.ffmpeg.path, args, {
            windowsHide: true,
            shell: false,
            stdio: ['ignore', 'ignore', 'pipe']
        });

        this.process = child;
        this.startedAt = Date.now();
        this.setState('recording');

        this.startWatcher(listingPath);

        log.info('recording started', {
            camera: this.cameraId,
            source: input.label,
            segmentSeconds: this.segmentSeconds
        });

        child.stderr.on('data', (chunk) => {
            const text = chunk.toString('utf8').trim();
            if (text.length > 0) log.warn('ffmpeg', { camera: this.cameraId, message: text.slice(0, 300) });
        });

        child.on('error', (error) => {
            log.error('recorder process error', { camera: this.cameraId, message: error.message });
            this.recycle('process-error');
        });

        child.on('close', (code) => {
            if (this.stopped) return;
            log.warn('recording ended', { camera: this.cameraId, code });
            this.recycle(`exit-${code}`);
        });
    }

    startWatcher(listingPath) {
        this.watcher = createSegmentWatcher(this.config, this.cameraId, listingPath);
        this.watcher.start();

        this.dayTimer = setInterval(() => {
            ensureSegmentDays(this.config, this.cameraId);
        }, 300000);
        this.dayTimer.unref();
    }

    startLocal(camera, listingPath) {
        this.localHandle = attachLocalConsumer(camera, 'record', {
            segmentSeconds: this.segmentSeconds,
            pattern: segmentPattern(this.config, this.cameraId),
            listingPath
        });

        this.startedAt = Date.now();
        this.setState('recording');
        this.startWatcher(listingPath);

        log.info('recording started', {
            camera: this.cameraId,
            source: camera.deviceId,
            segmentSeconds: this.segmentSeconds
        });
    }

    recycle(reason) {
        this.teardown();
        if (this.stopped) return;

        this.attempts += 1;
        const delay = Math.min(2000 * 2 ** Math.min(this.attempts, 5), MAX_RESTART_DELAY_MS);
        this.setState('reconnecting', reason);

        this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            this.start();
        }, delay);
        this.restartTimer.unref();
    }

    teardown() {
        if (this.dayTimer) {
            clearInterval(this.dayTimer);
            this.dayTimer = null;
        }
        if (this.watcher) {
            this.watcher.stop();
            this.watcher = null;
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
        this.teardown();
        this.setState('stopped', reason);
        log.info('recording stopped', { camera: this.cameraId, reason });
    }

    snapshot() {
        return {
            cameraId: this.cameraId,
            state: this.state,
            since: this.startedAt,
            segmentSeconds: this.segmentSeconds
        };
    }
}
