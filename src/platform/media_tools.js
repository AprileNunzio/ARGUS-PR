import { discoverFfmpeg, listHardwareAccelerators } from './ffmpeg.js';
import { isFail } from '../kernel/result.js';
import { internal } from '../kernel/errors.js';
import { createLogger } from '../kernel/logger.js';

const log = createLogger('media-tools');

let tools = null;

export async function initMediaTools(config) {
    const found = await discoverFfmpeg({
        ffmpegPath: config.ffmpegPath || undefined,
        ffprobePath: config.ffprobePath || undefined
    });

    if (isFail(found)) {
        log.warn('media tools unavailable', { message: found.error.message });
        tools = { available: false, reason: found.error.message, ffmpeg: null, ffprobe: null, accelerators: [] };
        return tools;
    }

    const accelerators = await listHardwareAccelerators(found.value.ffmpeg.path);

    tools = {
        available: true,
        reason: null,
        ffmpeg: found.value.ffmpeg,
        ffprobe: found.value.ffprobe,
        accelerators
    };

    log.info('media tools ready', {
        ffmpeg: tools.ffmpeg.version,
        path: tools.ffmpeg.path,
        accelerators
    });

    return tools;
}

export function getMediaTools() {
    if (!tools) throw internal('Media tools accessed before initialisation');
    if (!tools.available) throw internal(`ffmpeg is not available: ${tools.reason}`);
    return tools;
}

export function mediaToolsStatus() {
    if (!tools) return { available: false, reason: 'not initialised' };
    return {
        available: tools.available,
        reason: tools.reason,
        ffmpegVersion: tools.ffmpeg?.version ?? null,
        ffmpegPath: tools.ffmpeg?.path ?? null,
        accelerators: tools.accelerators
    };
}
