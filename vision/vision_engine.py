import base64
import os
import re
import sys

import cv2
import numpy as np
import onnxruntime as ort

from vision_common import (COCO_CLASSES, VEHICLE_CLASSES, FACE_MIN_SIDE, MIN_BOX_AREA, MIN_BOX_SIDE,
                           PLATE_UNSCORED_CONFIDENCE, REFERENCE_HEIGHT, REFERENCE_WIDTH, decode_yolox,
                           get_glyph_templates, letterbox, nms, plate_candidates, plate_text_is_plausible,
                           trim_plate_bands, upright_patch, wide_windows, glyph_boxes,
                           plate_glyph_line, deslant_line, SNAPSHOT_EVERY_FRAMES,
                           SNAPSHOT_MAX_PER_FRAME, SNAPSHOT_MAX_SIDE, SNAPSHOT_QUALITY, VEHICLE_MIN_HEIGHT_RATIO,
                           VEHICLE_MIN_WIDTH_RATIO)

def classify_dominant_color(bgr_patch):
    if bgr_patch is None or bgr_patch.size == 0:
        return None
    hsv = cv2.cvtColor(bgr_patch, cv2.COLOR_BGR2HSV)
    h = hsv[:, :, 0]
    s = hsv[:, :, 1]
    v = hsv[:, :, 2]
    mean_s = np.mean(s)
    mean_v = np.mean(v)

    if mean_v < 45:
        return 'black'
    if mean_s < 35 and mean_v > 165:
        return 'white'
    if mean_s < 45:
        return 'gray'

    mean_h = np.median(h)
    if mean_h < 10 or mean_h >= 170:
        return 'red'
    if 10 <= mean_h < 25:
        return 'orange'
    if 25 <= mean_h < 35:
        return 'yellow'
    if 35 <= mean_h < 85:
        return 'green'
    if 85 <= mean_h < 135:
        return 'blue'
    if 135 <= mean_h < 170:
        return 'purple'
    return None

