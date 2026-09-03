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
    crop_thumb = cv2.resize(crop, (120, 120)) if crop.size > 0 else aligned
    _, buf = cv2.imencode('.jpg', crop_thumb, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    import base64
    thumb_b64 = "data:image/jpeg;base64," + base64.b64encode(buf).decode('ascii')

    return {
        'ok': True,
        'confidence': round(float(best_face[-1]), 3),
        'box': [round(float(fx)/w, 4), round(float(fy)/h, 4), round(float(fw)/w, 4), round(float(fh)/h, 4)],
        'embedding': [round(float(v), 6) for v in feat],
        'thumbnail': thumb_b64
    }
