#!/usr/bin/env python3
"""Create a separate, timing-preserving review revision of the 49-cycle materials.

This is a reviewed-source-specific treatment, NOT an automatic silence remover
or general-purpose watermark remover. Source metadata and attribution are kept
in the provenance manifest. It never overwrites original or existing output media.
"""
import argparse
import copy
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from audit import FILES, audio, frame, probe

EXPECTED_HASHES = [
    "6c551160e0e421c818bf0b55478c252c8e094656f00e5525ebffdeb7d7850c7e",
    "c078aaa5d999fc39e7e8ec86e5ad870eb9c1c93991ab6a415f53124a84c5f4e5",
    "cb3296034c0525576f51d3ee286002532787a777201aabbd424fbe373924cad4",
    "c527baa8d2bb94d88c9290d50e2294d7cff5eb62d9b34129cfc1ba292601a6fa",
]
COUNTER_RECT = (100, 324, 112, 80)  # subtitles begin at y>=408 in body frames
RAMP_SAMPLES = 221  # 5.011ms; no duration removed, no overlap between clips
SAMPLE_RATE = 44100
FONT_PATH = "/System/Library/Fonts/STHeiti Medium.ttc"
GAIN_DB = -2.0  # same across all four clips; source AAC overshoots full scale


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_input(source):
    manifest = json.loads((source / "manifest.json").read_text())
    sequence = [(s["file"], s["repeat"]) for s in manifest["program"]["sequence"]]
    if sequence != list(zip(FILES, [1, 48, 1, 1])):
        raise ValueError("Requires the reviewed four-part 49-cycle input")
    for name, expected in zip(FILES, EXPECTED_HASHES):
        if sha256(source / name) != expected:
            raise ValueError(f"Unreviewed input: {name}; re-audit before changing the treatment")
    if sha256(Path(manifest["source"]["path"])) != manifest["source"]["sha256"]:
        raise ValueError("Original long video differs")
    return manifest


def audio_filter(samples):
    if samples <= RAMP_SAMPLES * 2:
        raise ValueError("Clip is too short for two non-overlapping edge ramps")
    return (f"atrim=end_sample={samples},asetpts=PTS-STARTPTS,volume={GAIN_DB}dB,"
            f"afade=t=in:ss=0:ns={RAMP_SAMPLES}:curve=tri,"
            f"afade=t=out:ss={samples-RAMP_SAMPLES}:ns={RAMP_SAMPLES}:curve=tri")


def video_filter(index):
    if index not in range(4):
        raise ValueError("Unknown reviewed clip")
    x, y, w, h = COUNTER_RECT
    repair = f"delogo=x={x}:y={y}:w={w}:h={h}"
    if index == 0:
        # Keep the source opening, including its original title. Do not overlay
        # a replacement card or add branding; only repair the counter at its end.
        return (f"[0:v]{repair}:enable='gte(t,42.04)',"
                "fade=t=in:st=0:d=0.24,setsar=320/321[v]")
    if index in (1, 2):
        return f"[0:v]{repair},setsar=320/321[v]"
    # Original audio becomes quiet near 76.31s. Only fade the picture, preserving
    # all remaining audio, including its ~13ms tail after the last video frame.
    return "[0:v]fade=t=out:st=76.36:d=0.36,setsar=320/321[v]"


def stream_shape(metadata):
    a = next(s for s in metadata["streams"] if s["codec_type"] == "audio")
    v = next(s for s in metadata["streams"] if s["codec_type"] == "video")
    return {"audio_ticks": a["duration_ts"], "audio_timebase": a["time_base"],
            "audio_start": a["start_time"], "video_frames": int(v["nb_frames"]),
            "video_ticks": v["duration_ts"], "video_timebase": v["time_base"],
            "video_start": v["start_time"], "width": v["width"], "height": v["height"],
            "sar": v["sample_aspect_ratio"], "fps": v["avg_frame_rate"]}


