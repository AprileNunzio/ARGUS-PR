const HEADER_BYTES = 8;

function readBoxes(buffer) {
    const boxes = [];
    let offset = 0;

    while (offset + HEADER_BYTES <= buffer.length) {
        const size = buffer.readUInt32BE(offset);
        if (size < HEADER_BYTES) break;
        if (offset + size > buffer.length) break;

        boxes.push({
            type: buffer.toString('ascii', offset + 4, offset + 8),
            start: offset,
            end: offset + size
        });

        offset += size;
    }

    return { boxes, consumed: offset };
}

export function createFragmentSplitter(onInit, onFragment) {
    let pending = Buffer.alloc(0);
    let initSent = false;
    let fragmentStart = -1;

    return function push(chunk) {
        pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);

        const { boxes, consumed } = readBoxes(pending);
        if (boxes.length === 0) return;

        if (!initSent) {
            const firstMoof = boxes.findIndex((box) => box.type === 'moof');
            if (firstMoof < 0) return;

            const initEnd = boxes[firstMoof].start;
            if (initEnd > 0) {
                onInit(Buffer.from(pending.subarray(0, initEnd)));
                initSent = true;
                fragmentStart = initEnd;
            }
        }

        if (!initSent) return;

        let lastComplete = fragmentStart;
        for (const box of boxes) {
            if (box.start < fragmentStart) continue;
            if (box.type === 'moof' && box.start > lastComplete) {
                onFragment(Buffer.from(pending.subarray(lastComplete, box.start)));
                lastComplete = box.start;
            }
        }

        const tail = boxes[boxes.length - 1];
        if (tail && tail.type === 'mdat' && tail.end <= consumed && tail.end > lastComplete) {
            onFragment(Buffer.from(pending.subarray(lastComplete, tail.end)));
            lastComplete = tail.end;
        }

        if (lastComplete > 0) {
            pending = Buffer.from(pending.subarray(lastComplete));
            fragmentStart = 0;
        }
    };
}
