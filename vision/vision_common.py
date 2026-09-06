import math

import cv2
import numpy as np

COCO_CLASSES = {
    0: 'person',
    1: 'bicycle',
    2: 'car',
    3: 'motorcycle',
    4: 'airplane',
    5: 'bus',
    6: 'train',
    7: 'truck',
    8: 'boat',
    14: 'bird',
    15: 'cat',
    16: 'dog',
    17: 'horse',
    18: 'sheep',
    19: 'cow',
    20: 'elephant',
    21: 'bear',
    22: 'zebra',
    23: 'giraffe',
    24: 'backpack',
    26: 'handbag',
    28: 'suitcase'
}

VEHICLE_CLASSES = {'car', 'truck', 'bus', 'motorcycle'}

REFERENCE_WIDTH = 640
REFERENCE_HEIGHT = 360
FACE_MIN_SIDE = 32

MIN_BOX_SIDE = 0.012
MIN_BOX_AREA = 0.0002

SNAPSHOT_QUALITY = 88
SNAPSHOT_MAX_SIDE = 1280
SNAPSHOT_MAX_PER_FRAME = 3
SNAPSHOT_EVERY_FRAMES = 3

PLATE_UNSCORED_CONFIDENCE = 0.5
PLATE_MIN_DIGITS = 2
PLATE_MIN_LETTERS = 1
PLATE_MIN_LENGTH = 5
PLATE_MAX_LENGTH = 10


def plate_text_is_plausible(text):
    if not PLATE_MIN_LENGTH <= len(text) <= PLATE_MAX_LENGTH:
        return False
    return all(c.isalnum() for c in text)


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

WIDE_WINDOW_ASPECT = 2.2
WINDOW_TARGET_ASPECT = 1.3

RAW_GRID_LIMIT = 20.0
YOLOX_STRIDES = (8, 16, 32)
_GRID_CACHE = {}


def wide_windows(width, height):
    if width <= 0 or height <= 0 or width <= height * WIDE_WINDOW_ASPECT:
        return [(0, width)]

    span = min(width, height)
    count = max(2, int(math.ceil(width / (height * WINDOW_TARGET_ASPECT))))
    step = (width - span) / float(count - 1)
    offsets = []
    for index in range(count):
        offset = int(round(index * step))
        if offset not in offsets:
            offsets.append(offset)
    return [(offset, span) for offset in offsets]


def _yolox_grid(size):
    if size in _GRID_CACHE:
        return _GRID_CACHE[size]

    cells = []
    strides = []
    for stride in YOLOX_STRIDES:
        side = size // stride
        xv, yv = np.meshgrid(np.arange(side), np.arange(side))
        cells.append(np.stack((xv, yv), 2).reshape(-1, 2))
        strides.append(np.full((side * side, 1), stride))

    grid = (np.concatenate(cells, 0).astype(np.float32), np.concatenate(strides, 0).astype(np.float32))
    _GRID_CACHE[size] = grid
    return grid


def decode_yolox(outputs, size=416):
    if outputs.ndim != 2 or outputs.shape[1] < 5:
        return outputs
    if float(np.max(np.abs(outputs[:, 2:4]))) > RAW_GRID_LIMIT:
        return outputs

    grid, strides = _yolox_grid(size)
    if grid.shape[0] != outputs.shape[0]:
        return outputs

    decoded = outputs.copy()
    decoded[:, :2] = (decoded[:, :2] + grid) * strides
    decoded[:, 2:4] = np.exp(decoded[:, 2:4]) * strides
    return decoded


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

VEHICLE_MIN_WIDTH_RATIO = 40.0 / REFERENCE_WIDTH
VEHICLE_MIN_HEIGHT_RATIO = 30.0 / REFERENCE_HEIGHT

PLATE_ASPECT_MIN = 2.0
PLATE_ASPECT_MAX = 7.0
PLATE_AREA_MIN_RATIO = 0.0015
PLATE_AREA_MAX_RATIO = 0.45
PLATE_MIN_ABSOLUTE_AREA = 120
PLATE_BAND_TRIM = 0.09
PLATE_WIDTH_MIN_RATIO = 0.08
PLATE_WIDTH_MAX_RATIO = 0.55
PLATE_MIN_PATCH_WIDTH = 40
PLATE_MIN_PATCH_HEIGHT = 12
PLATE_MAX_CANDIDATES = 3


def plate_candidates(mask):
    region_width = float(mask.shape[1]) or 1.0
    region_area = float(mask.shape[0] * mask.shape[1]) or 1.0
    area_min = max(PLATE_MIN_ABSOLUTE_AREA, region_area * PLATE_AREA_MIN_RATIO)
    area_max = region_area * PLATE_AREA_MAX_RATIO
    width_min = region_width * PLATE_WIDTH_MIN_RATIO
    width_max = region_width * PLATE_WIDTH_MAX_RATIO
    rects = []
    for size in ((17, 3), (3, 17)):
        closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, size))
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            if len(contour) < 4:
                continue
            rect = cv2.minAreaRect(contour)
            width, height = rect[1]
            long_side = max(width, height)
            short_side = min(width, height)
            if short_side <= 0:
                continue
            aspect = long_side / short_side
            area = long_side * short_side
            if not width_min <= long_side <= width_max:
                continue
            if PLATE_ASPECT_MIN <= aspect <= PLATE_ASPECT_MAX and area_min <= area <= area_max:
                rects.append((rect, area))

    rects.sort(key=lambda item: -item[1])
    return [rect for rect, _ in rects[:PLATE_MAX_CANDIDATES]]


