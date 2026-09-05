export const SFACE_COSINE_THRESHOLD = 0.363;

export function cosineSimilarity(a, b) {
    if (!a || !b || a.length === 0 || a.length !== b.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i += 1) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    if (normA <= 0 || normB <= 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function isFaceMatch(a, b, threshold = SFACE_COSINE_THRESHOLD) {
    return cosineSimilarity(a, b) >= threshold;
}

export function mergeEmbeddings(embeddings = []) {
    if (!Array.isArray(embeddings) || embeddings.length === 0) return null;
    const dim = embeddings[0].length;
    if (dim === 0) return null;

    const centroid = new Array(dim).fill(0);
    let validCount = 0;

    for (const emb of embeddings) {
        if (!emb || emb.length !== dim) continue;
        validCount += 1;
        for (let i = 0; i < dim; i += 1) {
            centroid[i] += emb[i];
        }
    }

    if (validCount === 0) return null;

    for (let i = 0; i < dim; i += 1) {
        centroid[i] /= validCount;
    }

    let norm = 0;
    for (let i = 0; i < dim; i += 1) {
        norm += centroid[i] * centroid[i];
    }
    const magnitude = Math.sqrt(norm);
    if (magnitude > 0) {
        for (let i = 0; i < dim; i += 1) {
            centroid[i] = Number((centroid[i] / magnitude).toFixed(6));
        }
    }

    return centroid;
}

export function findBestMatch(candidate, people = [], threshold = SFACE_COSINE_THRESHOLD) {
    if (!candidate || !Array.isArray(people) || people.length === 0) return null;

    let best = null;
    for (const person of people) {
        const sim = cosineSimilarity(candidate, person.embedding);
        if (sim >= threshold && (!best || sim > best.score)) {
            best = { person, score: Number(sim.toFixed(4)) };
        }
    }

    return best;
}

export function estimateFacePose3D(landmarks = []) {
    if (!Array.isArray(landmarks) || landmarks.length < 5) {
        return { yaw: 0, pitch: 0, roll: 0, pose: 'front' };
    }

    const [leftEye, rightEye, nose, leftMouth, rightMouth] = landmarks;
    const eyeDx = rightEye[0] - leftEye[0];
    const eyeDy = rightEye[1] - leftEye[1];
    const eyeDist = Math.sqrt(eyeDx * eyeDx + eyeDy * eyeDy) || 0.001;

    const rollRad = Math.atan2(eyeDy, eyeDx);
    const roll = Number((rollRad * (180 / Math.PI)).toFixed(1));

    const eyeMidX = (leftEye[0] + rightEye[0]) / 2;
    const eyeMidY = (leftEye[1] + rightEye[1]) / 2;
    const noseRelX = (nose[0] - eyeMidX) / eyeDist;
    const yaw = Number(Math.max(-90, Math.min(90, noseRelX * 120)).toFixed(1));

    const mouthMidY = (leftMouth[1] + rightMouth[1]) / 2;
    const faceHeight = Math.abs(mouthMidY - eyeMidY) || 0.001;
    const noseRelY = (nose[1] - eyeMidY) / faceHeight;
    const pitch = Number(Math.max(-90, Math.min(90, (noseRelY - 0.45) * 110)).toFixed(1));

    let pose = 'front';
    if (yaw < -18) pose = 'left';
    else if (yaw > 18) pose = 'right';
    else if (pitch < -15) pose = 'up';
    else if (pitch > 15) pose = 'down';

    return { yaw, pitch, roll, pose };
}

export function calculateBiometricMetrics(landmarks = [], box = [0, 0, 1, 1]) {
    if (!Array.isArray(landmarks) || landmarks.length < 5) {
        return null;
    }

    const [leftEye, rightEye, nose, leftMouth, rightMouth] = landmarks;
    const eyeDist = Math.hypot(rightEye[0] - leftEye[0], rightEye[1] - leftEye[1]);
    const mouthWidth = Math.hypot(rightMouth[0] - leftMouth[0], rightMouth[1] - leftMouth[1]);
    const noseToMouth = Math.hypot((leftMouth[0] + rightMouth[0]) / 2 - nose[0], (leftMouth[1] + rightMouth[1]) / 2 - nose[1]);
    const boxW = Math.max(0.001, box[2] ?? 1);
    const boxH = Math.max(0.001, box[3] ?? 1);

    const interocularRatio = Number((eyeDist / boxW).toFixed(3));
    const mouthToEyeRatio = Number((mouthWidth / Math.max(0.001, eyeDist)).toFixed(3));
    const noseMouthRatio = Number((noseToMouth / boxH).toFixed(3));

    const leftDist = Math.hypot(nose[0] - leftEye[0], nose[1] - leftEye[1]);
    const rightDist = Math.hypot(rightEye[0] - nose[0], rightEye[1] - nose[1]);
    const symmetry = Number((Math.min(leftDist, rightDist) / Math.max(0.001, Math.max(leftDist, rightDist))).toFixed(3));

    return {
        interocularRatio,
        mouthToEyeRatio,
        noseMouthRatio,
        symmetry
    };
}

export function updateMovingCentroid(currentEmbedding = [], newEmbedding = [], weight = 0.88) {
    if (!Array.isArray(currentEmbedding) || currentEmbedding.length === 0) return newEmbedding;
    if (!Array.isArray(newEmbedding) || newEmbedding.length !== currentEmbedding.length) return currentEmbedding;

    const dim = currentEmbedding.length;
    const updated = new Array(dim);
    let norm = 0;

    for (let i = 0; i < dim; i += 1) {
        const val = currentEmbedding[i] * weight + newEmbedding[i] * (1 - weight);
        updated[i] = val;
        norm += val * val;
    }

    const mag = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i += 1) {
        updated[i] = Number((updated[i] / mag).toFixed(6));
    }

    return updated;
}
