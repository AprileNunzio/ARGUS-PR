import os
import re
import sys

import cv2
import numpy as np
import onnxruntime as ort

from vision_common import COCO_CLASSES, VEHICLE_CLASSES, MIN_BOX_AREA, MIN_BOX_SIDE, get_glyph_templates, letterbox, nms

class VisionEngine:
    def __init__(self, models_dir, profile, provider='auto', intra_threads=0, inter_threads=0):
        self.models_dir = models_dir
        self.tasks = profile.get('tasks', {})
        self.ort_session = None
        self.provider = None
        self.face_detector = None
        self.face_recognizer = None
        self.text_recognizer = None

        objects = self.tasks.get('objects', {})
        faces = self.tasks.get('faces', {})
        plates = self.tasks.get('plates', {})

        self.conf_thresh = float(objects.get('threshold', 0.35))
        self.min_size = float(objects.get('minSize', 0) or 0)
        self.allowed_classes = set(objects.get('classes') or [])
        self.face_thresh = float(faces.get('threshold', 0.6))
        self.plate_thresh = float(plates.get('threshold', 0.35))

        if objects.get('enabled') and objects.get('model'):
            self.load_objects(os.path.join(models_dir, objects['model']), provider, intra_threads, inter_threads)

        if faces.get('enabled') and faces.get('model'):
            embed_model = faces.get('embedModel') if faces.get('embed') else None
            self.load_faces(
                os.path.join(models_dir, faces['model']),
                os.path.join(models_dir, embed_model) if embed_model else None
            )

        if plates.get('enabled') and plates.get('model'):
            self.load_text(os.path.join(models_dir, plates['model']))

    def load_objects(self, model_path, provider, intra_threads, inter_threads):
        if not os.path.isfile(model_path):
            sys.stderr.write("Vision warning: model not found " + model_path + "\n")
            return
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

            self.ort_session = ort.InferenceSession(model_path, sess_options=so, providers=active_providers)
            self.provider = (self.ort_session.get_providers() or ['CPUExecutionProvider'])[0]
            sys.stderr.write("Vision: loaded " + model_path + "\n")
        except Exception as e:
            sys.stderr.write("Vision warning: could not load object model: " + str(e) + "\n")

    def load_faces(self, detector_path, recognizer_path):
        if not os.path.isfile(detector_path) or not hasattr(cv2, 'FaceDetectorYN'):
            sys.stderr.write("Vision warning: face detector unavailable\n")
            return
        try:
            self.face_detector = cv2.FaceDetectorYN.create(detector_path, "", (640, 360), self.face_thresh, 0.3, 5000)
            if recognizer_path and os.path.isfile(recognizer_path) and hasattr(cv2, 'FaceRecognizerSF'):
                self.face_recognizer = cv2.FaceRecognizerSF.create(recognizer_path, "")
            sys.stderr.write("Vision: face models ready\n")
        except Exception as e:
            sys.stderr.write("Vision warning: could not load face models: " + str(e) + "\n")

    def load_text(self, model_path):
        if not os.path.isfile(model_path) or not hasattr(cv2, 'dnn_TextRecognitionModel'):
            return
        try:
            self.text_recognizer = cv2.dnn_TextRecognitionModel(model_path)
            self.text_recognizer.setDecodeType("CTC-greedy")
            self.text_recognizer.setVocabulary([c for c in "0123456789abcdefghijklmnopqrstuvwxyz"])
            self.text_recognizer.setInputParams(scale=1/127.5, size=(100, 32), mean=(127.5, 127.5, 127.5), swapRB=True)
            sys.stderr.write("Vision: text recognition ready\n")
        except Exception as e:
            sys.stderr.write("Vision warning: could not load text model: " + str(e) + "\n")

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
            if self.allowed_classes and COCO_CLASSES[cls_id] not in self.allowed_classes:
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
            width = float(boxes[idx][2])
            height = float(boxes[idx][3])

            if width < MIN_BOX_SIDE or height < MIN_BOX_SIDE:
                continue
            if width * height < MIN_BOX_AREA:
                continue
            if self.min_size > 0 and width * height < self.min_size:
                continue
            detections.append({
                'className': COCO_CLASSES[int(class_ids[idx])],
                'confidence': round(float(scores[idx]), 3),
                'box': [round(float(v), 4) for v in boxes[idx]]
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
            if score < self.face_thresh or fw < 32 or fh < 32:
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
                'confidence': round(float(score), 3),
                'box': [round(float(norm_x), 4), round(float(norm_y), 4), round(float(norm_w), 4), round(float(norm_h), 4)],
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
                    if len(text) >= 5 and conf >= self.plate_thresh:
                        norm_px = (x_start + cx) / float(w)
                        norm_py = (y_start + cy) / float(h)
                        norm_pw = cw / float(w)
                        norm_ph = ch / float(h)
                        obj['plateText'] = text
                        plate_dets.append({
                            'className': 'plate',
                            'confidence': round(float(conf), 3),
                            'box': [round(float(norm_px), 4), round(float(norm_py), 4), round(float(norm_pw), 4), round(float(norm_ph), 4)],
                            'plateText': text
                        })
                        break

        return plate_dets

    def process_frame(self, frame):
        objects = self.infer_objects(frame) if self.ort_session is not None else []
        faces = self.infer_faces(frame) if self.face_detector is not None else []
        plates = self.infer_plates(frame, objects) if self.tasks.get('plates', {}).get('enabled') else []
        emitted = [det for det in objects if not self.allowed_classes or det['className'] in self.allowed_classes]
        return emitted + faces + plates
