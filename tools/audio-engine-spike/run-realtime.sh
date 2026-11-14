#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
ENGINE=${1:-}
CYCLES=${CYCLES:-21}
MUTE=${MUTE:-1}
AUDIO="$ROOT/ios/StarlightPlayer/audio/A05 大悲咒（共修版）.wav"
STAMP=$(date '+%Y%m%d-%H%M%S')
RESULT_DIR="$ROOT/.audio-engine-spike/results/$STAMP-$ENGINE"
BIN="$ROOT/.audio-engine-spike/bin"

if [ "$ENGINE" != miniaudio ] && [ "$ENGINE" != libmpv ]; then
  printf 'usage: %s miniaudio|libmpv\n' "$0" >&2
  exit 2
fi

if [ ! -x "$BIN/$ENGINE"_spike ]; then
  "$ROOT/tools/audio-engine-spike/build.sh"
fi

mkdir -p "$RESULT_DIR"
printf 'engine=%s cycles=%s mute=%s\n' "$ENGINE" "$CYCLES" "$MUTE" | tee "$RESULT_DIR/run.txt"
printf 'audio=%s\n' "$AUDIO" | tee -a "$RESULT_DIR/run.txt"
shasum -a 256 "$AUDIO" | tee -a "$RESULT_DIR/run.txt"

"$BIN/$ENGINE"_spike "$AUDIO" "$RESULT_DIR/$ENGINE.csv" "$CYCLES" "$MUTE" \
  2>&1 | tee "$RESULT_DIR/$ENGINE.log"

python3 "$ROOT/tools/audio-engine-spike/analyze.py" "$RESULT_DIR/$ENGINE.csv" \
  | tee "$RESULT_DIR/summary.md"
printf 'Results: %s\n' "$RESULT_DIR"

