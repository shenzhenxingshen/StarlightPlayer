#!/usr/bin/env python3
"""Fail unless every rendered cycle exactly matches the canonical PCM bytes."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 4:
        print(
            f"usage: {Path(sys.argv[0]).name} source.raw cycles engine=output.raw [...]",
            file=sys.stderr,
        )
        return 2

    source = Path(sys.argv[1]).read_bytes()
    cycles = int(sys.argv[2])
    expected_bytes = len(source) * cycles
    failed = False
    results: dict[str, object] = {
        "cycles": cycles,
        "source_bytes": len(source),
        "source_frames": len(source) // 4,
        "source_pcm_sha256": hashlib.sha256(source).hexdigest(),
        "engines": {},
    }

    engines: dict[str, object] = {}
    for argument in sys.argv[3:]:
        engine, raw_path = argument.split("=", 1)
        output = Path(raw_path).read_bytes()
        chunks = [
            output[index * len(source) : (index + 1) * len(source)]
            for index in range(cycles)
        ]
        complete = sum(len(chunk) == len(source) for chunk in chunks)
        exact = sum(chunk == source for chunk in chunks)
        frame_delta = (len(output) - expected_bytes) // 4
        passed = len(output) == expected_bytes and complete == cycles and exact == cycles
        failed = failed or not passed
        engines[engine] = {
            "passed": passed,
            "actual_frames": len(output) // 4,
            "expected_frames": expected_bytes // 4,
            "frame_delta": frame_delta,
            "complete_cycles": complete,
            "exact_cycle_matches": exact,
            "pcm_sha256": hashlib.sha256(output).hexdigest(),
        }

    results["engines"] = engines
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
