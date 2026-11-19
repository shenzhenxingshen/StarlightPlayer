#!/usr/bin/env python3
"""Inspect the four reviewed 49-cycle clips; never modifies the input directory."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

FILES = ["01_intro.mp4", "02_regular_cycle.mp4", "03_final_cycle.mp4", "04_outro.mp4"]


def run(args):
    return subprocess.check_output(args)


def probe(path):
    return json.loads(run(["ffprobe", "-v", "error", "-show_streams",
                          "-show_format", "-of", "json", str(path)]))


def frame(path, second):
    raw = run(["ffmpeg", "-v", "error", "-nostdin", "-ss", str(second),
               "-i", str(path), "-frames:v", "1", "-pix_fmt", "rgb24",
               "-f", "rawvideo", "-"])
    return np.frombuffer(raw, dtype=np.uint8).reshape(480, 856, 3)


def audio(path):
    raw = run(["ffmpeg", "-v", "error", "-nostdin", "-i", str(path),
               "-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_f32le",
               "-f", "f32le", "-"])
    return np.frombuffer(raw, dtype="<f4").reshape(-1, 2)


def quiet_intervals(samples, threshold):
    # 10 ms RMS windows, max channel RMS: don't hide a signal through mono cancellation.
    hop = 441
    windows = samples[:len(samples) // hop * hop].reshape(-1, hop, 2)
    rms = np.sqrt(np.mean(windows ** 2, axis=1)).max(axis=1)
    quiet = rms < 10 ** (threshold / 20)
    diff = np.diff(np.r_[False, quiet, False].astype(int))
    return [[int(a) * .01, int(b) * .01] for a, b in
            zip(np.flatnonzero(diff == 1), np.flatnonzero(diff == -1)) if b - a >= 5]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source, out = args.input.resolve(), args.output.resolve()
    if source == out or source in out.parents:
        raise SystemExit("Put evidence beside, not inside, the original material directory")
    out.mkdir(parents=True, exist_ok=False)
    report = {"input": str(source), "silence_definition": "max-channel RMS / 10ms windows",
              "clips": [], "seams": []}
    ocr_frames, audio_samples = [], {}
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 16)
    for file in FILES:
        path = source / file
        metadata = probe(path)
        a = next(s for s in metadata["streams"] if s["codec_type"] == "audio")
        v = next(s for s in metadata["streams"] if s["codec_type"] == "video")
        duration = a["duration_ts"] / 44100
        samples = audio(path)[:a["duration_ts"]]
        audio_samples[file] = samples
        times = sorted(set([0, .5, 1, 2, 3, 4, 5, 10, 20, 30,
                            round(duration - 2, 2), round(duration - .52, 2),
                            (int(float(v["duration"]) * 25) - 1) / 25]))
        if file == FILES[0]:
            times += [4.5, 6, 40, 41, 41.8]
        if file == FILES[3]:
            times += [55, 60, 65, 70, 74, 75, 76]
        times = sorted(set(t for t in times if 0 <= t < float(v["duration"])))
        sheet = Image.new("RGB", (856, 264 * ((len(times) + 1) // 2)), "#222222")
        draw = ImageDraw.Draw(sheet)
        for i, time in enumerate(times):
            image = Image.fromarray(frame(path, time))
            dest = out / f"{file[:-4]}-{time:07.2f}.png"
            image.save(dest)
            ocr_frames.append(str(dest))
            x, y = (i % 2) * 428, (i // 2) * 264
            sheet.paste(image.resize((428, 240)), (x, y))
            draw.text((x + 8, y + 242), f"{file} / {time:.2f}s", font=font, fill="white")
        sheet.save(out / f"{file[:-4]}-contact.jpg", quality=90)
        check = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-i", str(path),
                                "-vf", "blackdetect=d=0.04:pix_th=0.02:pic_th=0.98",
                                "-an", "-f", "null", "-"], capture_output=True, text=True, check=True)
        item = {"file": file, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "probe": metadata, "quiet_40dBFS": quiet_intervals(samples, -40),
                "quiet_50dBFS": quiet_intervals(samples, -50),
                "black_frames": [l for l in check.stderr.splitlines() if "black_start:" in l],
                "ocr_sample_seconds": times}
        report["clips"].append(item)
        print(json.dumps({k: item[k] for k in ["file", "quiet_40dBFS", "quiet_50dBFS",
                                             "black_frames"]}), flush=True)
    for left, right in [(0, 1), (1, 1), (1, 2), (2, 3)]:
        x, y = audio_samples[FILES[left]], audio_samples[FILES[right]]
        window = np.concatenate([x[-22050:], y[:22050]])
        report["seams"].append({
            "from": FILES[left], "to": FILES[right],
            "sample_step_dbFS": float(20 * np.log10(max(np.max(np.abs(x[-1] - y[0])), 1e-12))),
            "quiet_40dBFS_in_1s_window": quiet_intervals(window, -40)})
    executable = out / "ocr"
    subprocess.run(["xcrun", "swiftc", "-O", str(Path(__file__).with_name("ocr.swift")),
                    "-o", str(executable)], check=True)
    ocr = run([str(executable), *ocr_frames]).decode()
    (out / "ocr.json").write_text(json.dumps([json.loads(l) for l in ocr.splitlines()],
                                            ensure_ascii=False, indent=2))
    (out / "inspection.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report["seams"], indent=2), flush=True)


if __name__ == "__main__":
    main()
