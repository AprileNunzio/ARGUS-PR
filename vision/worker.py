import argparse
import json
import os
import sys
import time

DEFAULT_PROFILE = {
    'tasks': {
        'objects': {
            'enabled': True,
            'model': 'yolox_nano.onnx',
            'threshold': 0.35,
            'minSize': 0,
            'classes': []
        },
        'faces': {
            'enabled': True,
            'model': 'face_detection_yunet_2023mar.onnx',
            'threshold': 0.6,
            'embed': True,
            'embedModel': 'face_recognition_sface_2021dec.onnx'
        },
        'plates': {
            'enabled': True,
            'threshold': 0.35,
            'model': None
        }
    }
}

FRAME_WIDTH = 640
FRAME_HEIGHT = 360


def parse_profile(raw):
    if not raw:
        return DEFAULT_PROFILE
    try:
        parsed = json.loads(raw)
    except ValueError as error:
        sys.stderr.write("Vision error: invalid profile: " + str(error) + "\n")
        sys.exit(2)
    if not isinstance(parsed, dict) or 'tasks' not in parsed:
        sys.stderr.write("Vision error: profile without tasks\n")
        sys.exit(2)
    return parsed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--models-dir', default=os.path.join(os.path.dirname(__file__), 'models'))
    parser.add_argument('--profile', default=None)
    parser.add_argument('--provider', default='auto')
    parser.add_argument('--intra-threads', type=int, default=0)
    parser.add_argument('--inter-threads', type=int, default=0)
    parser.add_argument('--probe', action='store_true')
    parser.add_argument('--enroll', type=str, default=None)
    args = parser.parse_args()

    try:
        import numpy as np
        import onnxruntime as ort
        import cv2
    except ImportError as error:
        if args.probe or args.enroll:
            print(json.dumps({'ok': False, 'error': str(error)}))
            sys.exit(1)
        sys.stderr.write("Vision error: dependencies missing: " + str(error) + "\n")
        sys.exit(1)

    if args.probe:
        print(json.dumps({'ok': True, 'providers': ort.get_available_providers()}))
        sys.exit(0)

    if args.enroll:
        from vision_enroll import enroll_face_from_image
        outcome = enroll_face_from_image(args.models_dir, args.enroll)
        print(json.dumps(outcome))
        sys.exit(0 if outcome.get('ok') else 1)

    from vision_engine import VisionEngine

    profile = parse_profile(args.profile)
    engine = VisionEngine(args.models_dir, profile, args.provider, args.intra_threads, args.inter_threads)

    enabled = [name for name, task in profile.get('tasks', {}).items() if task.get('enabled')]
    sys.stderr.write("Vision engine ready on stdin, tasks: " + ','.join(enabled) + "\n")

    provider = getattr(engine, 'provider', None) or (ort.get_available_providers() or ['CPUExecutionProvider'])[0]

    frame_bytes = FRAME_WIDTH * FRAME_HEIGHT * 3
    seq = 0

    while True:
        raw = sys.stdin.buffer.read(frame_bytes)
        if len(raw) < frame_bytes:
            break
        seq += 1
        frame = np.frombuffer(raw, dtype=np.uint8).reshape((FRAME_HEIGHT, FRAME_WIDTH, 3))
        started = time.perf_counter()
        detections = engine.process_frame(frame)
        elapsed = (time.perf_counter() - started) * 1000.0
        sys.stdout.write(json.dumps({
            't': int(time.time() * 1000),
            'seq': seq,
            'ms': round(elapsed, 1),
            'provider': provider,
            'dets': detections
        }) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
