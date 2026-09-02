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
