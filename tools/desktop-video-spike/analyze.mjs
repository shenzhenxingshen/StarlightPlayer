import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function analyze(rows) {
  const failures = [];
  let assertions = 0;
  const check = (value, message) => { assertions++; if (!value) failures.push(message); };
  const environment = rows.find(r => r.event === 'environment');
  const timeline = environment?.timeline;
  check(Boolean(timeline?.spans?.length === 51), 'Missing canonical 51-span timeline');
  check(['quick', 'boundaries'].includes(environment?.suite), 'Missing/unknown suite');
  check(rows.some(r => r.event === 'ready' &&
    Math.abs(r.duration - timeline?.totalTicks / timeline?.timescale) < 0.002), 'Native duration mismatch');
  check(rows.filter(r => r.event === 'suite-complete').length === 1 &&
    rows.some(r => r.event === 'suite-complete' && r.errors === 0), 'No unique successful suite completion');
  check(rows.every((r, i) => Number.isFinite(r.host) && (i === 0 || r.host >= rows[i-1].host)),
    'Missing/non-monotonic event timestamps');
  check(!rows.some(r => r.event === 'error' || (r.event === 'native-event' && r.error < 0)), 'Native/control error');
  const expected = environment?.suite === 'boundaries' ? Array.from({ length: 50 }, (_, i) => i) : [0, 1, 48, 49];
  const names = expected.map(i => `boundary-${i}`).concat(
    ['future-start', 'late-join', 'pause-resume', 'cancel-prepare', 'stop-prepare', 'natural-end', 'already-ended']);
  check(rows.filter(r => r.event === 'scenario-start').length === names.length, 'Scenario count mismatch');
  const drifts = [], audioDrifts = [], preparationMs = [], releaseMs = [], frameSteps = [];
  let unavailableTerminalAudioSamples = 0;
  for (const name of names) {
    const events = rows.filter(r => r.scenario === name);
    check(events.filter(r => r.event === 'scenario-start').length === 1, `${name}: missing/duplicate start`);
    check(events.filter(r => r.event === 'scenario-complete').length === 1, `${name}: incomplete`);
    const samples = events.filter(r => r.event === 'sample');
    const playing = samples.filter(r => r.state === 'playing' && r.seeking === 0 && r.paused === 0);
    const releases = events.filter(r => r.event === 'released');
    const seeks = events.filter(r => r.event === 'command' && r.args?.[0] === 'seek');
    const shouldPlay = !['cancel-prepare', 'stop-prepare', 'already-ended'].includes(name);
    if (shouldPlay) {
      check(playing.length >= 5, `${name}: insufficient actual playback samples`);
      check(playing.every(r => Number.isFinite(r['time-pos'])), `${name}: missing media position`);
      const audioSamples = playing.filter(r => Number.isFinite(r['audio-pts']));
      const missingAudio = playing.filter(r => !Number.isFinite(r['audio-pts']));
      const ended = events.find(r => r.event === 'ended');
      // mpv 0.42 command.c/mp_property_audio_pts deliberately returns unavailable
      // once audio_status reaches EOF, possibly before video/overall EOF. Only a
      // bounded natural-end window is excluded; it is NOT continuity evidence.
      check(audioSamples.length >= 5 && missingAudio.every(r =>
        name === 'natural-end' && timeline?.totalTicks / timeline?.timescale - r['time-pos'] <= 0.3 &&
        r['time-pos'] <= timeline?.totalTicks / timeline?.timescale &&
        ended && ended.host >= r.host && ended.host - r.host <= 0.35),
      `${name}: missing audio clock outside bounded native-EOF window`);
      unavailableTerminalAudioSamples += missingAudio.length;
      audioDrifts.push(...audioSamples.map(r => (r['audio-pts'] - r.expected) * 1000));
      check(audioSamples.every(r => Math.abs(r['audio-pts'] - r.expected) <= 0.25),
        `${name}: audio clock drift >250ms`);
      check(playing.at(-1)?.frames - playing[0]?.frames >= 10, `${name}: no rendered frame advancement`);
      const expectedCount = name === 'pause-resume' ? 2 : 1;
      check(releases.length === expectedCount, `${name}: unexpected release count`);
      check(seeks.length === expectedCount, `${name}: extra seek/retry (no per-boundary seek expected)`);
      for (const sample of playing) {
        drifts.push((sample['time-pos'] - sample.expected) * 1000);
      }
      check(playing.every(r => Math.abs(r['time-pos'] - r.expected) <= 0.25), `${name}: media drift >250ms`);
      check(playing.every(r => Math.abs(r.avsync ?? Infinity) <= 0.15), `${name}: AV sync >150ms`);
    } else {
      check(releases.length === 0, `${name}: cancelled/ended intent unexpectedly released playback`);
      check(playing.length === 0, `${name}: cancelled/ended intent unexpectedly played`);
    }
    if (name.startsWith('boundary-')) {
      const boundary = timeline?.spans?.[Number(name.slice(9))]?.endTicks / timeline?.timescale;
      check(playing.some(r => r['time-pos'] < boundary), `${name}: missing pre-boundary playback`);
      check(playing.some(r => r['time-pos'] > boundary + 0.2), `${name}: missing post-boundary playback`);
      let maxStep = 0, maxResidual = 0;
      for (let i = 1; i < playing.length; i++) {
        const delta = playing[i]['time-pos'] - playing[i-1]['time-pos'];
        const real = playing[i].host - playing[i-1].host;
        maxStep = Math.max(maxStep, delta);
        maxResidual = Math.max(maxResidual, Math.abs(delta - real));
        frameSteps.push(delta);
      }
      check(frameSteps.every(Number.isFinite) && maxStep <= 0.3 && maxResidual <= 0.15,
        `${name}: discontinuous sampled media clock`);
    }
    if (name === 'future-start') {
      check(events.find(r => r.event === 'prepare')?.target === 0, 'Future start skipped the beginning');
      check((playing[0]?.['time-pos'] ?? Infinity) <= 0.3, 'Future start missing initial playback');
    }
    if (name === 'late-join') {
      check((playing[0]?.['time-pos'] ?? 0) >= 600 && playing[0]?.['time-pos'] < 601.5, 'Late join wrong position');
    }
    if (name === 'pause-resume') {
      const pause = events.find(r => r.event === 'pause');
      const resume = events.find(r => r.event === 'resume');
      const paused = samples.filter(r => r.host > pause?.host + 0.3 && r.host < resume?.host);
      check(paused.length >= 5 && paused.every(r => r.paused === 1), 'Pause did not stay paused');
      check(paused.length > 0 && Math.max(...paused.map(r => r['time-pos'])) -
        Math.min(...paused.map(r => r['time-pos'])) < 0.05, 'Media advanced while paused');
      const resumed = playing.filter(r => r.host > resume?.host);
      check(resumed.length > 3 && resumed[0]?.['time-pos'] - paused.at(-1)?.['time-pos'] > 1,
        'Resume did not catch up to wall time');
    }
    if (name === 'natural-end') check(events.some(r => r.event === 'ended'), 'Missing native EOF');
    if (name === 'already-ended') check(seeks.length === 0, 'Ended occurrence restarted');
    preparationMs.push(...events.filter(r => r.event === 'prepared').map(r => r.latencyMs));
    releaseMs.push(...releases.map(r => r.deadlineErrorMs));
  }
  const range = values => values.length ? [Math.min(...values), Math.max(...values)] : null;
  return { passed: failures.length === 0, assertions, failures, scenarios: names.length,
    boundaryScenarios: expected.length, mediaDriftMs: range(drifts), audioDriftMs: range(audioDrifts),
    unavailableTerminalAudioSamples, preparationMs: range(preparationMs),
    releaseDeadlineErrorMs: range(releaseMs), sampledMediaStepSeconds: range(frameSteps),
    limitations: ['Sampled engine clocks/render counters are not speaker recordings or per-frame PTS evidence.',
      'Boundary scenarios seek near each seam; they are not a complete uninterrupted 62-minute run.'] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(process.argv[2]);
  const rows = readFileSync(resolve(directory, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const result = analyze(rows);
  writeFileSync(resolve(directory, 'analysis.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}
