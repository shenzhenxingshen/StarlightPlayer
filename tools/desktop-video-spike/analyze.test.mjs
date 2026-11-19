import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from './analyze.mjs';

// Synthetic engine telemetry tests the analyzer itself; it is never claimed as
// real playback evidence. Real evidence is generated only by run.mjs.
function fixture() {
  const timeline = { timescale: 1000, totalTicks: 5100000,
    spans: Array.from({ length: 51 }, (_, i) => ({ endTicks: (i + 1) * 100000 })) };
  const rows = [
    { event: 'environment', host: 0, suite: 'quick', timeline },
    { event: 'ready', host: 0.1, duration: 5100 },
  ];
  const names = [0, 1, 48, 49].map(i => `boundary-${i}`).concat(
    ['future-start', 'late-join', 'pause-resume', 'cancel-prepare', 'stop-prepare', 'natural-end', 'already-ended']);
  names.forEach((scenario, i) => {
    const start = 1 + i * 10;
    const add = (event, time, fields = {}) => rows.push({ event, host: start + time, scenario, ...fields });
    const offset = scenario.startsWith('boundary-') ? (Number(scenario.slice(9)) + 1) * 100 - 1.7 :
      scenario === 'late-join' ? 600 : scenario === 'future-start' ? -1 : 640;
    const blocked = ['cancel-prepare', 'stop-prepare', 'already-ended'].includes(scenario);
    add('scenario-start', 0);
    if (!blocked) {
      add('command', 0.01, { args: ['seek'] });
      add('prepare', 0.02, { target: scenario === 'future-start' ? 0 : offset + 0.5 });
      add('prepared', 0.03, { latencyMs: 10 });
      add('released', scenario === 'future-start' ? 1 : 0.5, { deadlineErrorMs: 10 });
      if (scenario === 'pause-resume') {
        add('pause', 1.5);
        add('resume', 3);
        add('command', 3.01, { args: ['seek'] });
        add('released', 3.5, { deadlineErrorMs: 10 });
      }
      for (let n = 0; n < 37; n++) {
        const time = 0.6 + n * 0.1;
        if (scenario === 'future-start' && time < 1.1) continue;
        const paused = scenario === 'pause-resume' && time >= 1.5 && time < 3.5;
        const position = offset + (paused ? 1.5 : time);
        add('sample', time, { state: paused ? 'paused' : 'playing', paused: paused ? 1 : 0,
          seeking: 0, 'time-pos': position, 'audio-pts': position, avsync: 0,
          expected: offset + time, frames: n * 3 });
      }
    }
    if (scenario === 'natural-end') add('ended', 4.3);
    add('scenario-complete', 4.5);
  });
  rows.push({ event: 'suite-complete', host: 120, errors: 0 });
  return rows.sort((a, b) => a.host - b.host);
}

test('complete synthetic telemetry passes all checks', () => {
  const result = analyze(fixture());
  assert.deepEqual(result.failures, []);
  assert.equal(result.passed, true);
});
test('missing environment and partial runs fail without throwing', () => {
  assert.equal(analyze([]).passed, false);
  assert.equal(analyze(fixture().filter(r => r.event !== 'environment')).passed, false);
  assert.equal(analyze(fixture().slice(0, 10)).passed, false);
});
test('missing or duplicate scenario/completion cannot pass', () => {
  for (const mutation of [
    rows => rows.filter(r => r.event !== 'suite-complete'),
    rows => rows.filter(r => r.scenario !== 'boundary-49'),
    rows => [...rows, { ...rows.at(-1) }],
  ]) assert.equal(analyze(mutation(fixture())).passed, false);
});
test('frozen renderer and missing audio media clock are detected', () => {
  for (const field of ['frames', 'audio-pts']) {
    const rows = fixture();
    rows.filter(r => r.event === 'sample').forEach(r => {
      if (field === 'frames') r.frames = 0;
      else delete r[field];
    });
    assert.equal(analyze(rows).passed, false);
  }
});
test('bad drift, AV sync, engine error and nonmonotonic host are detected', () => {
  for (const mutation of [
    row => { row.expected -= 1; },
    row => { row.avsync = 0.3; },
    row => { row.event = 'native-event'; row.error = -1; },
    row => { row.host = -1; },
  ]) {
    const rows = fixture();
    mutation(rows.find(r => r.event === 'sample'));
    assert.equal(analyze(rows).passed, false);
  }
});
test('extra boundary seek and release after cancellation are detected', () => {
  for (const fields of [
    { event: 'command', args: ['seek'], scenario: 'boundary-0' },
    { event: 'released', scenario: 'cancel-prepare' },
    { event: 'released', scenario: 'stop-prepare' },
    { event: 'command', args: ['seek'], scenario: 'already-ended' },
  ]) {
    const rows = fixture();
    rows.splice(-1, 0, { host: 119, ...fields });
    assert.equal(analyze(rows).passed, false);
  }
});
test('future start cannot skip the opening, and a pause must not advance', () => {
  const future = fixture();
  future.find(r => r.scenario === 'future-start' && r.event === 'prepare').target = 0.5;
  assert.equal(analyze(future).passed, false);
  const paused = fixture();
  paused.filter(r => r.state === 'paused').forEach(r => { r['time-pos'] = r.expected; });
  assert.equal(analyze(paused).passed, false);
});
test('quick suite cannot masquerade as an all-boundary run', () => {
  const rows = fixture();
  rows[0].suite = 'boundaries';
  assert.equal(analyze(rows).passed, false);
});
test('only a bounded natural-EOF audio-property window may be excluded', () => {
  const rows = fixture();
  const samples = rows.filter(r => r.scenario === 'natural-end' && r.event === 'sample');
  samples.forEach(r => {
    r.expected += 4455.6;
    r['time-pos'] += 4455.6;
    r['audio-pts'] += 4455.6;
  });
  delete samples.at(-1)['audio-pts']; // 0.2 seconds before total, 0.1 before EOF.
  assert.equal(analyze(rows).passed, true);
  delete samples.at(-5)['audio-pts']; // Too early, must not be excused as EOF.
  assert.equal(analyze(rows).passed, false);
});
