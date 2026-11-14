#!/usr/bin/env python3
"""Summarize A05 desktop-engine spike event logs without third-party packages."""

from __future__ import annotations

import csv
import math
import statistics
import sys
from pathlib import Path


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return math.nan
    index = (len(ordered) - 1) * fraction
    lower = math.floor(index)
    upper = math.ceil(index)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (index - lower)


def number(row: dict[str, str], key: str) -> float:
    value = row.get(key, "")
    try:
        return float(value)
    except (TypeError, ValueError):
        return math.nan


def summarize(path: Path) -> str:
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    if not rows:
        return f"## {path.name}\n\nNo events recorded.\n"

    engine = rows[0]["engine"]
    starts = [row for row in rows if row["event"] == "cycle_start"]
    ends = [row for row in rows if row["event"] == "cycle_end"]
    start_times = [number(row, "elapsed_ms") for row in starts]
    intervals = [right - left for left, right in zip(start_times, start_times[1:])]
    transition_gaps = [
        number(row, "transition_gap_ms")
        for row in starts[1:]
        if math.isfinite(number(row, "transition_gap_ms"))
    ]
    end_errors = [row for row in ends if row.get("error", "") not in ("", "0")]

    lines = [
        f"## {engine}",
        "",
        f"- cycles started/ended: {len(starts)}/{len(ends)}",
        f"- recorded errors: {len(end_errors)}",
    ]
    if intervals:
        lines.extend(
            [
                f"- cycle-start interval mean: {statistics.fmean(intervals):.3f} ms",
                f"- cycle-start interval min/max: {min(intervals):.3f} / {max(intervals):.3f} ms",
                f"- cycle-start interval p95: {percentile(intervals, 0.95):.3f} ms",
            ]
        )
        if len(intervals) > 1:
            steady = intervals[1:]
            lines.extend(
                [
                    f"- after-warm-up interval mean: {statistics.fmean(steady):.3f} ms",
                    f"- after-warm-up interval min/max: {min(steady):.3f} / {max(steady):.3f} ms",
                ]
            )
    if starts:
        final_drift = number(starts[-1], "drift_ms")
        lines.append(f"- final start drift: {final_drift:.3f} ms")
    if transition_gaps:
        lines.extend(
            [
                f"- end-to-next-start event gap mean: {statistics.fmean(transition_gaps):.3f} ms",
                f"- end-to-next-start event gap min/max: {min(transition_gaps):.3f} / {max(transition_gaps):.3f} ms",
            ]
        )

    if engine == "miniaudio" and starts and ends:
        expected_frames = int(ends[0]["cycle_frames"])
        frame_intervals = [
            int(right["output_frame"]) - int(left["output_frame"])
            for left, right in zip(starts, starts[1:])
        ]
        bad = [value for value in frame_intervals if value != expected_frames]
        lines.append(
            f"- exact frame intervals: {len(frame_intervals) - len(bad)}/{len(frame_intervals)}"
        )
        lines.append(f"- expected frames per cycle: {expected_frames}")

    lines.append("")
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) < 2:
        print(f"usage: {Path(sys.argv[0]).name} events.csv [events.csv ...]", file=sys.stderr)
        return 2
    print("# A05 audio engine spike summary\n")
    for argument in sys.argv[1:]:
        print(summarize(Path(argument)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
