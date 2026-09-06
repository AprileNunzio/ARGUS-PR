export const BRAND_PROFILES = Object.freeze([
    {
        id: 'hikvision',
        name: 'Hikvision',
        port: 554,
        onvifPort: 80,
        description: 'Hikvision / Hilook / Hiwatch / Ezviz',
        channels: [
            { label: 'Canale 1 - Main stream (Alta risoluzione)', main: '/Streaming/Channels/101', sub: '/Streaming/Channels/102' },
            { label: 'Canale 2 - Main stream', main: '/Streaming/Channels/201', sub: '/Streaming/Channels/202' },
            { label: 'Canale 3 - Main stream', main: '/Streaming/Channels/301', sub: '/Streaming/Channels/302' },
            { label: 'Canale 4 - Main stream', main: '/Streaming/Channels/401', sub: '/Streaming/Channels/402' },
            { label: 'Compatibilità legacy ch01', main: '/ch01/0', sub: '/ch01/1' },
            { label: 'Flusso diretto /live', main: '/Streaming/Channels/1', sub: '/Streaming/Channels/2' }
        ]
    },
    {
        id: 'dahua',
        name: 'Dahua / Imou',
        port: 554,
        onvifPort: 80,
        description: 'Dahua / Imou / Lorex / Alhua',
        channels: [
            { label: 'Canale 1 (Main + Sub)', main: '/cam/realmonitor?channel=1&subtype=0', sub: '/cam/realmonitor?channel=1&subtype=1' },
            { label: 'Canale 2 (Main + Sub)', main: '/cam/realmonitor?channel=2&subtype=0', sub: '/cam/realmonitor?channel=2&subtype=1' },
            { label: 'Canale 3 (Main + Sub)', main: '/cam/realmonitor?channel=3&subtype=0', sub: '/cam/realmonitor?channel=3&subtype=1' },
            { label: 'Canale 4 (Main + Sub)', main: '/cam/realmonitor?channel=4&subtype=0', sub: '/cam/realmonitor?channel=4&subtype=1' }
        ]
    },
    {
        id: 'reolink',
        name: 'Reolink',
        port: 554,
        onvifPort: 8000,
        description: 'Reolink PoE / WiFi (H.264 profile)',
        channels: [
            { label: 'Canale 1 (H.264 Main + Sub)', main: '/h264Preview_01_main', sub: '/h264Preview_01_sub' },
            { label: 'Canale 1 (Preview)', main: '/Preview_01_main', sub: '/Preview_01_sub' }
        ]
    },
    {
        id: 'uniview',
        name: 'Uniview (UNV)',
        port: 554,
        onvifPort: 80,
        description: 'Uniview UNV NVR / IP Cameras',
        channels: [
            { label: 'Canale 1 Unicast', main: '/unicast/c1/s0/live', sub: '/unicast/c1/s1/live' },
            { label: 'Canale 2 Unicast', main: '/unicast/c2/s0/live', sub: '/unicast/c2/s1/live' },
            { label: 'Media Video', main: '/media/video1', sub: '/media/video2' }
        ]
    },
    {
        id: 'axis',
        name: 'Axis Communications',
        port: 554,
        onvifPort: 80,
        description: 'Axis VAPIX RTSP Engine',
        channels: [
            { label: 'Flusso primario H.264', main: '/axis-media/media.amp', sub: '/axis-media/media.amp?videokeyframeinterval=30' },
            { label: 'Canale 1 Quad', main: '/axis-media/media.amp?camera=1', sub: '/axis-media/media.amp?camera=1&fps=15' }
        ]
    },
    {
        id: 'amcrest',
        name: 'Amcrest',
        port: 554,
        onvifPort: 80,
        description: 'Amcrest HD / UltraHD',
        channels: [
            { label: 'Canale 1 (Main + Sub)', main: '/cam/realmonitor?channel=1&subtype=0', sub: '/cam/realmonitor?channel=1&subtype=1' },
            { label: 'Canale 2 (Main + Sub)', main: '/cam/realmonitor?channel=2&subtype=0', sub: '/cam/realmonitor?channel=2&subtype=1' }
        ]
    },
    {
        id: 'foscam',
        name: 'Foscam',
        port: 88,
        onvifPort: 888,
        description: 'Foscam IP HD Cameras',
        channels: [
            { label: 'Flusso 1 (Main + Sub)', main: '/videoMain', sub: '/videoSub' }
        ]
    },
    {
        id: 'vivotek',
        name: 'Vivotek',
        port: 554,
        onvifPort: 80,
        description: 'Vivotek IP Cameras',
        channels: [
            { label: 'Live Video 1 (Main + Sub)', main: '/live.sdp', sub: '/live2.sdp' }
        ]
    },
    {
        id: 'generic',
        name: 'Generico / ONVIF / Tuya / Tapo',
        port: 554,
        onvifPort: 80,
        description: 'Percorsi standard per telecamere generiche o compatibili ONVIF',
        channels: [
            { label: 'Standard stream1 / stream2', main: '/stream1', sub: '/stream2' },
            { label: 'Standard live/ch0 / live/ch1', main: '/live/ch0', sub: '/live/ch1' },
            { label: 'Standard /onvif1 / /onvif2', main: '/onvif1', sub: '/onvif2' },
            { label: 'Standard /h264 / /h264_sub', main: '/h264', sub: '/h264_sub' },
            { label: 'Tapo / SmartLife /ch1 / /ch2', main: '/stream1', sub: '/stream2' }
        ]
    }
]);

export function buildRtspUrl({ host, port = 554, path }) {
    const cleanHost = String(host ?? '').trim().replace(/^https?:\/\//i, '').replace(/^rtsp:\/\//i, '').split('/')[0].split(':')[0];
    const cleanPort = Number.parseInt(port, 10) || 554;
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    return 'rtsp://' + cleanHost + ':' + cleanPort + cleanPath;
}
