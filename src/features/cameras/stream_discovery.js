import net from 'node:net';
import { execFile } from 'node:child_process';
import { getMediaTools } from '../../platform/media_tools.js';
import { authenticatedStreamUrl } from './camera_url.js';
import { createLogger } from '../../kernel/logger.js';

const log = createLogger('stream-discovery');

const PROBE_ARGS = Object.freeze([
    '-print_format', 'json',
    '-show_streams',
    '-analyzeduration', '1500000',
    '-probesize', '1500000'
]);

const VENDOR_PATTERNS = Object.freeze([
    {
        vendor: 'Hikvision',
        main: ['/Streaming/Channels/101', '/Streaming/Channels/1', '/ch01/0'],
        sub: ['/Streaming/Channels/102', '/Streaming/Channels/2', '/ch01/1']
    },
    {
        vendor: 'Dahua',
        main: ['/cam/realmonitor?channel=1&subtype=0'],
        sub: ['/cam/realmonitor?channel=1&subtype=1']
    },
    {
        vendor: 'Reolink',
        main: ['/h264Preview_01_main', '/Preview_01_main'],
        sub: ['/h264Preview_01_sub', '/Preview_01_sub']
    },
    {
        vendor: 'Axis',
        main: ['/axis-media/media.amp'],
        sub: ['/axis-media/media.amp?videokeyframeinterval=30']
    },
    {
        vendor: 'Uniview',
        main: ['/unicast/c1/s0/live', '/media/video1'],
        sub: ['/unicast/c1/s1/live', '/media/video2']
    },
    {
        vendor: 'Generic',
        main: ['/live/ch0', '/onvif1', '/stream1', '/video1', '/h264', '/ch0', '/11'],
        sub: ['/live/ch1', '/onvif2', '/stream2', '/video2', '/h264_sub', '/ch1', '/12']
    }
]);

export function candidateStreamPaths() {
    const list = [];
    for (const group of VENDOR_PATTERNS) {
        for (const p of group.main) list.push({ path: p, role: 'main', vendor: group.vendor });
        for (const p of group.sub) list.push({ path: p, role: 'sub', vendor: group.vendor });
    }
    return list;
}

export function testTcpPort(host, port, timeoutMs = 2000) {
    return new Promise((resolve) => {
        const socket = net.connect({ host, port });
        const finish = (open) => {
            socket.removeAllListeners();
            socket.destroy();
            resolve(open);
        };
        socket.setTimeout(timeoutMs);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false));
        socket.once('error', () => finish(false));
    });
}

function probeTargetUrl(ffprobePath, targetUrl, timeoutMs = 4000) {
    return new Promise((resolve) => {
        const args = ['-hide_banner', '-loglevel', 'error', '-rtsp_transport', 'tcp', '-timeout', '3000000', ...PROBE_ARGS, targetUrl];
        execFile(ffprobePath, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 256, shell: false }, (error, stdout) => {
            if (error || !stdout) return resolve(null);
            try {
                const parsed = JSON.parse(stdout);
                const video = (parsed.streams ?? []).find((s) => s.codec_type === 'video');
                if (!video) return resolve(null);
                const width = Number.parseInt(video.width, 10) || 0;
                const height = Number.parseInt(video.height, 10) || 0;
                resolve({
                    codec: video.codec_name,
                    width,
                    height,
                    frameRate: video.avg_frame_rate ?? null,
                    pixels: width * height
                });
            } catch {
                resolve(null);
            }
        });
    });
}

export async function autodiscoverStreams({ host, port = 554, username = null, password = null }) {
    const rtspPort = Number.parseInt(port, 10) || 554;
    const isPortOpen = await testTcpPort(host, rtspPort, 2500);
    if (!isPortOpen) {
        return {
            reachable: false,
            error: `Porta RTSP ${rtspPort} non raggiungibile su ${host}. Verifica IP e connessione.`,
            streams: []
        };
    }

    const tools = getMediaTools();
    const ffprobePath = tools.ffprobe.path;
    const candidates = candidateStreamPaths();
    const detected = [];
    let detectedVendor = null;

    for (const item of candidates) {
        const rawUrl = `rtsp://${host}:${rtspPort}${item.path}`;
        let targetUrl = rawUrl;
        try {
            targetUrl = authenticatedStreamUrl(rawUrl, username, password);
        } catch {
            continue;
        }

        const probe = await probeTargetUrl(ffprobePath, targetUrl, 3500);
        if (probe) {
            detected.push({
                url: rawUrl,
                path: item.path,
                role: item.role,
                vendor: item.vendor,
                video: probe
            });
            if (!detectedVendor && item.vendor !== 'Generic') {
                detectedVendor = item.vendor;
            }
            if (detected.length >= 2 && detected.some((d) => d.role === 'main') && detected.some((d) => d.role === 'sub')) {
                break;
            }
        }
    }

    if (detected.length === 0) {
        return {
            reachable: true,
            error: 'Nessun flusso RTSP riconosciuto con le credenziali fornite.',
            streams: []
        };
    }

    detected.sort((a, b) => b.video.pixels - a.video.pixels);
    const mainStream = detected[0];
    const subStream = detected.length > 1 ? detected[detected.length - 1] : null;

    return {
        reachable: true,
        vendor: detectedVendor ?? detected[0].vendor,
        mainStreamUrl: mainStream.url,
        subStreamUrl: subStream ? subStream.url : null,
        mainResolution: `${mainStream.video.width}x${mainStream.video.height}`,
        codec: mainStream.video.codec,
        streams: detected
    };
}
