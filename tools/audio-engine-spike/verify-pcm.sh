#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
CYCLES=${CYCLES:-21}
AUDIO="$ROOT/ios/StarlightPlayer/audio/A05 大悲咒（共修版）.wav"
STAMP=$(date '+%Y%m%d-%H%M%S')
RESULT_DIR="$ROOT/.audio-engine-spike/results/$STAMP-pcm-$CYCLES"
PLAYLIST="$RESULT_DIR/a05.m3u8"
MPV_WAV="$RESULT_DIR/libmpv.wav"

if [ ! -x "$ROOT/.audio-engine-spike/bin/miniaudio_render" ]; then
  "$ROOT/tools/audio-engine-spike/build.sh"
fi

mkdir -p "$RESULT_DIR"
: > "$PLAYLIST"
i=0
while [ "$i" -lt "$CYCLES" ]; do
  printf '%s\n' "$AUDIO" >> "$PLAYLIST"
  i=$((i + 1))
done

ffmpeg -v error -y -i "$AUDIO" -map 0:a:0 -c:a pcm_s16le -f s16le "$RESULT_DIR/source.raw"
"$ROOT/.audio-engine-spike/bin/miniaudio_render" \
  "$AUDIO" "$RESULT_DIR/miniaudio.raw" "$CYCLES"
mpv --no-config --really-quiet --no-video --audio-display=no \
  --gapless-audio=yes --audio-samplerate=44100 --audio-format=s16 \
  --audio-channels=stereo --ao=pcm --ao-pcm-file="$MPV_WAV" \
  --playlist="$PLAYLIST"
ffmpeg -v error -y -i "$MPV_WAV" -map 0:a:0 -c:a pcm_s16le -f s16le \
  "$RESULT_DIR/libmpv.raw"

python3 "$ROOT/tools/audio-engine-spike/verify_pcm.py" \
  "$RESULT_DIR/source.raw" "$CYCLES" \
  miniaudio="$RESULT_DIR/miniaudio.raw" libmpv="$RESULT_DIR/libmpv.raw" \
  | tee "$RESULT_DIR/pcm-summary.json"

printf 'Results: %s\n' "$RESULT_DIR"

