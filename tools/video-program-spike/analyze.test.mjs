import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from './analyze.mjs';

// Deterministic evidence fixtures prove that the analyzer rejects missing data,
// skipped frames, discontinuous audio and premature starts.
function fixture() {
  const scenario = 'boundary-1';
  const row = (event, fields = {}) => ({ event, scenario, host: 1, ...fields });
  const events = [
    row('environment', { timescale: 44100, timeline: { spans: [] } }),
    row('suite-plan', { cases: [{ name: scenario, offset: 40.28, seconds: 4.8 }] }),
    row('scenario-start', { host: 0 }),
    row('seek-request'),
    row('scheduled-play', { deadlineHost: 0 }),
  ];
  for (let n = 0; n < 35; n++) {
    const pts = 41.6 + n * 0.04;
    events.push(row('video-frame', { pts, gapMs: 40 }));
    events.push(row('audio-buffer', { pts, duration: 0.04, sourceHost: 1, status: 0 }));
    events.push(row('sample', { elapsed: pts, position: pts, driftMs: 0, intent: true, pending: false, rate: 1,
      layerReady: true, timeControl: 2 }));
  }
  events.push(row('scenario-end', { host: 5 }));
  return { events, context: { mode: 'composition', suite: 'quick', tap: 'on' },
    complete: { success: true, errors: 0, scenarioCount: 1 } };
}
const run = data => analyze(data.events, data.context, data.complete);
test('complete continuous boundary passes', () => assert.equal(run(fixture()).passed, true));
test('missing evidence never passes', () => {
  assert.equal(analyze([], {}, { success: true, errors: 0 }).passed, false);
});
test('dropped video frame is detected', () => {
  const data = fixture();
  data.events = data.events.filter(row => !(row.event === 'video-frame' && Math.abs(row.pts - 42.28) < 0.001));
  assert.equal(run(data).passed, false);
});
test('lost decoded audio buffer is detected', () => {
  const data = fixture();
  data.events = data.events.filter(row => !(row.event === 'audio-buffer' && Math.abs(row.pts - 42.28) < 0.001));
  assert.equal(run(data).passed, false);
});
test('wrong clock, stall and extra seek are detected', () => {
  for (const extra of [
    { event: 'seek-request' },
    { event: 'native-event', name: 'AVPlayerItemPlaybackStalledNotification' },
    { event: 'sample', host: 2, intent: true, pending: false, rate: 1, driftMs: 100 },
  ]) {
    const data = fixture();
    data.events.splice(-1, 0, { scenario: 'boundary-1', ...extra });
    assert.equal(run(data).passed, false);
  }
});
test('tap off explicitly skips audio assertions, not video assertions', () => {
  const data = fixture();
  data.context.tap = 'off';
  data.events = data.events.filter(row => row.event !== 'audio-buffer');
  assert.equal(run(data).passed, true);
  data.events = data.events.filter(row => row.event !== 'video-frame');
  assert.equal(run(data).passed, false);
});
test('all-boundary suite cannot pass with only one boundary', () => {
  const data = fixture();
  data.context.suite = 'boundaries';
  assert.equal(run(data).passed, false);
});
test('future start must target zero, not skip the opening', () => {
  const data = fixture();
  const name = 'future-start';
  data.events.forEach(row => { row.scenario = name; });
  data.events.find(row => row.event === 'suite-plan').cases[0].name = name;
  data.events.find(row => row.event === 'scheduled-play').target = 0.35;
  assert.equal(run(data).checks.find(row => row.id === `${name}:starts-at-zero`).passed, false);
});
