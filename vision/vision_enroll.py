import base64
import os

import cv2
import numpy as np

from vision_landmarks import dense_landmarks

THUMB_SIZE = 256
CROP_MARGIN = 0.35


def _detect(det, img):
    h, w = img.shape[:2]
    det.setInputSize((w, h))
    _, faces = det.detect(img)
    if faces is None or len(faces) == 0:
        return None
    return max(faces, key=lambda f: float(f[2]) * float(f[3]))


def _detect_with_retry(det, img):
    face = _detect(det, img)
    if face is not None:
        return face, img

    upscaled = cv2.resize(img, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    face = _detect(det, upscaled)
    if face is not None:
        return face, upscaled

    pad_y = int(upscaled.shape[0] * 0.4)
    pad_x = int(upscaled.shape[1] * 0.4)
    padded = cv2.copyMakeBorder(upscaled, pad_y, pad_y, pad_x, pad_x, cv2.BORDER_REPLICATE)
    face = _detect(det, padded)
    if face is not None:
        return face, padded

    return None, img


def _crop_with_margin(img, box):
    h, w = img.shape[:2]
    fx, fy, fw, fh = [float(v) for v in box[:4]]
    mx = fw * CROP_MARGIN
    my = fh * CROP_MARGIN
    x0 = max(0, int(fx - mx))
    y0 = max(0, int(fy - my))
    x1 = min(w, int(fx + fw + mx))
    y1 = min(h, int(fy + fh + my))
    if x1 <= x0 or y1 <= y0:
        return None
    return img[y0:y1, x0:x1]


def _encode_thumb(crop):
    thumb = cv2.resize(crop, (THUMB_SIZE, THUMB_SIZE), interpolation=cv2.INTER_CUBIC)
    ok, buf = cv2.imencode('.jpg', thumb, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
    if not ok:
        return None
    return 'data:image/jpeg;base64,' + base64.b64encode(buf).decode('ascii')


def _sparse_landmarks(face, w, h):
    points = []
    if len(face) >= 14:
        for i in range(4, 14, 2):
            points.append([round(float(face[i]) / w, 4), round(float(face[i + 1]) / h, 4)])
    return points


def _pose_from_sparse(points):
    if len(points) < 5:
        return {'yaw': 0, 'pitch': 0, 'roll': 0, 'pose': 'front'}

    left_eye, right_eye, nose, left_mouth, right_mouth = points[:5]
    eye_dx = right_eye[0] - left_eye[0]
    eye_dy = right_eye[1] - left_eye[1]
    eye_dist = (eye_dx * eye_dx + eye_dy * eye_dy) ** 0.5 or 0.001
    roll = round(float(np.arctan2(eye_dy, eye_dx) * (180 / np.pi)), 1)
    eye_mid_x = (left_eye[0] + right_eye[0]) / 2
    eye_mid_y = (left_eye[1] + right_eye[1]) / 2
    yaw = round(float(np.clip(((nose[0] - eye_mid_x) / eye_dist) * 120, -90, 90)), 1)
    face_h = abs((left_mouth[1] + right_mouth[1]) / 2 - eye_mid_y) or 0.001
    pitch = round(float(np.clip(((nose[1] - eye_mid_y) / face_h - 0.45) * 110, -90, 90)), 1)

    tag = 'front'
    if yaw < -18:
        tag = 'left'
    elif yaw > 18:
        tag = 'right'
    elif pitch < -15:
        tag = 'up'
    elif pitch > 15:
        tag = 'down'
    return {'yaw': yaw, 'pitch': pitch, 'roll': roll, 'pose': tag}


def _biometrics(points):
    if len(points) < 5:
        return None
    left_eye, right_eye, nose, left_mouth, right_mouth = points[:5]
    eye_dist = float(np.hypot(right_eye[0] - left_eye[0], right_eye[1] - left_eye[1])) or 0.001
    mouth_width = float(np.hypot(right_mouth[0] - left_mouth[0], right_mouth[1] - left_mouth[1]))
    nose_mouth = float(np.hypot((left_mouth[0] + right_mouth[0]) / 2 - nose[0],
                                (left_mouth[1] + right_mouth[1]) / 2 - nose[1]))
    left_dist = float(np.hypot(nose[0] - left_eye[0], nose[1] - left_eye[1]))
    right_dist = float(np.hypot(right_eye[0] - nose[0], right_eye[1] - nose[1]))
    return {
        'interocular': round(eye_dist, 4),
        'mouthToEye': round(mouth_width / eye_dist, 3),
        'noseToMouth': round(nose_mouth / eye_dist, 3),
        'symmetry': round(min(left_dist, right_dist) / max(0.001, max(left_dist, right_dist)), 3)
    }


def enroll_face_from_image(models_dir, image_path):
    if not os.path.isfile(image_path):
        return {'ok': False, 'error': "File non trovato: %s" % image_path}

    yunet_path = os.path.join(models_dir, 'face_detection_yunet_2023mar.onnx')
    sface_path = os.path.join(models_dir, 'face_recognition_sface_2021dec.onnx')
    if not os.path.isfile(yunet_path) or not os.path.isfile(sface_path):
        return {'ok': False, 'error': "Modelli YuNet/SFace non presenti: esegui il provisioning del motore vision"}

    img = cv2.imread(image_path)
    if img is None:
        return {'ok': False, 'error': "Impossibile decodificare l'immagine"}

    det = cv2.FaceDetectorYN.create(yunet_path, "", (img.shape[1], img.shape[0]), 0.5, 0.3, 5000)
    face, working = _detect_with_retry(det, img)
    if face is None:
        return {'ok': False, 'error': "Nessun volto rilevato: usa una foto più ravvicinata, frontale e luminosa"}

    rec = cv2.FaceRecognizerSF.create(sface_path, "")
    aligned = rec.alignCrop(working, face)
    feat = rec.feature(aligned).flatten()
    norm = np.linalg.norm(feat)
    if norm <= 0:
        return {'ok': False, 'error': "Estrazione del vettore biometrico non riuscita"}
    feat = feat / norm

    h, w = working.shape[:2]
    crop = _crop_with_margin(working, face)
    thumb_b64 = _encode_thumb(crop if crop is not None and crop.size > 0 else aligned)
    if thumb_b64 is None:
        return {'ok': False, 'error': "Codifica della miniatura non riuscita"}

    sparse = _sparse_landmarks(face, w, h)
    pose3d = _pose_from_sparse(sparse)
    pose3d['biometrics'] = _biometrics(sparse)
    pose3d['landmarkCount'] = len(sparse)

    mesh = dense_landmarks(models_dir, aligned)
    if mesh:
        pose3d['mesh'] = mesh
        pose3d['landmarkCount'] = len(mesh)

    fx, fy, fw, fh = [float(v) for v in face[:4]]
    return {
        'ok': True,
        'confidence': round(float(face[-1]), 3),
        'box': [round(fx / w, 4), round(fy / h, 4), round(fw / w, 4), round(fh / h, 4)],
        'embedding': [round(float(v), 6) for v in feat],
        'landmarks': sparse,
        'pose3d': pose3d,
        'thumbnail': thumb_b64
    }
