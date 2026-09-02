import sys
import os
import time
import json
import argparse
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
    16: 'dog'
}

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
    def __init__(self, models_dir, conf_thresh=0.35):
        self.models_dir = models_dir
        self.conf_thresh = conf_thresh
        self.ort_session = None
        self.face_detector = None
        self.face_recognizer = None

        yolox_path = os.path.join(models_dir, 'yolox_nano.onnx')
        if os.path.isfile(yolox_path):
            try:
                providers = ['CUDAExecutionProvider', 'DmlExecutionProvider', 'CPUExecutionProvider']
                available = ort.get_available_providers()
                active_providers = [p for p in providers if p in available]
                self.ort_session = ort.InferenceSession(yolox_path, providers=active_providers)
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

    def infer_objects(self, frame):
        if self.ort_session is None:
            return []
        h, w = frame.shape[:2]
        canvas, scale, dx, dy = letterbox(frame, (416, 416))
        blob = canvas.astype(np.float32)
        blob = np.transpose(blob, (2, 0, 1))[np.newaxis, ...]
        input_name = self.ort_session.get_inputs()[0].name
        outputs = self.ort_session.run(None, {input_name: blob})[0][0]

        boxes = []
        scores = []
        class_ids = []

        for row in outputs:
            box = row[:4]
            obj_conf = row[4]
            cls_scores = row[5:]
            cls_id = int(np.argmax(cls_scores))
            score = float(obj_conf * cls_scores[cls_id])

            if score < self.conf_thresh:
                continue
            if cls_id not in COCO_CLASSES:
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
            if score < 0.6:
                continue
            if fw < 40 or fh < 40:
                continue

            norm_x = max(0.0, min(1.0, fx / w))
            norm_y = max(0.0, min(1.0, fy / h))
            norm_w = max(0.0, min(1.0 - norm_x, fw / w))
            norm_h = max(0.0, min(1.0 - norm_y, fh / h))

            embedding = None
            if self.face_recognizer is not None:
                try:
                    aligned = self.face_recognizer.alignCrop(frame, face)
                    feat = self.face_recognizer.feature(aligned)
                    feat = feat.flatten()
                    norm = np.linalg.norm(feat)
                    if norm > 0:
                        feat = feat / norm
                    embedding = [round(float(v), 6) for v in feat]
                except Exception:
                    embedding = None

            results.append({
                'className': 'face',
                'confidence': round(score, 3),
                'box': [round(norm_x, 4), round(norm_y, 4), round(norm_w, 4), round(norm_h, 4)],
                'faceEmbedding': embedding
            })
        return results

    def process_frame(self, frame):
        objects = self.infer_objects(frame)
        faces = self.infer_faces(frame)
        return objects + faces

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--models-dir', default=os.path.join(os.path.dirname(__file__), 'models'))
    parser.add_argument('--confidence', type=float, default=0.35)
    parser.add_argument('--probe', action='store_true')
    args = parser.parse_args()

    global ort, cv2
    try:
        import onnxruntime as ort
        import cv2
    except ImportError as e:
        if args.probe:
            print(json.dumps({'ok': False, 'error': str(e)}))
            sys.exit(1)
        sys.stderr.write(f"Vision error: dependencies missing: {e}\n")
        sys.exit(1)

    if args.probe:
        providers = ort.get_available_providers()
        print(json.dumps({'ok': True, 'providers': providers}))
        sys.exit(0)

    engine = VisionEngine(args.models_dir, args.confidence)
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
