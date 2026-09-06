import { icon } from '/assets/icons.js';

const TARGET_RATE = 8000;
const CHUNK_SAMPLES = 1024;

function node(tag, props = {}, children = []) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined) continue;
        if (key === 'className' || key === 'textContent') element[key] = value;
        else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2).toLowerCase(), value);
        else element.setAttribute(key, value);
    }
    for (const child of [].concat(children)) {
        if (child) element.append(child);
    }
    return element;
}

export function downsample(input, fromRate, toRate) {
    if (toRate >= fromRate) return input;

    const ratio = fromRate / toRate;
    const length = Math.floor(input.length / ratio);
    const output = new Float32Array(length);

    for (let index = 0; index < length; index += 1) {
        const start = Math.floor(index * ratio);
        const end = Math.min(Math.floor((index + 1) * ratio), input.length);
        let total = 0;
        for (let cursor = start; cursor < end; cursor += 1) total += input[cursor];
        output[index] = end > start ? total / (end - start) : 0;
    }

    return output;
}

export function toPcm16(samples) {
    const buffer = new ArrayBuffer(samples.length * 2);
    const view = new DataView(buffer);

    for (let index = 0; index < samples.length; index += 1) {
        const clamped = Math.max(-1, Math.min(1, samples[index]));
        view.setInt16(index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    }

    return buffer;
}

export function createClipMenu({ cameraId, onNotice, listClips, sendClip }) {
    const element = node('div', { className: 'console__clips', hidden: 'hidden' });
    let loaded = false;

    const paint = (clips) => {
        if (clips.length === 0) {
            element.replaceChildren(node('p', {
                className: 'console__clips-empty',
                textContent: 'Nessun messaggio registrato. Caricali in Sistema, Audio e messaggi.'
            }));
            return;
        }

        element.replaceChildren(...clips.map((clip) => node('button', {
            type: 'button',
            className: 'console__clip-btn',
            title: clip.description ?? clip.name,
            onclick: async (event) => {
                event.stopPropagation();
                const button = event.currentTarget;
                button.disabled = true;
                await sendClip(cameraId, clip.id)
                    .then(() => onNotice(`Messaggio "${clip.name}" riprodotto sulla telecamera`))
                    .catch((error) => onNotice(`Messaggio: ${error.message}`));
                button.disabled = false;
            }
        }, [icon('speaker'), node('span', { textContent: clip.name })])));
    };

    return {
        element,
        async toggle() {
            if (!element.hidden) {
                element.hidden = true;
                return false;
            }

            if (!loaded) {
                const clips = await listClips().catch(() => []);
                paint(clips);
                loaded = true;
            }

            element.hidden = false;
            return true;
        },
        hide() {
            element.hidden = true;
        }
    };
}

export function createMicrophone({ cameraId, onNotice }) {
    let socket = null;
    let context = null;
    let source = null;
    let processor = null;
    let stream = null;

    const stop = async () => {
        processor?.disconnect();
        source?.disconnect();
        for (const track of stream?.getTracks() ?? []) track.stop();
        await context?.close().catch(() => null);
        if (socket && socket.readyState <= 1) socket.close();

        processor = null;
        source = null;
        stream = null;
        context = null;
        socket = null;
    };

    const start = async () => {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('il browser non espone il microfono');

        stream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
        });

        context = new AudioContext();
        source = context.createMediaStreamSource(stream);
        processor = context.createScriptProcessor(CHUNK_SAMPLES, 1, 1);

        const endpoint = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/audio/talk/${encodeURIComponent(cameraId)}`;
        socket = new WebSocket(endpoint);
        socket.binaryType = 'arraybuffer';

        await new Promise((resolve, reject) => {
            socket.addEventListener('open', resolve, { once: true });
            socket.addEventListener('error', () => reject(new Error('la telecamera ha rifiutato il canale audio')), { once: true });
        });

        socket.addEventListener('message', (event) => {
            const payload = JSON.parse(String(event.data));
            if (payload.type === 'error') onNotice(`Microfono: ${payload.message}`);
        });

        socket.addEventListener('close', () => {
            stop();
            onNotice('Microfono chiuso');
        });

        processor.addEventListener('audioprocess', (event) => {
            if (!socket || socket.readyState !== WebSocket.OPEN) return;
            const samples = downsample(event.inputBuffer.getChannelData(0), context.sampleRate, TARGET_RATE);
            socket.send(toPcm16(samples));
        });

        source.connect(processor);
        processor.connect(context.destination);
    };

    return {
        active: () => socket !== null,
        async toggle() {
            if (socket) {
                await stop();
                return false;
            }

            await start().catch(async (error) => {
                await stop();
                throw error;
            });

            return true;
        },
        stop
    };
}