def verify_audio(before, after, samples):
    x, y = audio(before)[:samples], audio(after)[:samples]
    if len(x) != samples or len(y) != samples:
        raise ValueError("Decoded audio is shorter than declared timeline")
    # AAC re-encoding is lossy. Check amplitude/correlation away from edge ramps;
    # do not describe this result as bit-identical or lossless.
    a = x[4410:-4410].ravel() * 10 ** (GAIN_DB / 20)
    b = y[4410:-4410].ravel()
    correlation = float(np.corrcoef(a, b)[0, 1])
    snr = float(10 * np.log10(np.mean(a * a) / max(np.mean((a-b)**2), 1e-20)))
    peak = float(np.max(np.abs(y)))
    if correlation < .995 or snr < 25 or peak >= 1:
        raise ValueError(f"Unexpected audio change: correlation={correlation}, snr={snr}, peak={peak}")
    return {"interior_correlation": correlation, "gain_adjusted_interior_snr_dB": snr,
            "source_decoded_peak": float(np.max(np.abs(x))), "gain_dB": GAIN_DB,
            "decoded_peak": peak, "checked_samples": samples,
            "first_sample": y[0].tolist(), "last_sample": y[-1].tolist()}


def comparison_sheet(source, output):
    points = [(0, 2), (0, 5.2), (0, 42.24), (1, 5), (1, 73.72),
              (2, 5), (2, 77.8), (3, 76.6)]
    image = Image.new("RGB", (856, 268 * len(points)), "#222222")
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(FONT_PATH, 17)
    for row, (index, time) in enumerate(points):
        for col, directory in enumerate([source, output]):
            current = Image.fromarray(frame(directory / FILES[index], time)).resize((428, 240))
            x, y = col * 428, row * 268
            image.paste(current, (x, y))
            if col == 0 and index in (1, 2) and time < 77.5:
                rx, ry, w, h = COUNTER_RECT
                draw.rectangle((x+rx//2, y+ry//2, x+(rx+w)//2, y+(ry+h)//2),
                               outline="#ff4040", width=2)
            draw.text((x+8, y+242), f"{'原版' if col == 0 else '修订'} / {index+1} / {time:.2f}s",
                      fill="white", font=font)
    image.save(output / "before-after.jpg", quality=93)


def preview(output, manifest):
    # Short reel: opening + each of the four unique seams + ending.
    durations = [stream_shape(c["probe"])["audio_ticks"] / SAMPLE_RATE
                 for c in manifest["clips"]]
    parts = [(0, 0, 7)]
    for left, right in [(0, 1), (1, 1), (1, 2), (2, 3)]:
        parts += [(left, durations[left]-3, 3), (right, 0, 3)]
    parts.append((3, durations[3]-5, 5))
    filters = []
    for n, (index, start, duration) in enumerate(parts):
        filters += [f"[{index}:v]trim=start={start:.9f}:duration={duration},setpts=PTS-STARTPTS[v{n}]",
                    f"[{index}:a]atrim=start={start:.9f}:duration={duration},asetpts=PTS-STARTPTS[a{n}]"]
    streams = "".join(f"[v{n}][a{n}]" for n in range(len(parts)))
    filters.append(f"{streams}concat=n={len(parts)}:v=1:a=1[v][a]")
    command = ["ffmpeg", "-v", "error", "-nostdin", "-n"]
    for name in FILES:
        command += ["-i", str(output / name)]
    command += ["-filter_complex", ";".join(filters), "-map", "[v]", "-map", "[a]",
                "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
                "-profile:v", "baseline", "-bf", "0", "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart", str(output / "review-36s.mp4")]
    subprocess.run(command, check=True)
    return [{"clip": FILES[i], "start": s, "duration": d} for i, s, d in parts]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source, output = args.input.resolve(), args.output.resolve()
    if output == source or output in source.parents or source in output.parents:
        raise SystemExit("Input/output directories must be separate siblings")
    manifest = validate_input(source)
    # A partial/failed revision remains for diagnosis; rerun into a fresh directory.
    output.mkdir(parents=True, exist_ok=False)
    original = copy.deepcopy(manifest)
    manifest["created_at"] = datetime.now(timezone.utc).isoformat()
    manifest["revision_kind"] = "49-cycle-clean-review-v2"
    manifest["parent"] = {"path": str(source), "manifest_sha256": sha256(source / "manifest.json"),
                          "clip_sha256": dict(zip(FILES, EXPECTED_HASHES))}
    manifest["image_treatment"] = (
        "Source opening and original title retained, no added title card or branding; localized "
        "counter-area interpolation, not recovered original pixels; no body subtitles cropped. "
        "Opening/ending picture fades in existing time.")
    manifest["audio_treatment"] = (
        "221-sample linear edge ramps at both ends; uniform -2dB headroom across all clips "
        "because source AAC exceeds full scale; AAC re-encoded. No trimming, stretching, "
        "overlap, per-clip loudness normalization, extra silence or change of sequence.")
    manifest["review_status"] = "Technical verification only; human visual/listening approval pending"
    manifest["treatment"] = {"counter_rect": COUNTER_RECT, "edge_ramp_samples": RAMP_SAMPLES,
                              "uniform_gain_dB": GAIN_DB,
                              "added_opening_title": False,
                              "timeline_preserved": True, "source_subtitle_attribution_retained": True}
    manifest["clips"] = []
    for index, (name, old) in enumerate(zip(FILES, original["clips"])):
        before = source / name
        destination = output / name
        samples = stream_shape(probe(before))["audio_ticks"]
        command = ["ffmpeg", "-hide_banner", "-v", "warning", "-nostdin", "-n",
                   "-i", str(before)]
        command += ["-filter_complex", video_filter(index),
                    "-map", "[v]", "-map", "0:a:0", "-af", audio_filter(samples),
                    "-map_metadata", "-1", "-map_chapters", "-1",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                    "-profile:v", "baseline", "-level:v", "3.0", "-pix_fmt", "yuv420p",
                    "-r", "25", "-fps_mode", "cfr", "-g", "25", "-keyint_min", "25",
                    "-sc_threshold", "0", "-bf", "0", "-threads", "4",
                    "-color_range", "tv", "-colorspace", "bt709", "-color_trc", "bt709",
                    "-color_primaries", "bt709", "-c:a", "aac", "-b:a", "192k",
                    "-ar", "44100", "-ac", "2", "-movflags", "+faststart",
                    "-movie_timescale", "44100", "-video_track_timescale", "12800",
                    "-metadata", f"title={old['title']}", str(destination)]
        print(f"Processing {name}", flush=True)
        result = subprocess.run(command, capture_output=True, text=True)
        (output / f"{name}.encode.log").write_text(result.stderr)
        if result.returncode:
            raise SystemExit(result.stderr)
        metadata = probe(destination)
        if stream_shape(metadata) != stream_shape(probe(before)):
            raise SystemExit(f"Timeline/format changed: {stream_shape(metadata)} vs "
                             f"{stream_shape(probe(before))}")
        decoded = subprocess.run(
            ["ffmpeg", "-v", "error", "-xerror", "-nostdin", "-i", str(destination),
             "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"],
            capture_output=True, text=True, check=True)
        if decoded.stderr.strip():
            raise SystemExit(decoded.stderr)
        item = {k: old[k] for k in ("file", "title", "source_start_seconds",
                                    "source_end_seconds", "cut_duration_seconds", "program_repeats")}
        item.update({"sha256": sha256(destination), "bytes": destination.stat().st_size,
                     "probe": metadata, "command": command, "full_av_decode_passed": True,
                     "audio_verification": verify_audio(before, destination, samples)})
        manifest["clips"].append(item)
    validate_input(source)  # originals still unchanged after processing
    manifest["asset_revision"] = "-".join(c["sha256"][:12] for c in manifest["clips"])
    comparison_sheet(source, output)
    manifest["review_reel"] = preview(output, manifest)
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    (output / "SHA256SUMS.txt").write_text("".join(
        f'{c["sha256"]}  {c["file"]}\n' for c in manifest["clips"]))
    print(json.dumps({"revision": manifest["asset_revision"],
                      "program": manifest["program"], "output": str(output)}, indent=2), flush=True)


if __name__ == "__main__":
    main()
