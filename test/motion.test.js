import test from 'node:test';
import assert from 'node:assert/strict';
import {
    MotionDetector,
    FRAME_WIDTH,
    FRAME_HEIGHT,
    FRAME_BYTES
} from '../src/features/motion/motion_detector.js';

function createBlankFrame(val = 0) {
    const buf = Buffer.alloc(FRAME_BYTES);
    buf.fill(val);
    return buf;
}

test('fotogramma identico ripetuto non genera nessun evento', () => {
    const detector = new MotionDetector();
    const frame = createBlankFrame(128);

    for (let i = 0; i < 300; i += 1) {
        const events = detector.processFrame(frame, 1000 + i * 200);
        assert.equal(events.length, 0);
    }
});

test('fotogramma nero fisso non genera nessun evento', () => {
    const detector = new MotionDetector();
    const frame = createBlankFrame(0);

    for (let i = 0; i < 100; i += 1) {
        const events = detector.processFrame(frame, 1000 + i * 200);
        assert.equal(events.length, 0);
    }
});

test('rumore casuale sotto la soglia non genera eventi', () => {
    const detector = new MotionDetector([], { pixelThreshold: 25 });
    const base = createBlankFrame(100);
    detector.processFrame(base, 1000);

    for (let i = 0; i < 50; i += 1) {
        const noisy = Buffer.alloc(FRAME_BYTES);
        for (let j = 0; j < FRAME_BYTES; j += 1) {
            const jitter = ((j * 17 + i * 31) % 21) - 10;
            noisy[j] = 100 + jitter;
        }
        const events = detector.processFrame(noisy, 1000 + (i + 1) * 200);
        assert.equal(events.length, 0);
    }
});

test('guardia sul cambio di luce azzera lo sfondo e non emette eventi', () => {
    const detector = new MotionDetector();
    const black = createBlankFrame(0);
    detector.processFrame(black, 1000);

    const white = createBlankFrame(255);
    const events = detector.processFrame(white, 1200);
    assert.equal(events.length, 0);
});

test('rettangolo in zona A attiva solo zona A e non zona B', () => {
    const zoneA = {
        id: 'zone-a',
        name: 'Sinistra',
        points: [[0, 0], [0.5, 0], [0.5, 1], [0, 1]],
        sensitivity: 0.015,
        cooldownSeconds: 15
    };
    const zoneB = {
        id: 'zone-b',
        name: 'Destra',
        points: [[0.5, 0], [1, 0], [1, 1], [0.5, 1]],
        sensitivity: 0.015,
        cooldownSeconds: 15
    };

    const detector = new MotionDetector([zoneA, zoneB]);
    const black = createBlankFrame(0);
    detector.processFrame(black, 1000);

    const modified = createBlankFrame(0);
    for (let y = 10; y < 40; y += 1) {
        for (let x = 10; x < 40; x += 1) {
            modified[y * FRAME_WIDTH + x] = 255;
        }
    }

    let detectedEvents = [];
    for (let i = 0; i < 5; i += 1) {
        const ev = detector.processFrame(modified, 1200 + i * 200);
        detectedEvents.push(...ev);
    }

    const startA = detectedEvents.find((e) => e.type === 'motion_start' && e.zoneId === 'zone-a');
    const startB = detectedEvents.find((e) => e.type === 'motion_start' && e.zoneId === 'zone-b');

    assert.ok(startA);
    assert.equal(startB, undefined);
});

test('rettangolo sotto la soglia di area non genera eventi', () => {
    const detector = new MotionDetector([], { sensitivity: 0.015 });
    const black = createBlankFrame(0);
    detector.processFrame(black, 1000);

    const tinyBox = createBlankFrame(0);
    for (let y = 10; y < 15; y += 1) {
        for (let x = 10; x < 15; x += 1) {
            tinyBox[y * FRAME_WIDTH + x] = 255;
        }
    }

    for (let i = 0; i < 5; i += 1) {
        const events = detector.processFrame(tinyBox, 1200 + i * 200);
        assert.equal(events.length, 0);
    }
});

test('isteresi richiede 2 frame per accensione e 10 per spegnimento', () => {
    const detector = new MotionDetector([], { sensitivity: 0.015 });
    const black = createBlankFrame(0);
    detector.processFrame(black, 1000);

    const activeFrame = createBlankFrame(0);
    for (let y = 20; y < 60; y += 1) {
        for (let x = 20; x < 60; x += 1) {
            activeFrame[y * FRAME_WIDTH + x] = 255;
        }
    }

    const firstActive = detector.processFrame(activeFrame, 1200);
    assert.equal(firstActive.length, 0);

    const secondActive = detector.processFrame(activeFrame, 1400);
    assert.equal(secondActive.length, 1);
    assert.equal(secondActive[0].type, 'motion_start');

    for (let i = 0; i < 9; i += 1) {
        const quiet = detector.processFrame(black, 1600 + i * 200);
        assert.equal(quiet.length, 0);
    }

    const tenthQuiet = detector.processFrame(black, 3400);
    assert.equal(tenthQuiet.length, 1);
    assert.equal(tenthQuiet[0].type, 'motion_end');
});

test('sensibilita aumentata a 0.001 rileva variazioni minime', () => {
    const detector = new MotionDetector([], { sensitivity: 0.001 });
    const black = createBlankFrame(0);
    detector.processFrame(black, 1000);

    const smallChange = createBlankFrame(0);
    for (let y = 10; y < 15; y += 1) {
        for (let x = 10; x < 15; x += 1) {
            smallChange[y * FRAME_WIDTH + x] = 255;
        }
    }

    detector.processFrame(smallChange, 1200);
    const events = detector.processFrame(smallChange, 1400);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'motion_start');
});

test('cooldown impedisce emissioni multiple ravvicinate', () => {
    const detector = new MotionDetector([], { sensitivity: 0.015, cooldownSeconds: 15 });
    const black = createBlankFrame(0);
    detector.processFrame(black, 1000);

    const activeFrame = createBlankFrame(0);
    for (let y = 20; y < 60; y += 1) {
        for (let x = 20; x < 60; x += 1) {
            activeFrame[y * FRAME_WIDTH + x] = 255;
        }
    }

    detector.processFrame(activeFrame, 1200);
    const start1 = detector.processFrame(activeFrame, 1400);
    assert.equal(start1.length, 1);

    for (let i = 0; i < 10; i += 1) {
        detector.processFrame(black, 1600 + i * 200);
    }

    detector.processFrame(activeFrame, 5000);
    const duringCooldown = detector.processFrame(activeFrame, 5200);
    assert.equal(duringCooldown.length, 0);

    for (let i = 0; i < 10; i += 1) {
        detector.processFrame(black, 6000 + i * 200);
    }

    detector.processFrame(activeFrame, 20000);
    const afterCooldown = detector.processFrame(activeFrame, 20200);
    assert.equal(afterCooldown.length, 1);
    assert.equal(afterCooldown[0].type, 'motion_start');
});