def upright_patch(image, rect):
    points = cv2.boxPoints(rect)
    edges = [float(np.linalg.norm(points[(i + 1) % 4] - points[i])) for i in range(4)]
    start = int(np.argmax(edges))
    ordered = np.array([points[(start + offset) % 4] for offset in range(4)], dtype='float32')

    width = int(round(max(edges)))
    height = int(round(min(edges)))
    if width < PLATE_MIN_PATCH_WIDTH or height < PLATE_MIN_PATCH_HEIGHT:
        return None

    target = np.array([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]], dtype='float32')
    return cv2.warpPerspective(image, cv2.getPerspectiveTransform(ordered, target), (width, height))


def trim_plate_bands(patch):
    height, width = patch.shape[:2]
    cut = int(round(width * PLATE_BAND_TRIM))
    if width - 2 * cut < PLATE_MIN_PATCH_WIDTH:
        return patch
    return patch[:, cut:width - cut]


PLATE_GLYPH_MIN = 4
PLATE_GLYPH_MAX = 9
GLYPH_HEIGHT_MIN_RATIO = 0.22
GLYPH_HEIGHT_MAX_RATIO = 0.95
GLYPH_ASPECT_MIN = 0.10
GLYPH_ASPECT_MAX = 1.3
GLYPH_HEIGHT_TOLERANCE = 0.45
GLYPH_BASELINE_TOLERANCE = 0.40
GLYPH_MAX_GAP_RATIO = 1.2
GLYPH_MIN_SPAN_RATIO = 0.40


def glyph_boxes(mask):
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is None:
        return []

    height = float(mask.shape[0]) or 1.0
    boxes = []
    for index, contour in enumerate(contours):
        if hierarchy[0][index][3] != -1:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        if w <= 0 or h <= 0:
            continue
        if not GLYPH_HEIGHT_MIN_RATIO <= h / height <= GLYPH_HEIGHT_MAX_RATIO:
            continue
        if not GLYPH_ASPECT_MIN <= w / float(h) <= GLYPH_ASPECT_MAX:
            continue
        boxes.append((x, y, w, h))

    return sorted(boxes, key=lambda b: b[0])


def _median(values):
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def _on_common_baseline(boxes, median_height):
    xs = np.array([b[0] + b[2] / 2.0 for b in boxes], dtype=np.float64)
    ys = np.array([b[1] + b[3] / 2.0 for b in boxes], dtype=np.float64)

    spread = float(xs.max() - xs.min())
    if spread < 1e-6:
        return list(boxes)

    slope, intercept = np.polyfit(xs, ys, 1)
    residuals = np.abs(ys - (slope * xs + intercept))
    tolerance = GLYPH_BASELINE_TOLERANCE * median_height

    kept = [box for box, residual in zip(boxes, residuals) if residual <= tolerance]
    if len(kept) >= PLATE_GLYPH_MIN:
        return kept

    median_centre = _median([b[1] + b[3] / 2.0 for b in boxes])
    return [b for b in boxes if abs((b[1] + b[3] / 2.0) - median_centre) <= tolerance]


def plate_glyph_line(boxes, mask_width):
    if len(boxes) < PLATE_GLYPH_MIN:
        return None

    median_height = _median([b[3] for b in boxes])
    if median_height <= 0:
        return None

    similar = [b for b in boxes if abs(b[3] - median_height) <= GLYPH_HEIGHT_TOLERANCE * median_height]
    if len(similar) < PLATE_GLYPH_MIN:
        return None

    aligned = _on_common_baseline(similar, median_height)
    if len(aligned) < PLATE_GLYPH_MIN:
        return None

    median_width = _median([b[2] for b in aligned])
    max_gap = GLYPH_MAX_GAP_RATIO * max(1.0, median_width)

    runs = []
    current = [aligned[0]]
    for previous, box in zip(aligned, aligned[1:]):
        gap = box[0] - (previous[0] + previous[2])
        if gap <= max_gap:
            current.append(box)
        else:
            runs.append(current)
            current = [box]
    runs.append(current)

    best = max(runs, key=len)
    if not PLATE_GLYPH_MIN <= len(best) <= PLATE_GLYPH_MAX:
        return None

    left = min(b[0] for b in best)
    right = max(b[0] + b[2] for b in best)
    if (right - left) < GLYPH_MIN_SPAN_RATIO * max(1, mask_width):
        return None

    top = min(b[1] for b in best)
    bottom = max(b[1] + b[3] for b in best)
    return {'boxes': best, 'bounds': (left, top, right - left, bottom - top)}


GLYPH_DESLANT_MIN_DEGREES = 1.0
GLYPH_DESLANT_MAX_DEGREES = 25.0


def deslant_line(patch, boxes):
    if len(boxes) < PLATE_GLYPH_MIN:
        return patch

    xs = np.array([b[0] + b[2] / 2.0 for b in boxes], dtype=np.float64)
    ys = np.array([b[1] + b[3] / 2.0 for b in boxes], dtype=np.float64)
    if float(xs.max() - xs.min()) < 1e-6:
        return patch

    angle = float(np.degrees(np.arctan(np.polyfit(xs, ys, 1)[0])))
    if not GLYPH_DESLANT_MIN_DEGREES <= abs(angle) <= GLYPH_DESLANT_MAX_DEGREES:
        return patch

    centre = (patch.shape[1] / 2.0, patch.shape[0] / 2.0)
    matrix = cv2.getRotationMatrix2D(centre, angle, 1.0)
    return cv2.warpAffine(patch, matrix, (patch.shape[1], patch.shape[0]),
                          flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
