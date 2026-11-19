import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// Build separately (see README). This only installs/starts the isolated debug
// validation app, never clears or replaces the user's normal app.
const device = process.argv[2];
if (!device) throw new Error('Usage: node tools/android-video-validation/run.mjs <adb-serial> [output-directory]');
const out = resolve(process.argv[3] || 'release/android-video-validation');
const adb = process.env.ADB || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const id = 'com.starlightplayer.videovalidation';
const apk = resolve('android/app/build/outputs/apk/debug/app-debug.apk');
const run = args => execFileSync(adb, ['-s', device, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const runId = new Date().toISOString();
mkdirSync(out, { recursive: true });
run(['install', '-r', apk]);
run(['shell', 'am', 'force-stop', id]);
run(['shell', 'am', 'start', '-n', `${id}/com.starlightplayer.VideoSyncProbeActivity`, '--es', 'runId', runId]);
let result;
const deadline = Date.now() + 200_000;
while (Date.now() < deadline) {
  try {
    const candidate = JSON.parse(run(['exec-out', 'run-as', id, 'cat', 'files/video-boundary-validation.json']));
    if (candidate.runId === runId) { result = candidate; break; }
  } catch { /* The first run has not produced the file yet. */ }
  await new Promise(r => setTimeout(r, 1000));
}
if (!result) throw new Error('Android native validation did not finish within 200s; inspect adb logcat for StarlightVideo/AndroidRuntime.');
writeFileSync(resolve(out, 'events.json'), JSON.stringify(result, null, 2));
const assertions = [];
const seams = new Set(['intro-salutation', 'salutation-regular', 'regular-repeat', 'regular-final', 'final-outro']);
for (const scenario of result.scenarios) {
  const { name, samples = [], diagnostics = [] } = scenario;
  const corrections = diagnostics.filter(e => e.includes(' boundary_correction ')).length;
  const checks = diagnostics.filter(e => e.includes(' boundary_check ')).length;
  const errors = samples.filter(e => e.error);
  const tail = samples.slice(-5);
  const stable = samples.slice(6).filter(e => e.playing && !e.aligning);
  const alignedTail = tail.length === 5 && tail.every(e => e.playing && Math.abs(e.expectedMs - e.actualMs) <= 250);
  let pass = scenario.ready === true && !scenario.rejected && errors.length === 0;
  if (name === 'already-ended') pass = scenario.rejected === 'video_window';
  else if (name === 'mid-clip-drift') {
    pass &&= corrections === 0 && checks === 0 && stable.length >= 10 &&
      stable.every(e => e.expectedMs - e.actualMs > 700) && samples.every(e => !e.aligning);
  } else if (['boundary-late', 'boundary-early', 'boundary-skip'].includes(name)) {
    pass &&= checks >= 1 && corrections === 1 && alignedTail;
  } else if (name === 'boundary-cancel') {
    const after = samples.filter(e => e.wallMs >= scenario.cancelledAt);
    pass &&= corrections === 1 && after.length >= 5 && after.every(e => !e.playing && !e.aligning);
  } else if (name === 'window-stops-lagging') {
    pass &&= corrections === 0 && tail.length === 5 && tail.every(e => !e.playing && e.actualMs < 4900) &&
      samples.filter(e => e.expectedMs >= 5600).every(e => !e.playing);
  } else if (name === 'end-no-wrap') {
    pass &&= stable.length >= 5 && tail.every(e => !e.playing && e.actualMs >= 4900);
  } else {
    pass &&= stable.length >= 5 && stable.every(e => Math.abs(e.expectedMs - e.actualMs) <= 250);
    if (seams.has(name)) pass &&= checks === 1 && corrections === 0 &&
      samples.at(-1).index === samples[0].index + 1;
  }
  assertions.push({ name, pass, checks, corrections, samples: samples.length,
    maxPlayingDriftMs: Math.max(0, ...stable.map(e => Math.abs(e.expectedMs - e.actualMs))),
    rejected: scenario.rejected, errors: [...new Set(errors.map(e => e.error))] });
}
const source = 'android/app/src/main/java/com/starlightplayer/VideoProgramPlayerModule.kt';
writeFileSync(resolve(out, 'identity.json'), JSON.stringify({
  runId, device, nativeSHA256: createHash('sha256').update(readFileSync(source)).digest('hex'),
  apkSHA256: createHash('sha256').update(readFileSync(apk)).digest('hex'),
  mediaRevision: JSON.parse(readFileSync('media/video/manifest.json')).revision,
  api: run(['shell', 'getprop', 'ro.build.version.sdk']).trim(),
}, null, 2));
writeFileSync(resolve(out, 'analysis.json'), JSON.stringify(assertions, null, 2));
console.log(JSON.stringify(assertions, null, 2));
if (assertions.length !== 14 || assertions.some(a => !a.pass)) process.exitCode = 1;
