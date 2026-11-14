# A05 desktop audio engine spike

This spike compares two candidate desktop audio engines with the exact A05 asset
shipped by the mobile applications:

- miniaudio: a low-level callback that fills every output buffer across a cycle
  boundary before returning to the device;
- libmpv: a 21-entry native playlist with `gapless-audio=yes`.

The spike deliberately keeps Starlight business rules out of the engines. It
measures whether an adapter can deliver the events and timing needed by the
shared playback state machine.

## Build

Install the two development dependencies and build the probes:

```sh
brew install miniaudio mpv
tools/audio-engine-spike/build.sh
```

Generated binaries and raw logs are written below `.audio-engine-spike/`, which
is ignored by Git.

## Real-time run

Each probe plays the current repository A05 21 times through the system audio
clock. Output is muted by default; decoding, buffering and device callbacks
still run in real time.

```sh
tools/audio-engine-spike/run-realtime.sh miniaudio
tools/audio-engine-spike/run-realtime.sh libmpv
```

To make the run audible, set `MUTE=0`. To use a different count, set `CYCLES`.

```sh
MUTE=0 CYCLES=3 tools/audio-engine-spike/run-realtime.sh miniaudio
```

Each run prints the result directory. Summarize one or more CSV logs with:

```sh
python3 tools/audio-engine-spike/analyze.py \
  .audio-engine-spike/results/<run>/miniaudio.csv \
  .audio-engine-spike/results/<run>/libmpv.csv
```

Verify the decoded 21-cycle PCM stream from both engines with:

```sh
tools/audio-engine-spike/verify-pcm.sh
```

The verifier requires every cycle to be byte-identical to the canonical A05
PCM stream and fails if either engine inserts or drops a frame.

## Measurement limits

- The miniaudio `output_frame` column is the exact frame supplied to the audio
  device callback. Its wall-clock timestamp is callback time, slightly earlier
  than physical speaker output by the device latency.
- libmpv events describe player state transitions. `END_FILE` to `START_FILE`
  event latency is not itself an acoustic silence measurement because mpv can
  keep buffered audio in the device.
- A physical acoustic-gap conclusion still requires loopback capture on every
  target OS. The sample-level renderer checks inserted or dropped PCM frames,
  while a loopback test checks the final OS/device path.
