import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const context = vm.createContext({});
vm.runInContext(
  readFileSync(new URL('../generated/playback-core.js', import.meta.url), 'utf8'),
  context,
);
const core = context.PlaybackCore;
const tracks = [
  { id: 'a04', durationMs: 60008 },
  { id: 'a05', durationMs: 70385 },
];
const clock = { nowMs: 0, midnightMs: 0 };
const config = (mode = 'play-one', repeatCount = 7, sync = false) => ({
  trackId: 'a04',
  mode,
  repeatCount,
  sync,
});
const plain = x => JSON.parse(JSON.stringify(x));
function apply(state, event, time = clock) {
  return core.transition(state, event, time, tracks);
}
function start(c = config()) {
  let { state } = apply(core.initialState(c), { type: 'start', config: c });
  return started(state);
}
function started(state, positionMs = 0) {
  return apply(state, {
    type: 'started',
    generation: state.generation,
    positionMs,
    eligible: core.nearStart(positionMs),
  }).state;
}
function end(state, extra = {}) {
  return apply(state, {
    type: 'ended',
    generation: state.generation,
    reason: 'eof',
    positionMs: tracks.find(t => t.id === state.config.trackId).durationMs,
    ...extra,
  });
}

test('every mode honors N before mode decision; list resets next track counts', () => {
  for (const mode of core.MODES)
    for (const n of [1, 2, 7, 108]) {
      let s = start(config(mode, n));
      for (let count = 1; count <= n; count++) {
        const t = end(s);
        if (count < n) {
          assert.equal(t.state.config.trackId, 'a04');
          assert.equal(t.state.sessionCount, count);
          assert.equal(t.effects[0].type, 'load');
        }
        s = t.state;
        if (count < n) s = started(s);
      }
      if (mode === 'play-one') assert.equal(s.status, 'complete');
      if (mode === 'repeat-one') {
        assert.equal(s.sessionCount, 0);
        assert.equal(s.completedCount, n);
      }
      if (mode === 'play-all' || mode === 'repeat-all') {
        assert.equal(s.config.trackId, 'a05');
        assert.equal(s.sessionCount, 0);
        assert.equal(s.completedCount, 0);
        s = started(s);
        for (let i = 0; i < n; i++) {
          s = end(s).state;
          if (i < n - 1) s = started(s);
        }
        assert.equal(s.status, mode === 'play-all' ? 'complete' : 'loading');
        if (mode === 'repeat-all') assert.equal(s.config.trackId, 'a04');
      }
    }
});
test('1500ms inclusive, interrupted first join does not count or erase history', () => {
  for (const [position, expected] of [
    [-1, false],
    [0, true],
    [1499, true],
    [1500, true],
    [1501, false],
    [Infinity, false],
    [NaN, false],
  ]) {
    assert.equal(core.nearStart(position), expected);
  }
  let s = start();
  s = end(s).state;
  s = started(s, 1501);
  s = end(s).state;
  assert.equal(s.completedCount, 1);
});
test('duplicate/stale completion, loaded and start events cannot count twice', () => {
  const s = start();
  const t = end(s);
  assert.deepEqual(
    plain(end(t.state, { generation: s.generation })),
    plain({ state: t.state, effects: [] }),
  );
  const completed = end(start(config('play-one', 1))).state;
  assert.deepEqual(plain(end(completed).state), plain(completed));
  assert.equal(apply(s, { type: 'loaded', generation: s.generation }).effects.length, 0);
});
test('completed play and explicit same-track selection reset; cold restore preserves count without autoplay', () => {
  const done = end(start(config('play-one', 1))).state;
  assert.equal(apply(done, { type: 'play' }).state.completedCount, 0);
  const mid = end(start()).state;
  assert.equal(apply(mid, { type: 'start', config: mid.config }).state.completedCount, 0);
  const restored = core.restore(mid, tracks);
  assert.equal(restored.completedCount, 1);
  assert.equal(restored.status, 'idle');
  assert.equal(restored.eligible, false);
  assert.equal(apply(restored, { type: 'play' }).state.completedCount, 1);
});
test('local midnight, fractional seek and time discontinuity are explicit inputs', () => {
  for (const duration of [60008, 70385])
    for (const elapsed of [0, 1, duration, duration + 0.5, 86399999, 90000000]) {
      assert.equal(
        core.alignedPosition(duration, { nowMs: 100000 + elapsed, midnightMs: 100000 }),
        elapsed % duration,
      );
    }
  for (const duration of [0, -1, NaN, Infinity])
    assert.throws(() => core.alignedPosition(duration, clock));
  assert.throws(() => core.alignedPosition(100, { nowMs: 0, midnightMs: 1 }));
});
test('pause eligibility matches short/long/unknown pause and wraparound contract', () => {
  assert.equal(core.resumeEligible(true, 5000, 6000, 70000, 0, 1500), true);
  assert.equal(core.resumeEligible(true, 5000, 6000, 70000, 0, 1501), false);
  assert.equal(core.resumeEligible(true, 5000, 6000, 70000, 1, 0), false);
  assert.equal(core.resumeEligible(true, 5000, 6000, 70000, null, 100000), true);
  assert.equal(core.resumeEligible(true, 69999, 0, 70000, 0, 100000), true);
  assert.equal(core.resumeEligible(false, 5000, 6000, 70000, 0, 1), false);
  assert.equal(core.resumeEligible(true, 5000, 10000, 70000, 0, 1), false);
});
test('pause during load invalidates pending events; normal pause retains qualification', () => {
  const c = config();
  const loading = apply(core.initialState(c), { type: 'play' }).state;
  const paused = apply(loading, { type: 'pause' }).state;
  assert.equal(paused.status, 'idle');
  assert.equal(apply(paused, { type: 'loaded', generation: loading.generation }).effects.length, 0);
  const s = start();
  const p = apply(s, { type: 'pause' }).state;
  assert.equal(p.eligible, true);
  assert.equal(apply(p, { type: 'play' }).state.eligible, true);
});
test('sync load uses time at readiness, and pause resume realigns through one path', () => {
  const c = config('play-one', 7, true);
  const loading = apply(core.initialState(c), { type: 'play' }).state;
  const loaded = apply(
    loading,
    { type: 'loaded', generation: loading.generation },
    { nowMs: 62008, midnightMs: 0 },
  );
  assert.equal(loaded.effects[0].positionMs, 2000);
  assert.equal(loaded.effects[0].eligible, false);
  const paused = apply(start(c), { type: 'pause' }, clock).state;
  const resumed = apply(paused, { type: 'play' }, { nowMs: 62008, midnightMs: 0 });
  assert.equal(resumed.effects[0].type, 'seek-play');
  assert.equal(resumed.effects[0].eligible, false);
});
test('seek validation: reject sync seeks, nonfinite and out of bounds; valid rewind restores eligibility', () => {
  const s = start();
  assert.equal(apply(s, { type: 'seek', positionMs: 1500 }).state.eligible, true);
  assert.equal(apply(s, { type: 'seek', positionMs: 1501 }).state.eligible, false);
  for (const value of [-1, NaN, Infinity, 60009])
    assert.throws(() => apply(s, { type: 'seek', positionMs: value }));
  assert.throws(() => apply(start(config('play-one', 1, true)), { type: 'seek', positionMs: 0 }));
  assert.throws(() => apply(core.initialState(config()), { type: 'seek', positionMs: 0 }));
});
test('unexpected end/error never increments; tolerance endpoints are inclusive', () => {
  for (const delta of [-2001, -2000, 0, 5000, 5001]) {
    const t = end(start(), { positionMs: 60008 + delta });
    assert.equal(t.state.completedCount, delta >= -2000 && delta <= 5000 ? 1 : 0);
  }
  for (const reason of ['stop', 'error'])
    assert.equal(end(start(), { reason }).state.status, 'error');
  const s = start();
  const t = apply(s, { type: 'failed', generation: s.generation, message: 'decoder failed' });
  assert.equal(t.state.status, 'error');
  assert.equal(t.state.completedCount, 0);
});
test('invalid config and corrupt persisted state are rejected; five million is accepted without queue expansion', () => {
  for (const repeat of [0, -1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '7'])
    assert.throws(() => core.validateConfig(config('play-one', repeat), tracks));
  for (const repeat of [1, 5000000, Number.MAX_SAFE_INTEGER])
    assert.equal(core.validateConfig(config('play-one', repeat), tracks).repeatCount, repeat);
  assert.throws(() => core.validateConfig({ ...config(), trackId: '../secret' }, tracks));
  assert.throws(() => core.validateConfig({ ...config(), mode: 'shuffle' }, tracks));
  assert.throws(() => core.validateConfig({ ...config(), sync: 'true' }, tracks));
  for (const value of [null, {}, { ...start(), completedCount: -1 }, { ...start(), version: 2 }])
    assert.throws(() => core.restore(value, tracks));
  assert.equal(end(start(config('play-one', 5000000))).effects.length, 1);
});
test('overflow fails instead of wrapping or silently losing count', () => {
  assert.throws(() => end({ ...start(), completedCount: Number.MAX_SAFE_INTEGER }));
  assert.throws(() => apply({ ...start(), generation: Number.MAX_SAFE_INTEGER }, { type: 'stop' }));
});
test('display counts follow qualification, including mid-cycle join, cold restore and large totals', () => {
  assert.equal(core.displayedCount({ completedCount: 0, eligible: false }), 0);
  assert.equal(core.displayedCount({ completedCount: 39, eligible: true }), 40);
  assert.equal(core.displayedCount({ completedCount: 39, eligible: false }), 39);
  assert.equal(
    core.displayedCount({ completedCount: Number.MAX_SAFE_INTEGER, eligible: true }),
    Number.MAX_SAFE_INTEGER,
  );
});
test('stop after completion still makes subsequent play a new task; stopped partial task retains total', () => {
  const done = end(start(config('play-one', 1))).state;
  const stopped = apply(done, { type: 'stop' }).state;
  assert.equal(apply(stopped, { type: 'play' }).state.completedCount, 0);
  const mid = end(start()).state;
  assert.equal(apply(apply(mid, { type: 'stop' }).state, { type: 'play' }).state.completedCount, 1);
});
test('mobile-style live configuration preserves completed counts and native generation', () => {
  const before = started(end(start()).state);
  for (const mode of core.MODES) {
    const t = apply(before, { type: 'configure', settings: { mode, repeatCount: 5000000 } });
    assert.equal(t.state.completedCount, 1);
    assert.equal(t.state.sessionCount, 1);
    assert.equal(t.state.generation, before.generation);
    assert.equal(t.state.status, 'playing');
    assert.equal(t.effects.length, 0);
  }
  const lowered = apply(before, { type: 'configure', settings: { repeatCount: 1 } }).state;
  const resumed = apply(apply(lowered, { type: 'pause' }).state, { type: 'play' }).state;
  assert.equal(resumed.completedCount, 1);
  assert.equal(end(resumed).state.status, 'complete');
  assert.throws(() => apply(before, { type: 'configure', settings: { trackId: 'a05' } }));
  assert.throws(() => apply(before, { type: 'configure', settings: { repeatCount: 0 } }));
});
test('live sync enable aligns without autoplaying a paused track; disable does not seek', () => {
  for (const paused of [false, true])
    for (const positionMs of [1500, 1501]) {
      const before = paused ? apply(start(), { type: 'pause' }).state : start();
      const t = apply(
        before,
        { type: 'configure', settings: { sync: true } },
        { nowMs: 60008 + positionMs, midnightMs: 0 },
      );
      assert.equal(t.state.eligible, positionMs === 1500);
      assert.equal(t.state.status, before.status);
      assert.equal(t.effects[0].type, 'seek');
      assert.equal(t.effects[0].positionMs, positionMs);
      const off = apply(t.state, { type: 'configure', settings: { sync: false } });
      assert.equal(off.effects.length, 0);
      assert.equal(off.state.eligible, t.state.eligible);
    }
});
test('EOF racing pause counts once, does not autoplay and can resume with a real new load', () => {
  for (const mode of core.MODES) {
    const paused = apply(start(config(mode, 1)), { type: 'pause' }).state;
    const t = end(paused);
    assert.equal(t.effects[0].type, 'stop');
    assert.ok(['idle', 'complete'].includes(t.state.status));
    assert.deepEqual(plain(end(t.state, { generation: paused.generation }).state), plain(t.state));
    assert.equal(apply(t.state, { type: 'play' }).effects[0].type, 'load');
  }
});

