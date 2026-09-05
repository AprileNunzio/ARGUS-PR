import { randomUUID } from 'node:crypto';

export function intersectionOverUnion(a, b) {
    if (!a || !b) return 0;
    const x1 = Math.max(a[0], b[0]);
    const y1 = Math.max(a[1], b[1]);
    const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
    const y2 = Math.min(a[1] + a[3], b[1] + b[3]);

    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    const inter = w * h;
    const union = a[2] * a[3] + b[2] * b[3] - inter;
    return union > 0 ? inter / union : 0;
}

export class Tracker {
    constructor({ iouThreshold = 0.3, minHits = 3, maxMisses = 5 } = {}) {
        this.iouThreshold = iouThreshold;
        this.minHits = minHits;
        this.maxMisses = maxMisses;
        this.tracks = new Map();
    }

    update(detections = [], timestamp = Date.now()) {
        const unmatchedTracks = new Set(this.tracks.keys());
        const unmatchedDets = new Set(detections.map((_, i) => i));

        const matches = [];
        for (const [trackId, track] of this.tracks.entries()) {
            for (let i = 0; i < detections.length; i += 1) {
                const det = detections[i];
                if (det.className !== track.className) continue;
                const iou = intersectionOverUnion(track.box, det.box);
                if (iou >= this.iouThreshold) {
                    matches.push({ trackId, detIndex: i, iou });
                }
            }
        }

        matches.sort((a, b) => b.iou - a.iou);

        const assignedTracks = new Set();
        const assignedDets = new Set();
        const newlyConfirmed = [];

        for (const match of matches) {
            if (assignedTracks.has(match.trackId) || assignedDets.has(match.detIndex)) continue;
            assignedTracks.add(match.trackId);
            assignedDets.add(match.detIndex);
            unmatchedTracks.delete(match.trackId);
            unmatchedDets.delete(match.detIndex);

            const track = this.tracks.get(match.trackId);
            const det = detections[match.detIndex];

            track.hits += 1;
            track.misses = 0;
            track.box = det.box;
            track.endedAt = timestamp;

            if (det.confidence > track.maxConfidence) {
                track.maxConfidence = det.confidence;
                track.bestBox = det.box;
            }

            if (det.plateText) {
                track.plateReadings.push({ text: det.plateText, confidence: det.confidence });
            }

            if (det.faceEmbedding || det.snapshotBase64) {
                track.faceEmbeddings.push({ embedding: det.faceEmbedding, confidence: det.confidence, snapshotBase64: det.snapshotBase64, landmarks: det.landmarks ?? null });
            }

            if (det.upperColor && !track.upperColor) {
                track.upperColor = det.upperColor;
            }

            if (!track.isConfirmed && track.hits >= this.minHits) {
                track.isConfirmed = true;
                newlyConfirmed.push(track);
            }
        }

        for (const detIndex of unmatchedDets) {
            const det = detections[detIndex];
            const newTrackId = randomUUID();
            const track = {
                id: newTrackId,
                className: det.className,
                box: det.box,
                bestBox: det.box,
                maxConfidence: det.confidence,
                startedAt: timestamp,
                endedAt: timestamp,
                hits: 1,
                misses: 0,
                isConfirmed: this.minHits <= 1,
                plateReadings: det.plateText ? [{ text: det.plateText, confidence: det.confidence }] : [],
                faceEmbeddings: (det.faceEmbedding || det.snapshotBase64) ? [{ embedding: det.faceEmbedding, confidence: det.confidence, snapshotBase64: det.snapshotBase64, landmarks: det.landmarks ?? null }] : [],
                upperColor: det.upperColor ?? null
            };

            this.tracks.set(newTrackId, track);
            if (track.isConfirmed) {
                newlyConfirmed.push(track);
            }
        }

        const closedTracks = [];
        for (const trackId of unmatchedTracks) {
            const track = this.tracks.get(trackId);
            track.misses += 1;
            if (track.misses >= this.maxMisses) {
                this.tracks.delete(trackId);
                if (track.isConfirmed) {
                    closedTracks.push(track);
                }
            }
        }

        return {
            activeTracks: Array.from(this.tracks.values()).filter((t) => t.isConfirmed),
            newlyConfirmed,
            closedTracks
        };
    }
}
