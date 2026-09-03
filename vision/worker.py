import sys
import os
import time
import json
import argparse
import re
import numpy as np

COCO_CLASSES = {
    0: 'person',
    1: 'bicycle',
    2: 'car',
    3: 'motorcycle',
    5: 'bus',
    7: 'truck',
    14: 'bird',
    15: 'cat',
    16: 'dog',
    17: 'horse',
    18: 'sheep',
    19: 'cow',
    21: 'bear'
}

VEHICLE_CLASSES = {'car', 'truck', 'bus', 'motorcycle'}

CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
GLYPHS = {}

def get_glyph_templates():
    global GLYPHS
    if not GLYPHS:
        for ch in CHARS:
            img = np.zeros((32, 20), dtype=np.uint8)
            cv2.putText(img, ch, (2, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.8, 255, 2, cv2.LINE_AA)
            GLYPHS[ch] = img
    return GLYPHS

def letterbox(img, target_size=(416, 416)):
    ih, iw = img.shape[:2]
    th, tw = target_size
    scale = min(tw / iw, th / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LINEAR)
    canvas = np.full((th, tw, 3), 114, dtype=np.uint8)
    dx = (tw - nw) // 2
    dy = (th - nh) // 2
    canvas[dy:dy + nh, dx:dx + nw] = resized
    return canvas, scale, dx, dy

def nms(boxes, scores, iou_threshold=0.45):
    if len(boxes) == 0:
        return []
    x1 = boxes[:, 0]
    y1 = boxes[:, 1]
    x2 = boxes[:, 0] + boxes[:, 2]
    y2 = boxes[:, 1] + boxes[:, 3]
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        w = np.maximum(0.0, xx2 - xx1)
        h = np.maximum(0.0, yy2 - yy1)
        inter = w * h
        union = areas[i] + areas[order[1:]] - inter
        iou = inter / np.maximum(union, 1e-6)
        inds = np.where(iou <= iou_threshold)[0]
        order = order[inds + 1]
    return keep

class VisionEngine:
    def __init__(self, models_dir, conf_thresh=0.35, provider='auto', intra_threads=0, inter_threads=0):
        self.models_dir = models_dir
        self.conf_thresh = conf_thresh
        self.ort_session = None
        self.face_detector = None
        self.face_recognizer = None
        self.text_recognizer = None

        yolox_path = os.path.join(models_dir, 'yolox_nano.onnx')
        if os.path.isfile(yolox_path):
            try:
                available = ort.get_available_providers()
                if provider and provider != 'auto' and provider in available:
                    active_providers = [provider, 'CPUExecutionProvider']
                else:
                    candidates = ['CUDAExecutionProvider', 'TensorrtExecutionProvider', 'DmlExecutionProvider', 'OpenVINOExecutionProvider', 'CPUExecutionProvider']
                    active_providers = [p for p in candidates if p in available]

                so = ort.SessionOptions()
                so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
                if intra_threads > 0:
                    so.intra_op_num_threads = intra_threads
                if inter_threads > 0:
                    so.inter_op_num_threads = inter_threads
                    so.execution_mode = ort.ExecutionMode.ORT_PARALLEL

                self.ort_session = ort.InferenceSession(yolox_path, sess_options=so, providers=active_providers)
                sys.stderr.write(f"Vision: loaded {yolox_path} with {active_providers}\n")
            except Exception as e:
                sys.stderr.write(f"Vision warning: could not load YOLOX: {e}\n")

        yunet_path = os.path.join(models_dir, 'face_detection_yunet_2023mar.onnx')
        sface_path = os.path.join(models_dir, 'face_recognition_sface_2021dec.onnx')
        if os.path.isfile(yunet_path) and hasattr(cv2, 'FaceDetectorYN'):
            try:
                self.face_detector = cv2.FaceDetectorYN.create(yunet_path, "", (640, 360), 0.6, 0.3, 5000)
                if os.path.isfile(sface_path) and hasattr(cv2, 'FaceRecognizerSF'):
                    self.face_recognizer = cv2.FaceRecognizerSF.create(sface_path, "")
                sys.stderr.write("Vision: loaded YuNet/SFace face models\n")
            except Exception as e:
                sys.stderr.write(f"Vision warning: could not load face models: {e}\n")

        crnn_path = os.path.join(models_dir, 'text_recognition_CRNN_EN_2021sep.onnx')
        if os.path.isfile(crnn_path) and hasattr(cv2, 'dnn_TextRecognitionModel'):
            try:
                self.text_recognizer = cv2.dnn_TextRecognitionModel(crnn_path)
                self.text_recognizer.setDecodeType("CTC-greedy")
                self.text_recognizer.setVocabulary([c for c in "0123456789abcdefghijklmnopqrstuvwxyz"])
                self.text_recognizer.setInputParams(scale=1/127.5, size=(100, 32), mean=(127.5, 127.5, 127.5), swapRB=True)
                sys.stderr.write("Vision: loaded CRNN text recognition model\n")
            except Exception as e:
                sys.stderr.write(f"Vision warning: could not load CRNN model: {e}\n")

    def infer_objects(self, frame):
        if self.ort_session is None:
            return []
        h, w = frame.shape[:2]
        canvas, scale, dx, dy = letterbox(frame, (416, 416))
        blob = canvas.astype(np.float32)
        blob = np.transpose(blob, (2, 0, 1))[np.newaxis, ...]
        input_name = self.ort_session.get_inputs()[0].name
        outputs = self.ort_session.run(None, {input_name: blob})[0][0]

        boxes, scores, class_ids = [], [], []
        for row in outputs:
            box = row[:4]
            obj_conf = row[4]
            cls_scores = row[5:]
            cls_id = int(np.argmax(cls_scores))
            score = float(obj_conf * cls_scores[cls_id])
            if score < self.conf_thresh or cls_id not in COCO_CLASSES:
                continue

            cx, cy, bw, bh = box
            bx1 = (cx - bw / 2 - dx) / scale
            by1 = (cy - bh / 2 - dy) / scale
            bw = bw / scale
            bh = bh / scale

            norm_x = max(0.0, min(1.0, bx1 / w))
            norm_y = max(0.0, min(1.0, by1 / h))
            norm_w = max(0.0, min(1.0 - norm_x, bw / w))
            norm_h = max(0.0, min(1.0 - norm_y, bh / h))

            boxes.append([norm_x, norm_y, norm_w, norm_h])
            scores.append(score)
            class_ids.append(cls_id)

        if len(boxes) == 0:
            return []

        keep = nms(np.array(boxes), np.array(scores), 0.45)
        detections = []
        for idx in keep:
            detections.append({
                'className': COCO_CLASSES[class_ids[idx]],
                'confidence': round(float(scores[idx]), 3),
                'box': [round(v, 4) for v in boxes[idx]]
            })
        return detections

    def infer_faces(self, frame):
        if self.face_detector is None:
            return []
        h, w = frame.shape[:2]
        self.face_detector.setInputSize((w, h))
        _, faces = self.face_detector.detect(frame)
        if faces is None:
            return []

        results = []
        for face in faces:
            fx, fy, fw, fh = face[:4]
            score = float(face[-1])
            if score < 0.6 or fw < 32 or fh < 32:
                continue

            norm_x = max(0.0, min(1.0, fx / w))
            norm_y = max(0.0, min(1.0, fy / h))
            norm_w = max(0.0, min(1.0 - norm_x, fw / w))
            norm_h = max(0.0, min(1.0 - norm_y, fh / h))

            embedding = None
            if self.face_recognizer is not None:
                try:
                    aligned = self.face_recognizer.alignCrop(frame, face)
                    feat = self.face_recognizer.feature(aligned).flatten()
                    norm = np.linalg.norm(feat)
                    if norm > 0:
                        feat = feat / norm
                    embedding = [round(float(v), 6) for v in feat]
                except Exception:
                    embedding = None

            landmarks = []
            if len(face) >= 14:
                for i in range(4, 14, 2):
                    landmarks.append([round(float(face[i]) / w, 4), round(float(face[i+1]) / h, 4)])

            results.append({
                'className': 'face',
                'confidence': round(score, 3),
                'box': [round(norm_x, 4), round(norm_y, 4), round(norm_w, 4), round(norm_h, 4)],
                'faceEmbedding': embedding,
                'landmarks': landmarks if landmarks else None
            })
        return results

    def read_plate_text(self, plate_patch):
        if self.text_recognizer is not None:
            try:
                res = self.text_recognizer.recognize(plate_patch)
                cleaned = re.sub(r'[^A-Z0-9]', '', str(res).upper())
                if len(cleaned) >= 5:
                    return cleaned, 0.85
            except Exception:
                pass

        gray = cv2.cvtColor(plate_patch, cv2.COLOR_BGR2GRAY)
        gray = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
        contours, hierarchy = cv2.findContours(thresh, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
        if hierarchy is None:
            return "", 0.0

        glyphs = get_glyph_templates()
        char_boxes = []
        h_p, w_p = thresh.shape[:2]
        for idx, c in enumerate(contours):
            x, y, w, h = cv2.boundingRect(c)
            parent = hierarchy[0][idx][3]
            if parent == -1 and 0.25 <= (h / h_p) <= 0.85 and 0.15 <= (w / h) <= 1.2:
                char_boxes.append((x, y, w, h))

        char_boxes.sort(key=lambda b: b[0])
        deduped = []
        for b in char_boxes:
            if not deduped or abs(b[0] - deduped[-1][0]) > 6:
                deduped.append(b)

        text, scores = "", []
        for x, y, w, h in deduped:
            crop = thresh[y:y+h, x:x+w]
            crop_res = cv2.resize(crop, (20, 32))
            best_c, best_s = '?', -1.0
            for ch, tpl in glyphs.items():
                res = cv2.matchTemplate(crop_res, tpl, cv2.TM_CCOEFF_NORMED)
                s = float(res[0][0])
                if s > best_s:
                    best_s = s
                    best_c = ch
            if best_s > 0.3:
                text += best_c
                scores.append(best_s)

        cleaned = re.sub(r'[^A-Z0-9]', '', text)
        avg_conf = float(np.mean(scores)) if scores else 0.0
        return cleaned, avg_conf

    def infer_plates(self, frame, objects):
        h, w = frame.shape[:2]
        plate_dets = []

        for obj in objects:
            if obj['className'] not in VEHICLE_CLASSES:
                continue

            bx, by, bw, bh = obj['box']
            px1, py1 = int(bx * w), int(by * h)
            pw, ph = int(bw * w), int(bh * h)
            if pw < 40 or ph < 30:
                continue

            y_start = py1 + int(ph * 0.35)
            y_end = py1 + ph
            x_start = px1 + int(pw * 0.1)
            x_end = px1 + int(pw * 0.9)

            y_start = max(0, min(h - 1, y_start))
            y_end = max(0, min(h, y_end))
            x_start = max(0, min(w - 1, x_start))
            x_end = max(0, min(w, x_end))

            v_crop = frame[y_start:y_end, x_start:x_end]
            if v_crop.shape[0] < 20 or v_crop.shape[1] < 40:
                continue

            gray = cv2.cvtColor(v_crop, cv2.COLOR_BGR2GRAY)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (13, 5))
            blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, kernel)
            gradX = cv2.Sobel(blackhat, cv2.CV_32F, 1, 0, ksize=-1)
            gradX = np.absolute(gradX)
            min_v, max_v = np.min(gradX), np.max(gradX)
            if max_v > min_v:
                gradX = (255 * ((gradX - min_v) / (max_v - min_v))).astype(np.uint8)
            else:
                gradX = np.zeros_like(gray)

            gradX = cv2.GaussianBlur(gradX, (5, 5), 0)
            _, thresh = cv2.threshold(gradX, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
            close_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (17, 3))
            thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, close_kernel)
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            for c in contours:
                cx, cy, cw, ch = cv2.boundingRect(c)
                aspect = cw / float(ch)
                area = cw * ch
                if 2.2 <= aspect <= 6.0 and 600 <= area <= 25000:
                    plate_patch = v_crop[cy:cy+ch, cx:cx+cw]
                    text, conf = self.read_plate_text(plate_patch)
                    if len(text) >= 5 and conf >= 0.35:
                        norm_px = (x_start + cx) / float(w)
                        norm_py = (y_start + cy) / float(h)
                        norm_pw = cw / float(w)
                        norm_ph = ch / float(h)
                        obj['plateText'] = text
                        plate_dets.append({
                            'className': 'plate',
                            'confidence': round(conf, 3),
                            'box': [round(norm_px, 4), round(norm_py, 4), round(norm_pw, 4), round(norm_ph, 4)],
                            'plateText': text
                        })
                        break

        return plate_dets

    def process_frame(self, frame):
        objects = self.infer_objects(frame)
        faces = self.infer_faces(frame)
        plates = self.infer_plates(frame, objects)
        return objects + faces + plates

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

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--models-dir', default=os.path.join(os.path.dirname(__file__), 'models'))
    parser.add_argument('--confidence', type=float, default=0.35)
    parser.add_argument('--provider', default='auto')
    parser.add_argument('--intra-threads', type=int, default=0)
    parser.add_argument('--inter-threads', type=int, default=0)
    parser.add_argument('--probe', action='store_true')
    parser.add_argument('--enroll', type=str, default=None)
    args = parser.parse_args()

    global ort, cv2
    try:
        import onnxruntime as ort
        import cv2
    except ImportError as e:
        if args.probe or args.enroll:
            print(json.dumps({'ok': False, 'error': str(e)}))
            sys.exit(1)
        sys.stderr.write(f"Vision error: dependencies missing: {e}\n")
        sys.exit(1)

    if args.probe:
        providers = ort.get_available_providers()
        print(json.dumps({'ok': True, 'providers': providers}))
        sys.exit(0)

    if args.enroll:
        res = enroll_face_from_image(args.models_dir, args.enroll)
        print(json.dumps(res))
        sys.exit(0 if res.get('ok') else 1)

    engine = VisionEngine(args.models_dir, args.confidence, args.provider, args.intra_threads, args.inter_threads)
    sys.stderr.write("Vision engine ready on stdin\n")

    frame_w, frame_h = 640, 360
    frame_bytes = frame_w * frame_h * 3
    seq = 0

    while True:
        raw = sys.stdin.buffer.read(frame_bytes)
        if len(raw) < frame_bytes:
            break
        seq += 1
        frame = np.frombuffer(raw, dtype=np.uint8).reshape((frame_h, frame_w, 3))
        dets = engine.process_frame(frame)
        output = {
            't': int(time.time() * 1000),
            'seq': seq,
            'dets': dets
        }
        sys.stdout.write(json.dumps(output) + '\n')
        sys.stdout.flush()

if __name__ == '__main__':
    main()
