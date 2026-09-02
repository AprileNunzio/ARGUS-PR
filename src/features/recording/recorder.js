import { spawn } from 'node:child_process';
import { getMediaTools } from '../../platform/media_tools.js';
import { getCameraSecrets } from '../cameras/camera_repository.js';
import { authenticatedStreamUrl } from '../cameras/camera_url.js';
import { buildRecordArgs } from '../streaming/ffmpeg_args.js';
import { segmentPattern, listingFile, ensureSegmentDays } from './segment_paths.js';
import { createSegmentWatcher } from './segment_watcher.js';
import { createLogger } from '../../kernel/logger.js';
import { publish, Topic } from '../../kernel/event_bus.js';
import { redactCredentials } from '../../security/guards.js';
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
        const source = camera.mainStreamUrl ?? camera.subStreamUrl;
        const url = authenticatedStreamUrl(source, camera.username, camera.password);
        const listingPath = listingFile(this.config, this.cameraId);

        const args = buildRecordArgs(
            { url, transport: camera.transport },
            {
                segmentSeconds: this.segmentSeconds,
                pattern: segmentPattern(this.config, this.cameraId),
                listingPath,
                withAudio: true
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

        this.watcher = createSegmentWatcher(this.config, this.cameraId, listingPath);
        this.watcher.start();

        this.dayTimer = setInterval(() => {
            ensureSegmentDays(this.config, this.cameraId);
        }, 300000);
        this.dayTimer.unref();

        log.info('recording started', {
            camera: this.cameraId,
            url: redactCredentials(source),
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
