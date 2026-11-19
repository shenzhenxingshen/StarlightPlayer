#!/usr/bin/env python3
"""Locate a known decorative QR image without decoding its payload.

Every frame is inspected by default. Template matching is a reproducible
regression check for this artwork, not proof that arbitrary QR codes are absent.
JSON goes to stdout, progress/errors to stderr. Requires existing OpenCV.
"""
import argparse
import json
import sys
from pathlib import Path


def positive(value):
    value = int(value)
    if value < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", action="version", version="audit-qr 1.0")
    parser.add_argument("--template", type=Path, required=True, help="unchanged reference video")
    parser.add_argument("--frame", type=int, default=300, help="zero-based reference frame")
    parser.add_argument("--rect", nargs=4, type=int, default=[688, 285, 114, 113],
                        metavar=("X", "Y", "W", "H"), help="reference pixel rectangle")
    parser.add_argument("--stride", type=positive, default=1, help="inspect every Nth frame")
    parser.add_argument("--threshold", type=float, default=0.75, help="match threshold in (0,1]")
    parser.add_argument("videos", nargs="+", type=Path)
    args = parser.parse_args()
    if args.frame < 0 or not 0 < args.threshold <= 1:
        parser.error("frame must be >= 0; threshold must be in (0,1]")
    x, y, w, h = args.rect
    if min(x, y) < 0 or min(w, h) < 1:
        parser.error("rectangle requires nonnegative x/y and positive width/height")
    for path in [args.template, *args.videos]:
        if not path.is_file():
            parser.error(f"video does not exist: {path}")
    # Lazy import keeps help/version dependency-free and quick.
    import cv2
    cv2.setNumThreads(1)
    reference = cv2.VideoCapture(str(args.template))
    reference.set(cv2.CAP_PROP_POS_FRAMES, args.frame)
    ok, image = reference.read()
    reference.release()
    if not ok or x + w > image.shape[1] or y + h > image.shape[0]:
        parser.error("cannot read template frame/rectangle")
    template = cv2.cvtColor(image[y:y+h, x:x+w], cv2.COLOR_BGR2GRAY)
    if template.std() < 10:
        parser.error("template has too little contrast")
    for path in args.videos:
        print(f"Inspecting {path.name}", file=sys.stderr, flush=True)
        video = cv2.VideoCapture(str(path))
        expected = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
        frame, inspected, matches = 0, 0, 0
        maximum, max_at, first, last = -1.0, None, None, None
        bounds = [float("inf"), float("inf"), 0, 0]
        while True:
            ok, image = video.read()
            if not ok:
                break
            if frame % args.stride == 0:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
                if gray.shape[0] < h or gray.shape[1] < w:
                    raise ValueError(f"frame smaller than template: {path}")
                result = cv2.matchTemplate(gray, template, cv2.TM_CCOEFF_NORMED)
                _, score, _, (bx, by) = cv2.minMaxLoc(result)
                inspected += 1
                if score > maximum:
                    maximum, max_at = score, {"frame": frame, "x": bx, "y": by}
                if score >= args.threshold:
                    matches += 1
                    first = frame if first is None else first
                    last = frame
                    bounds = [min(bounds[0], bx), min(bounds[1], by),
                              max(bounds[2], bx+w), max(bounds[3], by+h)]
            frame += 1
        video.release()
        if frame != expected or frame == 0:
            raise ValueError(f"decoded {frame}/{expected} frames: {path}")
        print(json.dumps({
            "file": path.name, "frames": frame, "inspected": inspected,
            "stride": args.stride, "threshold": args.threshold,
            "matches": matches, "first": first, "last": last,
            "bounds": bounds if matches else None,
            "maxScore": maximum, "maxAt": max_at,
        }), flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Cancelled; no input files were changed.", file=sys.stderr)
        sys.exit(130)
    except (ValueError, OSError, ImportError) as error:
        print(f"QR audit failed: {error}", file=sys.stderr)
        sys.exit(1)
