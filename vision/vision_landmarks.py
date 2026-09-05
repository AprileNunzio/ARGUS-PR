import os

import numpy as np

FACEMESH_FILENAME = 'face_landmarks_478.onnx'
_SESSION_CACHE = {}


def _load_session(models_dir):
    path = os.path.join(models_dir, FACEMESH_FILENAME)
    if not os.path.isfile(path):
        return None
    if path in _SESSION_CACHE:
        return _SESSION_CACHE[path]
    import onnxruntime as ort
    session = ort.InferenceSession(path, providers=['CPUExecutionProvider'])
    _SESSION_CACHE[path] = session
    return session


def _pick_mesh_output(outputs):
    best = None
    for tensor in outputs:
        flat = np.asarray(tensor).reshape(-1)
        if flat.size % 3 != 0:
            continue
        count = flat.size // 3
        if count < 400:
            continue
        if best is None or count > best.size // 3:
            best = flat
    return best


def dense_landmarks(models_dir, face_crop_bgr):
    session = _load_session(models_dir)
    if session is None:
        return None

    import cv2
    spec = session.get_inputs()[0]
    shape = [d if isinstance(d, int) and d > 0 else 192 for d in spec.shape]
    size = shape[2] if len(shape) == 4 and shape[1] == 3 else shape[1]

    resized = cv2.resize(face_crop_bgr, (size, size))
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    if len(shape) == 4 and shape[1] == 3:
        tensor = np.transpose(rgb, (2, 0, 1))[None, ...]
    else:
        tensor = rgb[None, ...]

    outputs = session.run(None, {spec.name: tensor})
    mesh = _pick_mesh_output(outputs)
    if mesh is None:
        return None

    points = mesh.reshape(-1, 3)
    scale = float(size)
    return [
        [round(float(p[0]) / scale, 4), round(float(p[1]) / scale, 4), round(float(p[2]) / scale, 4)]
        for p in points
    ]
