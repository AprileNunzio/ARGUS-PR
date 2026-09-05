const MAX_OBSERVATIONS = 240;
const MIN_SAMPLE_WEIGHT = 0.12;
const TRACKED_RATIOS = ['interocular', 'mouthToEye', 'noseToMouth', 'symmetry'];

export function deriveBiometrics(landmarks = [], box = [0, 0, 1, 1]) {
    if (!Array.isArray(landmarks) || landmarks.length < 5) return null;

    const [leftEye, rightEye, nose, leftMouth, rightMouth] = landmarks;
    const eyeDist = Math.hypot(rightEye[0] - leftEye[0], rightEye[1] - leftEye[1]);
    if (!(eyeDist > 0)) return null;

    const mouthWidth = Math.hypot(rightMouth[0] - leftMouth[0], rightMouth[1] - leftMouth[1]);
    const noseToMouth = Math.hypot(
        (leftMouth[0] + rightMouth[0]) / 2 - nose[0],
        (leftMouth[1] + rightMouth[1]) / 2 - nose[1]
    );
    const leftDist = Math.hypot(nose[0] - leftEye[0], nose[1] - leftEye[1]);
    const rightDist = Math.hypot(rightEye[0] - nose[0], rightEye[1] - nose[1]);
    const boxWidth = Math.max(0.001, box[2] ?? 1);

    return {
        interocular: Number((eyeDist / boxWidth).toFixed(4)),
        mouthToEye: Number((mouthWidth / eyeDist).toFixed(3)),
        noseToMouth: Number((noseToMouth / eyeDist).toFixed(3)),
        symmetry: Number((Math.min(leftDist, rightDist) / Math.max(0.001, Math.max(leftDist, rightDist))).toFixed(3))
    };
}

export function sampleWeight({ pose = {}, confidence = 1 } = {}) {
    const yaw = Math.abs(Number(pose.yaw) || 0);
    const pitch = Math.abs(Number(pose.pitch) || 0);
    const frontality = Math.max(0, 1 - yaw / 55) * Math.max(0, 1 - pitch / 45);
    const clean = Math.min(1, Math.max(0, Number(confidence) || 0));
    return Math.max(0, Number((frontality * clean).toFixed(4)));
}

export function blendFaceGeometry(current = {}, sample = {}) {
    const incoming = sample.biometrics;
    if (!incoming) return null;

    const weight = sampleWeight(sample);
    if (weight < MIN_SAMPLE_WEIGHT) return null;

    const observed = Math.min(MAX_OBSERVATIONS, Number(current.observations) || 0);
    const previous = current.biometrics ?? {};
    const blended = {};

    for (const key of TRACKED_RATIOS) {
        const incomingValue = Number(incoming[key]);
        if (!Number.isFinite(incomingValue)) continue;
        const previousValue = Number(previous[key]);
        blended[key] = Number.isFinite(previousValue) && observed > 0
            ? Number(((previousValue * observed + incomingValue * weight) / (observed + weight)).toFixed(4))
            : Number(incomingValue.toFixed(4));
    }

    if (Object.keys(blended).length === 0) return null;

    const currentFrontality = sampleWeight({ pose: current, confidence: 1 });
    const takePose = observed === 0 || sampleWeight({ pose: sample.pose ?? {}, confidence: 1 }) > currentFrontality;
    const pose = takePose ? (sample.pose ?? {}) : current;

    return {
        ...current,
        biometrics: blended,
        observations: Number((observed + weight).toFixed(3)),
        yaw: pose.yaw ?? current.yaw ?? 0,
        pitch: pose.pitch ?? current.pitch ?? 0,
        roll: pose.roll ?? current.roll ?? 0,
        pose: pose.pose ?? current.pose ?? 'front',
        landmarkCount: sample.landmarkCount ?? current.landmarkCount ?? 0,
        mesh: sample.mesh ?? current.mesh
    };
}
