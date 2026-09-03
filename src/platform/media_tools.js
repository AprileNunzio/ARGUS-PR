import { discoverFfmpeg, listHardwareAccelerators } from './ffmpeg.js';
import { detectUsableEncoders } from './encoder_probe.js';
import { installationSupported, installFfmpeg } from './dependencies/ffmpeg_installer.js';
import { isFail } from '../kernel/result.js';
import { internal } from '../kernel/errors.js';
import { createLogger } from '../kernel/logger.js';

const log = createLogger('media-tools');

let tools = null;
let lastConfig = null;

export async function initMediaTools(config) {
    lastConfig = config;

    const found = await discoverFfmpeg({
        ffmpegPath: config.ffmpegPath || undefined,
        ffprobePath: config.ffprobePath || undefined
    });

    if (isFail(found)) {
        log.warn('media tools unavailable', { message: found.error.message });
        tools = { available: false, reason: found.error.message, ffmpeg: null, ffprobe: null, accelerators: [], encoders: [] };
        return tools;
    }

    const accelerators = await listHardwareAccelerators(found.value.ffmpeg.path);
    const encoders = await detectUsableEncoders(found.value.ffmpeg.path, accelerators);

    tools = {
        available: true,
        reason: null,
        ffmpeg: found.value.ffmpeg,
        ffprobe: found.value.ffprobe,
        accelerators,
        encoders
    };

    log.info('media tools ready', {
        ffmpeg: tools.ffmpeg.version,
        path: tools.ffmpeg.path,
        accelerators,
        encoders
    });

    return tools;
}

export async function provisionMediaTools() {
    if (tools?.available) return mediaToolsStatus();

    await installFfmpeg();
    await initMediaTools(lastConfig ?? { ffmpegPath: '', ffprobePath: '' });

    return mediaToolsStatus();
}

export function getMediaTools() {
    if (!tools) throw internal('Media tools accessed before initialisation');
    if (!tools.available) throw internal(`ffmpeg is not available: ${tools.reason}`);
    return tools;
}

export function mediaToolsStatus() {
    if (!tools) {
        return { available: false, reason: 'not initialised', installable: installationSupported(), accelerators: [] };
    }
    return {
        available: tools.available,
        reason: tools.reason,
        installable: installationSupported(),
        ffmpegVersion: tools.ffmpeg?.version ?? null,
        ffmpegPath: tools.ffmpeg?.path ?? null,
        accelerators: tools.accelerators
    };
}