test('daily statistics count only valid cycles, once, under source track before list transition', () => {
  const before = start(config('play-all', 1));
  const event = { type: 'ended', generation: before.generation, reason: 'eof', positionMs: 60008 };
  const clock = { nowMs: 86400000, midnightMs: 86400000, dayKey: '2026-11-16' };
  const after = apply(before, event, clock).state;
  assert.equal(after.config.trackId, 'a05');
  assert.deepEqual(plain(after.dailyStats), { '2026-11-16': { a04: 1 } });
  assert.deepEqual(plain(before.dailyStats), {});
  assert.deepEqual(plain(apply(after, event, clock).state.dailyStats), plain(after.dailyStats));
  assert.equal(Object.keys(end(started(before, 1501)).state.dailyStats).length, 0);
  assert.deepEqual(plain(core.restore(after, tracks).dailyStats), plain(after.dailyStats));
  for (const dailyStats of [{ bad: { a04: 1 } }, { '2026-11-16': { unknown: 1 } },
    { '2026-11-16': { a04: -1 } }, { '2026-11-16': [] }])
    assert.throws(() => core.restore({ ...after, dailyStats }, tracks));
  const old = { ...before };
  delete old.dailyStats;
  assert.deepEqual(plain(core.restore(old, tracks).dailyStats), {});
});
test('clock discontinuity invalidates interrupted count; sync can requalify within 1500ms only', () => {
  for (const sync of [false, true]) for (const positionMs of [1500, 1501]) {
    let s = start(config('play-one', 7, sync));
    const t = apply(s, { type: 'discontinuity' }, { nowMs: positionMs, midnightMs: 0 });
    assert.equal(t.state.eligible, false);
    assert.equal(t.effects.length, sync ? 1 : 0);
    if (sync) {
      assert.equal(t.effects[0].type, 'load');
      assert.equal(t.state.generation, s.generation + 1);
      assert.deepEqual(plain(end(t.state, { generation: s.generation }).state), plain(t.state));
      const loaded = apply(t.state, { type: 'loaded', generation: t.state.generation },
        { nowMs: positionMs, midnightMs: 0 });
      assert.equal(loaded.effects[0].eligible, positionMs === 1500);
    }
    s = apply(s, { type: 'pause' }).state;
    const paused = apply(s, { type: 'discontinuity' });
    assert.equal(paused.state.status, 'paused');
    assert.equal(paused.effects.length, 0);
  }
});
