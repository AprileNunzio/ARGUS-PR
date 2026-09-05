import os

import cv2
import numpy as np

def enroll_face_from_image(models_dir, image_path):
    if not os.path.isfile(image_path):
        return {'ok': False, 'error': f"File non trovato: {image_path}"}

    yunet_path = os.path.join(models_dir, 'face_detection_yunet_2023mar.onnx')
    sface_path = os.path.join(models_dir, 'face_recognition_sface_2021dec.onnx')
    if not os.path.isfile(yunet_path) or not os.path.isfile(sface_path):
        return {'ok': False, 'error': "Modelli YuNet/SFace non presenti"}

    img = cv2.imread(image_path)
    if img is None:
        return {'ok': False, 'error': "Impossibile decodificare l'immagine"}

    h, w = img.shape[:2]
    det = cv2.FaceDetectorYN.create(yunet_path, "", (w, h), 0.5, 0.3, 5000)
    rec = cv2.FaceRecognizerSF.create(sface_path, "")

    _, faces = det.detect(img)
    if faces is None or len(faces) == 0:
        return {'ok': False, 'error': "Nessun volto rilevato nella fotografia"}

    best_face = max(faces, key=lambda f: float(f[2]) * float(f[3]))
    fx, fy, fw, fh = best_face[:4]
    aligned = rec.alignCrop(img, best_face)
    feat = rec.feature(aligned).flatten()
    feat = feat / np.linalg.norm(feat)

    crop = img[max(0, int(fy)):min(h, int(fy+fh)), max(0, int(fx)):min(w, int(fx+fw))]
    crop_thumb = cv2.resize(crop, (128, 128)) if crop.size > 0 else aligned
    _, buf = cv2.imencode('.jpg', crop_thumb, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
    import base64
    thumb_b64 = "data:image/jpeg;base64," + base64.b64encode(buf).decode('ascii')

    landmarks = []
    if len(best_face) >= 14:
        for i in range(4, 14, 2):
            landmarks.append([round(float(best_face[i]) / w, 4), round(float(best_face[i+1]) / h, 4)])

    pose3d = {'yaw': 0, 'pitch': 0, 'roll': 0, 'pose': 'front'}
    if len(landmarks) >= 5:
        left_eye, right_eye, nose, left_mouth, right_mouth = landmarks[:5]
        eye_dx = right_eye[0] - left_eye[0]
        eye_dy = right_eye[1] - left_eye[1]
        eye_dist = (eye_dx * eye_dx + eye_dy * eye_dy) ** 0.5 or 0.001
        roll = round((np.arctan2(eye_dy, eye_dx) * (180 / np.pi)), 1)
        eye_mid_x = (left_eye[0] + right_eye[0]) / 2
        eye_mid_y = (left_eye[1] + right_eye[1]) / 2
        yaw = round(float(np.clip(((nose[0] - eye_mid_x) / eye_dist) * 120, -90, 90)), 1)
        face_h = abs((left_mouth[1] + right_mouth[1]) / 2 - eye_mid_y) or 0.001
        pitch = round(float(np.clip(((nose[1] - eye_mid_y) / face_h - 0.45) * 110, -90, 90)), 1)
        tag = 'front'
        if yaw < -18: tag = 'left'
        elif yaw > 18: tag = 'right'
        elif pitch < -15: tag = 'up'
        elif pitch > 15: tag = 'down'
        pose3d = {'yaw': yaw, 'pitch': pitch, 'roll': roll, 'pose': tag}

    return {
        'ok': True,
        'confidence': round(float(best_face[-1]), 3),
        'box': [round(float(fx)/w, 4), round(float(fy)/h, 4), round(float(fw)/w, 4), round(float(fh)/h, 4)],
        'embedding': [round(float(v), 6) for v in feat],
        'landmarks': landmarks,
        'pose3d': pose3d,
        'thumbnail': thumb_b64
    }
