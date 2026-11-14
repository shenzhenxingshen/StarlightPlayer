#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
OUT="$ROOT/.audio-engine-spike/bin"
MINIAUDIO_PREFIX=$(brew --prefix miniaudio)
MPV_PREFIX=$(brew --prefix mpv)

mkdir -p "$OUT"

clang -std=c11 -O2 -Wall -Wextra -Werror \
  -I"$MINIAUDIO_PREFIX/include/miniaudio" \
  "$ROOT/tools/audio-engine-spike/miniaudio_spike.c" \
  -L"$MINIAUDIO_PREFIX/lib" -lminiaudio \
  -Wl,-rpath,"$MINIAUDIO_PREFIX/lib" \
  -o "$OUT/miniaudio_spike"

clang -std=c11 -O2 -Wall -Wextra -Werror \
  -I"$MINIAUDIO_PREFIX/include/miniaudio" \
  "$ROOT/tools/audio-engine-spike/miniaudio_render.c" \
  -L"$MINIAUDIO_PREFIX/lib" -lminiaudio \
  -Wl,-rpath,"$MINIAUDIO_PREFIX/lib" \
  -o "$OUT/miniaudio_render"

clang -std=c11 -O2 -Wall -Wextra -Werror \
  -I"$MPV_PREFIX/include" \
  "$ROOT/tools/audio-engine-spike/libmpv_spike.c" \
  -L"$MPV_PREFIX/lib" -lmpv \
  -Wl,-rpath,"$MPV_PREFIX/lib" \
  -o "$OUT/libmpv_spike"

printf 'Built %s\n' "$OUT/miniaudio_spike"
printf 'Built %s\n' "$OUT/miniaudio_render"
printf 'Built %s\n' "$OUT/libmpv_spike"

