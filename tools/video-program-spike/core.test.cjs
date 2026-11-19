const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compileProgram, locateTicks, locateWallClock, decide } = require(
  '../../release/video-program-spike/core/index.js',
);

const definition = {
  id: '49-2025V1',
  revision: 'test-fixture',
  timescale: 44100,
  segments: [
    { asset: 'intro', role: 'intro', durationTicks: 1864548, repeat: 1 },
    { asset: 'regular', role: 'regular', durationTicks: 3252816, repeat: 48 },
    { asset: 'final', role: 'final', durationTicks: 3432744, repeat: 1 },
    { asset: 'outro', role: 'outro', durationTicks: 3385689, repeat: 1 },
  ],
};
const timeline = compileProgram(definition);

test('49 cycles use 51 spans; exact sample duration, input unchanged', () => {
  const before = JSON.stringify(definition);
  assert.equal(timeline.totalCycles, 49);
  assert.equal(timeline.spans.length, 51);
  assert.equal(timeline.totalTicks, 164818149);
  assert.equal(JSON.stringify(definition), before);
});
test('all 50 internal boundaries and ±1 audio sample', () => {
  for (let index = 1; index < timeline.spans.length; index++) {
    const boundary = timeline.spans[index].startTicks;
    assert.equal(locateTicks(timeline, boundary - 1).span.index, index - 1);
    assert.equal(locateTicks(timeline, boundary).span.index, index);
    assert.equal(locateTicks(timeline, boundary).offsetTicks, 0);
    assert.equal(locateTicks(timeline, boundary + 1).offsetTicks, 1);
  }
});
test('wait/start/end and no wrap after end', () => {
  assert.equal(locateTicks(timeline, -1).status, 'waiting');
  assert.equal(locateTicks(timeline, 0).span.role, 'intro');
  assert.equal(locateTicks(timeline, timeline.totalTicks - 1).span.role, 'outro');
  assert.equal(locateTicks(timeline, timeline.totalTicks).status, 'ended');
  assert.equal(locateTicks(timeline, timeline.totalTicks * 2).status, 'ended');
});
test('late join after 10 minutes finds cycle 8, 41.4 seconds in', () => {
  const point = locateWallClock(timeline, 1700000000000, 1700000600000);
  assert.equal(point.span.cycle, 8);
  assert.equal(point.offsetTicks, 1825740);
});
test('special last cycle counts as program cycle 49, intro/outro do not', () => {
  assert.equal(timeline.spans[0].cycle, null);
  assert.equal(timeline.spans[48].cycle, 48);
  assert.equal(timeline.spans[49].cycle, 49);
  assert.equal(timeline.spans[50].cycle, null);
});
test('resume follows current wall clock, not the pause position', () => {
  const start = 1700000000000;
  const paused = decide(timeline, start, start + 600000, 'paused', 'tick');
  const resumed = decide(timeline, start, start + 630000, 'playing', 'resume');
  assert.equal(paused.command, 'pause');
  assert.equal(resumed.command, 'seek-and-play');
  assert.equal(resumed.position.elapsedTicks - paused.position.elapsedTicks, 30 * 44100);
});
test('pause and stop stay paused/stopped across arbitrary polls', () => {
  for (const seconds of [0, 1, 42.28, 1000, 3600, 4000]) {
    assert.equal(decide(timeline, 0, seconds * 1000, 'stopped', 'tick').command, 'stop');
    assert.ok(['pause', 'stop'].includes(decide(timeline, 0, seconds * 1000, 'paused', 'tick').command));
  }
});
test('join/resume after end never restarts', () => {
  for (const trigger of ['join', 'resume', 'tick']) {
    assert.equal(decide(timeline, 0, 4000000, 'playing', trigger).command, 'stop');
  }
});
test('no automatic per-cycle seek; future occurrence waits', () => {
  assert.equal(decide(timeline, 1000, 999, 'playing', 'join').command, 'wait');
  for (const span of timeline.spans) {
    assert.equal(decide(timeline, 0, span.startTicks / 44.1 + 1, 'playing', 'tick').command, 'none');
  }
});
test('resolved occurrence remains independent of local midnight', () => {
  const start = Date.parse('2026-11-17T23:59:00+08:00');
  assert.deepEqual(locateWallClock(timeline, start, start + 600000), locateTicks(timeline, 600 * 44100));
});
test('clock moves are reflected, rather than replaying the previous position', () => {
  assert.equal(locateWallClock(timeline, 10000, 9000).status, 'waiting');
  assert.equal(locateWallClock(timeline, 10000, 4010000).status, 'ended');
});
test('98 count is mathematically supported, not a claim about the 98 source video', () => {
  const input = JSON.parse(JSON.stringify(definition));
  input.segments[1].repeat = 97;
  const t = compileProgram(input);
  assert.equal(t.totalCycles, 98);
  assert.equal(t.spans.length, 100);
  assert.equal(t.spans[98].cycle, 98);
});
for (const value of [NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  test(`reject invalid elapsed ticks: ${value}`, () => assert.throws(() => locateTicks(timeline, value)));
}
for (const [key, value] of [['id', ''], ['revision', ' '], ['timescale', 0], ['timescale', 1.5],
  ['timescale', 1000000001], ['segments', []], ['segments', null]]) {
  test(`reject invalid definition ${key}=${value}`, () => {
    assert.throws(() => compileProgram({ ...definition, [key]: value }));
  });
}
for (const replacement of [null, { asset: '' }, { role: 'other' }, { durationTicks: 0 },
  { durationTicks: -1 }, { durationTicks: 1.1 }, { repeat: 0 }, { repeat: 10001 },
  { durationTicks: Number.MAX_SAFE_INTEGER, repeat: 2 }]) {
  test(`reject invalid segment ${JSON.stringify(replacement)}`, () => {
    assert.throws(() => compileProgram({
      ...definition, segments: [replacement === null ? null : { ...definition.segments[0], ...replacement }],
    }));
  });
}
test('reject excessive total spans, invalid clocks, invalid commands', () => {
  assert.throws(() => compileProgram({ ...definition, segments: [
    { ...definition.segments[0], repeat: 6000 }, { ...definition.segments[1], repeat: 6000 },
  ] }));
  assert.throws(() => locateWallClock(timeline, NaN, 0));
  assert.throws(() => locateWallClock(timeline, 0, Infinity));
  assert.throws(() => decide(timeline, 0, 0, 'bogus', 'join'));
  assert.throws(() => decide(timeline, 0, 0, 'playing', 'bogus'));
});