class VisionEngine:
    def __init__(self, models_dir, profile, provider='auto', intra_threads=0, inter_threads=0):
        self.models_dir = models_dir
        self.tasks = profile.get('tasks', {})
        self.ort_session = None
        self.provider = None
        self.face_detector = None
        self.face_recognizer = None
        self.text_recognizer = None
        self.snapshot_tick = 0

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
        if not os.path.isfile(detector_path):
            sys.stderr.write("Vision warning: face detector unavailable\n")
            return
        try:
            if 'scrfd' in detector_path.lower():
                self.face_detector = ort.InferenceSession(detector_path, providers=['CPUExecutionProvider'])
                self.face_detector_type = 'scrfd'
            elif hasattr(cv2, 'FaceDetectorYN'):
                self.face_detector = cv2.FaceDetectorYN.create(detector_path, "", (640, 360), self.face_thresh, 0.3, 5000)
                self.face_detector_type = 'yunet'

            if recognizer_path and os.path.isfile(recognizer_path):
                if 'mobilefacenet' in recognizer_path.lower() or 'arcface' in recognizer_path.lower():
                    self.face_recognizer = ort.InferenceSession(recognizer_path, providers=['CPUExecutionProvider'])
                    self.face_recognizer_type = 'mobilefacenet'
                elif hasattr(cv2, 'FaceRecognizerSF'):
                    self.face_recognizer = cv2.FaceRecognizerSF.create(recognizer_path, "")
                    self.face_recognizer_type = 'sface'
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

    def _collect_window(self, window, offset_x, full_w, full_h, boxes, scores, class_ids):
        canvas, scale, dx, dy = letterbox(window, (416, 416))
        blob = np.transpose(canvas.astype(np.float32), (2, 0, 1))[np.newaxis, ...]
        input_name = self.ort_session.get_inputs()[0].name
        outputs = decode_yolox(self.ort_session.run(None, {input_name: blob})[0][0], 416)

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
            bx1 = (cx - bw / 2 - dx) / scale + offset_x
            by1 = (cy - bh / 2 - dy) / scale
            bw = bw / scale
            bh = bh / scale

            norm_x = max(0.0, min(1.0, bx1 / full_w))
            norm_y = max(0.0, min(1.0, by1 / full_h))
            norm_w = max(0.0, min(1.0 - norm_x, bw / full_w))
            norm_h = max(0.0, min(1.0 - norm_y, bh / full_h))

            boxes.append([norm_x, norm_y, norm_w, norm_h])
            scores.append(score)
            class_ids.append(cls_id)

    def snapshot_of(self, frame, box, margin=0.15):
        h, w = frame.shape[:2]
        bx, by, bw, bh = box
        x1 = int(max(0, (bx - bw * margin) * w))
        y1 = int(max(0, (by - bh * margin) * h))
        x2 = int(min(w, (bx + bw * (1.0 + margin)) * w))
        y2 = int(min(h, (by + bh * (1.0 + margin)) * h))
        if x2 - x1 < 8 or y2 - y1 < 8:
            return None

        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return None

        longest = max(crop.shape[0], crop.shape[1])
        if longest > SNAPSHOT_MAX_SIDE:
            scale = SNAPSHOT_MAX_SIDE / float(longest)
            crop = cv2.resize(crop, (max(1, int(crop.shape[1] * scale)), max(1, int(crop.shape[0] * scale))),
                              interpolation=cv2.INTER_AREA)

        ok, buf = cv2.imencode('.jpg', crop, [int(cv2.IMWRITE_JPEG_QUALITY), SNAPSHOT_QUALITY])
        if not ok:
            return None
        return 'data:image/jpeg;base64,' + base64.b64encode(buf).decode('ascii')

    def attach_snapshots(self, frame, detections):
        self.snapshot_tick += 1
        if self.snapshot_tick % SNAPSHOT_EVERY_FRAMES != 0:
            return

        ranked = sorted(detections, key=lambda d: -(d['box'][2] * d['box'][3]))
        for det in ranked[:SNAPSHOT_MAX_PER_FRAME]:
            shot = self.snapshot_of(frame, det['box'])
            if shot is not None:
                det['snapshotBase64'] = shot

    def infer_objects(self, frame):
        if self.ort_session is None:
            return []
        h, w = frame.shape[:2]

        boxes, scores, class_ids = [], [], []
        for offset_x, span in wide_windows(w, h):
            self._collect_window(frame[:, offset_x:offset_x + span], offset_x, w, h, boxes, scores, class_ids)

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
            cls_name = COCO_CLASSES[int(class_ids[idx])]
            upper_color = None
            if cls_name == 'person':
                bx, by, bw, bh = boxes[idx]
                px1 = int(max(0, bx * w))
                py1 = int(max(0, by * h))
                pw = int(min(w - px1, bw * w))
                ph = int(min(h - py1, bh * h))
                if pw >= 20 and ph >= 40:
                    torso_y1 = py1 + int(ph * 0.2)
                    torso_y2 = py1 + int(ph * 0.6)
                    torso_x1 = px1 + int(pw * 0.15)
                    torso_x2 = px1 + int(pw * 0.85)
                    torso = frame[torso_y1:torso_y2, torso_x1:torso_x2]
                    upper_color = classify_dominant_color(torso)

            detections.append({
                'className': cls_name,
                'confidence': round(float(scores[idx]), 3),
                'box': [round(float(v), 4) for v in boxes[idx]],
                'upperColor': upper_color
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

        min_width = FACE_MIN_SIDE * (w / float(REFERENCE_WIDTH))
        min_height = FACE_MIN_SIDE * (h / float(REFERENCE_HEIGHT))

        results = []
        for face in faces:
            fx, fy, fw, fh = face[:4]
            score = float(face[-1])
            if score < self.face_thresh or fw < min_width or fh < min_height:
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

            snapshot_b64 = None
            try:
                margin = int(max(fw, fh) * 0.3)
                crop_x1 = max(0, int(fx) - margin)
                crop_y1 = max(0, int(fy) - margin)
                crop_x2 = min(w, int(fx + fw) + margin)
                crop_y2 = min(h, int(fy + fh) + margin)
                face_crop = frame[crop_y1:crop_y2, crop_x1:crop_x2]
                if face_crop.size > 0:
                    _, buf = cv2.imencode('.jpg', face_crop, [cv2.IMWRITE_JPEG_QUALITY, 80])
                    import base64
                    snapshot_b64 = "data:image/jpeg;base64," + base64.b64encode(buf).decode('utf-8')
            except Exception:
                pass

            results.append({
                'className': 'face',
                'confidence': round(score, 3),
                'box': [round(float(norm_x), 4), round(float(norm_y), 4), round(float(norm_w), 4), round(float(norm_h), 4)],
                'faceEmbedding': embedding,
                'landmarks': landmarks if landmarks else None,
                'snapshotBase64': snapshot_b64
            })
        return results

    def _glyph_line(self, plate_patch):
        gray = cv2.cvtColor(plate_patch, cv2.COLOR_BGR2GRAY)
        gray = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)

        best = None
        for flag in (cv2.THRESH_BINARY_INV, cv2.THRESH_BINARY):
            _, mask = cv2.threshold(gray, 0, 255, flag | cv2.THRESH_OTSU)
            line = plate_glyph_line(glyph_boxes(mask), mask.shape[1])
            if line is None:
                continue
            if best is None or len(line['boxes']) > len(best[0]['boxes']):
                best = (line, mask)

        return best

    def read_plate_text(self, plate_patch):
        found = self._glyph_line(plate_patch)
        if found is None:
            return "", 0.0

        line, mask = found
        x, y, w, h = line['bounds']
        pad_x = max(2, int(round(w * 0.04)))
        pad_y = max(2, int(round(h * 0.18)))
        x0 = max(0, x - pad_x)
        y0 = max(0, y - pad_y)
        x1 = min(plate_patch.shape[1], x + w + pad_x)
        y1 = min(plate_patch.shape[0], y + h + pad_y)
        tight = plate_patch[y0:y1, x0:x1]
        if tight.size > 0:
            shifted = [(bx - x0, by - y0, bw, bh) for bx, by, bw, bh in line['boxes']]
            tight = deslant_line(tight, shifted)

        if self.text_recognizer is not None and tight.size > 0:
            try:
                res = self.text_recognizer.recognize(tight)
                cleaned = re.sub(r'[^A-Z0-9]', '', str(res).upper())
                if plate_text_is_plausible(cleaned):
                    return cleaned, PLATE_UNSCORED_CONFIDENCE
            except cv2.error:
                pass

        glyphs = get_glyph_templates()
        text, scores = "", []
        for gx, gy, gw, gh in line['boxes']:
            crop = mask[gy:gy + gh, gx:gx + gw]
            if crop.size == 0:
                continue
            crop_res = cv2.resize(crop, (20, 32))
            best_c, best_s = '?', -1.0
            for ch, tpl in glyphs.items():
                score = float(cv2.matchTemplate(crop_res, tpl, cv2.TM_CCOEFF_NORMED)[0][0])
                if score > best_s:
                    best_s = score
                    best_c = ch
            if best_s > 0.3:
                text += best_c
                scores.append(best_s)

        cleaned = re.sub(r'[^A-Z0-9]', '', text)
        if not plate_text_is_plausible(cleaned):
            return "", 0.0
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
            if pw < w * VEHICLE_MIN_WIDTH_RATIO or ph < h * VEHICLE_MIN_HEIGHT_RATIO:
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
            if v_crop.shape[0] < 12 or v_crop.shape[1] < 24:
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

            found = False
            for rect in plate_candidates(thresh):
                patch = upright_patch(v_crop, rect)
                if patch is None:
                    continue

                text, conf = self.read_plate_variants(patch)
                if not text or conf < self.plate_thresh:
                    continue

                cx, cy, cw, ch = cv2.boundingRect(cv2.boxPoints(rect).astype(np.int32))
                obj['plateText'] = text
                plate_dets.append({
                    'className': 'plate',
                    'confidence': round(float(conf), 3),
                    'box': [
                        round(float((x_start + cx) / float(w)), 4),
                        round(float((y_start + cy) / float(h)), 4),
                        round(float(cw / float(w)), 4),
                        round(float(ch / float(h)), 4)
                    ],
                    'plateText': text
                })
                found = True
                break

            if found:
                continue

        return plate_dets

    def read_plate_variants(self, patch):
        best_text = ""
        best_conf = 0.0
        for candidate in (patch, cv2.rotate(patch, cv2.ROTATE_180)):
            trimmed = trim_plate_bands(candidate)
            if trimmed is None:
                continue
            text, conf = self.read_plate_text(trimmed)
            if text and conf > best_conf:
                best_text, best_conf = text, conf
        return best_text, best_conf

    def process_frame(self, frame):
        objects = self.infer_objects(frame) if self.ort_session is not None else []
        if objects:
            self.attach_snapshots(frame, objects)
        faces = self.infer_faces(frame) if self.face_detector is not None else []
        plates = self.infer_plates(frame, objects) if self.tasks.get('plates', {}).get('enabled') else []
        emitted = [det for det in objects if not self.allowed_classes or det['className'] in self.allowed_classes]
        return emitted + faces + plates
