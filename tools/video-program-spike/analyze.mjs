import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// Prototype acceptance budgets, not a claim about physical speaker latency.
export const limits = {
  settledDriftMs: 50,
  videoPTSDeltaMs: 40.1, // 25 fps: a missing decoded/output frame fails.
  frameCallbackGapMs: 120, // Simulator UI scheduling budget.
  audioGapMs: 1000 / 44100 + 0.005,
  pauseMovementMs: 20,
  settleSeconds: 0.3,
};
const stats = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length, min: sorted[0], max: sorted.at(-1),
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)],
  };
};
const maxAbs = values => values.length ? Math.max(...values.map(Math.abs)) : null;

export function analyze(events, context, complete) {
  const checks = [];
  const check = (id, passed, observed) => checks.push({ id, passed: Boolean(passed), observed });
  const select = (rows, event) => rows.filter(row => row.event === event);
  const env = events.find(row => row.event === 'environment');
  const plan = events.find(row => row.event === 'suite-plan');
  check('complete-with-zero-harness-errors', complete?.success && complete.errors === 0, complete);
  check('required-plan-and-environment', env && plan?.cases?.length, plan?.cases?.length ?? 0);
  check('no-native-error-or-stall', !events.some(row => ['error', 'missed-deadline', 'audio-ring-overflow'].includes(row.event)
    || row.event === 'native-event' && !row.name.includes('DidPlayToEndTime')
    || row.event === 'audio-buffer' && row.status !== 0), 'errors, deadline misses, stalls and ring overflow');
  if (!env || !plan?.cases?.length) return { passed: false, limits, checks, scenarios: [] };
  const scenarioNames = plan.cases.map(row => row.name);
  check('all-planned-cases-completed',
    select(events, 'scenario-start').length === scenarioNames.length
      && select(events, 'scenario-end').length === scenarioNames.length
      && complete.scenarioCount === scenarioNames.length,
    { planned: scenarioNames.length, completed: select(events, 'scenario-end').length });
  if (context.suite === 'boundaries' && context.mode === 'composition') {
    check('all-50-boundaries-planned', Array.from({ length: 50 }, (_, i) => `boundary-${i + 1}`)
      .every(name => scenarioNames.includes(name)), scenarioNames.length);
  }
  const scenarios = [];
  for (const entry of plan.cases) {
    const rows = events.filter(row => row.scenario === entry.name);
    const start = rows.find(row => row.event === 'scenario-start');
    const end = rows.find(row => row.event === 'scenario-end');
    check(`${entry.name}:has-start-and-end`, start && end, Boolean(start && end));
    if (!start || !end) continue;
    let settledAt = Infinity;
    const settled = [];
    for (const row of rows) {
      if (row.event === 'scheduled-play') settledAt = row.deadlineHost + limits.settleSeconds;
      if (['test-pause', 'scenario-stop', 'wall-end'].includes(row.event)) settledAt = Infinity;
      if (row.event === 'sample' && row.host >= settledAt && row.intent && !row.pending && row.rate === 1) settled.push(row);
    }
    const seeks = select(rows, 'seek-request');
    const launches = select(rows, 'scheduled-play');
    const audio = select(rows, 'audio-buffer');
    const report = {
      name: entry.name, seeks: seeks.length, launches: launches.length,
      settledDriftMs: stats(settled.map(row => row.driftMs)),
      seekLatencyMs: stats(select(rows, 'seek-complete').map(row => row.latencyMs)),
      seekAndPrerollMs: stats(select(rows, 'preroll-complete').map(row => row.latencyMs)),
      audioBuffers: audio.length,
      invalidAudioTimeRanges: audio.filter(row => row.pts < 0 || row.duration <= 0).length,
      boundaries: [],
    };
    if (settled.length) check(`${entry.name}:settled-clock-drift`,
      maxAbs(settled.map(row => row.driftMs)) <= limits.settledDriftMs, report.settledDriftMs);

    let boundaries = [];
    if (entry.name.startsWith('boundary-') || entry.name.startsWith('original-')) boundaries = [entry.offset + 2];
    if (['three-cycles-continuous', 'full-real-time'].includes(entry.name)) {
      boundaries = env.timeline.spans.slice(1).map(span => span.startTicks / env.timescale)
        .filter(boundary => boundary > entry.offset && boundary < entry.offset + entry.seconds - 0.8);
    }
    if (boundaries.length) {
      check(`${entry.name}:one-launch-no-internal-reseek`, seeks.length === 1 && launches.length === 1,
        { seeks: seeks.length, launches: launches.length });
      for (const boundary of boundaries) {
        const prefix = `${entry.name}@${boundary.toFixed(3)}`;
        const frames = select(rows, 'video-frame').filter(row => row.pts >= boundary - 0.7 && row.pts <= boundary + 0.7);
        const frameDeltas = frames.slice(1).map((row, index) => (row.pts - frames[index].pts) * 1000);
        // Filter by source host as well as PTS: draining can otherwise assign a
        // previous scenario's buffered audio to the next scenario's label.
        const buffers = audio.filter(row => row.sourceHost >= start.host && row.sourceHost <= end.host
          && row.duration > 0 && row.pts >= boundary - 0.7 && row.pts <= boundary + 0.7);
        const gaps = buffers.slice(1).map((row, index) => (row.pts - buffers[index].pts - buffers[index].duration) * 1000);
        const samples = settled.filter(row => row.elapsed >= boundary - 0.7 && row.elapsed <= boundary + 0.7);
        const boundaryReport = {
          seconds: boundary, videoFrames: frames.length,
          videoPTSDeltaMs: stats(frameDeltas), frameCallbackGapMs: stats(frames.slice(1).map(row => row.gapMs)),
          audioBuffers: buffers.length, audioTimestampGapMs: stats(gaps),
        };
        report.boundaries.push(boundaryReport);
        check(`${prefix}:progress-crosses-boundary`, samples.some(row => row.position < boundary - 0.4)
          && samples.some(row => row.position > boundary + 0.4), samples.length);
        check(`${prefix}:video-layer-ready-and-playing`, samples.length > 0
          && samples.every(row => row.layerReady && row.timeControl === 2), samples.length);
        check(`${prefix}:video-coverage`, frames.length > 10 && frames[0].pts < boundary - 0.5
          && frames.at(-1).pts > boundary + 0.5, frames.length);
        check(`${prefix}:video-no-missing-output-frame`, frameDeltas.length
          && frameDeltas.every(delta => delta > 0 && delta <= limits.videoPTSDeltaMs), stats(frameDeltas));
        check(`${prefix}:video-callback-budget`, frames.length
          && Math.max(...frames.slice(1).map(row => row.gapMs)) <= limits.frameCallbackGapMs,
        boundaryReport.frameCallbackGapMs);
        if (context.tap !== 'off') {
          check(`${prefix}:decoded-audio-coverage`, buffers.length > 5 && buffers[0].pts < boundary - 0.5
            && buffers.at(-1).pts + buffers.at(-1).duration > boundary + 0.5, buffers.length);
          check(`${prefix}:decoded-audio-timestamps-continuous`, gaps.length
            && maxAbs(gaps) <= limits.audioGapMs, stats(gaps));
        }
      }
    }
    if (entry.name === 'late-join-pause-resume') {
      const pause = rows.find(row => row.event === 'test-pause');
      const resume = seeks.find(row => row.reason === 'test-resume');
      const paused = select(rows, 'sample').filter(row => pause && resume && row.host > pause.host + 0.2 && row.host < resume.host);
      check(`${entry.name}:late-join-target`, launches[0]?.target >= 600 && launches[0]?.target < 601, launches[0]?.target);
      check(`${entry.name}:resume-catches-up`, launches.length === 2 && resume
        && resume.target - pause.elapsed > 3 && resume.target - pause.elapsed < 4, resume?.target);
      check(`${entry.name}:paused-remains-paused`, paused.length > 10
        && paused.every(row => !row.intent && row.rate === 0)
        && (Math.max(...paused.map(row => row.position)) - Math.min(...paused.map(row => row.position))) * 1000 <= limits.pauseMovementMs,
      paused.length);
    }
    if (entry.name === 'pause-cancels-pending-seek') {
      const pause = rows.find(row => row.event === 'test-pause');
      const after = select(rows, 'sample').filter(row => pause && row.host > pause.host + 0.2);
      check(`${entry.name}:no-stale-start`, pause && !launches.some(row => row.host > pause.host)
        && after.length > 5 && after.every(row => !row.intent && row.rate === 0), launches.length);
    }
    if (entry.name === 'future-start') {
      check(`${entry.name}:starts-at-zero`, launches.length === 1 && launches[0].target === 0, launches[0]?.target);
      const before = select(rows, 'sample').filter(row => row.elapsed > -0.25 && row.elapsed < -0.02);
      check(`${entry.name}:does-not-advance-before-start`, before.length > 0
        && before.every(row => row.position >= 0 && row.position < 0.02), before.map(row => row.position));
    }
    if (entry.name === 'natural-end' || entry.name === 'full-real-time') {
      const ended = select(rows, 'native-event').filter(row => row.name.includes('DidPlayToEndTime'));
      const duration = context.mode === 'composition' ? env.compositionDuration
        : events.find(row => row.event === 'item-status' && row.duration)?.duration;
      check(`${entry.name}:one-native-end-at-exact-duration`, ended.length === 1
        && Math.abs(ended[0].position - duration) <= 1 / env.timescale, ended.map(row => row.position));
      check(`${entry.name}:wall-clock-stops`, select(rows, 'wall-end').length === 1, select(rows, 'wall-end').length);
    }
    if (entry.name === 'after-end') check(`${entry.name}:no-restart`,
      launches.length === 0 && seeks.length === 0 && select(rows, 'join-after-end').length === 1, launches.length);
    scenarios.push(report);
  }
  return {
    passed: checks.every(item => item.passed), limits,
    checkCount: checks.length, failureCount: checks.filter(item => !item.passed).length,
    checkedBoundaries: scenarios.reduce((count, item) => count + item.boundaries.length, 0),
    checks, scenarios,
    limitsOfEvidence: 'Simulator media timestamps and decoded audio, not physical speaker output or cross-device synchronization. Invalid preroll audio ranges excluded explicitly. No inference that silent source audio was swallowed.',
  };
}

export function analyzeDirectory(directory) {
  const raw = readFileSync(resolve(directory, 'events.jsonl'), 'utf8');
  const events = raw.trim().split('\n').map(JSON.parse);
  const context = JSON.parse(readFileSync(resolve(directory, 'run-context.json'), 'utf8'));
  const complete = JSON.parse(readFileSync(resolve(directory, 'complete.json'), 'utf8'));
  const result = analyze(events, context, complete);
  const hash = data => createHash('sha256').update(data).digest('hex');
  result.evidence = {
    analyzedAt: new Date().toISOString(),
    eventsSHA256: hash(raw), analyzerSHA256: hash(readFileSync(new URL(import.meta.url))),
    runID: context.runID, executableSHA256: context.build?.executableSHA256,
  };
  writeFileSync(resolve(directory, 'analysis.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    run: context.runID, passed: result.passed, checks: result.checkCount,
    boundaries: result.checkedBoundaries, failures: result.checks.filter(item => !item.passed),
  }, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: node tools/video-program-spike/analyze.mjs <run-directory>');
  if (!analyzeDirectory(resolve(process.argv[2])).passed) process.exitCode = 1;
}
