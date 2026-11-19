import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// Native API test, NOT UI automation or an end-to-end test of the RN bridge.
// It imports exactly the production VideoProgramPlayer.mm with registration-only stubs.
const device = process.argv[2];
if (!device) throw new Error('Usage: node tools/video-native-validation/run.mjs <booted-iOS-UDID>');
const out = resolve('release/video-native-validation');
const app = resolve(out, 'VideoNativeValidation.app');
const root = resolve('tools/video-native-validation');
const id = 'org.starlight.video-native-validation';
mkdirSync(app, { recursive: true });
cpSync('media/video', resolve(app, 'video'), { recursive: true });
const run = (bin, args) => execFileSync(bin, args, { encoding: 'utf8' });
const sdk = run('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path']).trim();
const deviceSDK = run('xcrun', ['--sdk', 'iphoneos', '--show-sdk-path']).trim();
writeFileSync(resolve(app, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${id}</string>
<key>CFBundleExecutable</key><string>VideoNativeValidation</string>
<key>CFBundleName</key><string>Video Native Validation</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>MinimumOSVersion</key><string>15.0</string>
<key>UIDeviceFamily</key><array><integer>1</integer><integer>2</integer></array>
<key>UILaunchScreen</key><dict/>
</dict></plist>`);
const args = ['-fobjc-arc', '-fblocks', '-std=c++17', '-I', root,
  resolve(root, 'Probe.mm'), '-framework', 'UIKit', '-framework', 'AVFoundation',
  '-framework', 'Foundation', '-framework', 'QuartzCore', '-framework', 'CoreMedia'];
run('xcrun', ['clang++', ...args, '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-ios15.0-simulator`,
  '-isysroot', sdk, '-o', resolve(app, 'VideoNativeValidation')]);
// Availability check does not change the production deployment target, and does
// not pretend a recent simulator is an old iPhone. No device signing/install.
run('xcrun', ['clang++', ...args, '-target', 'arm64-apple-ios13.4',
  '-isysroot', deviceSDK, '-Werror=unguarded-availability-new',
  '-o', resolve(out, 'VideoNativeValidation-device')]);
run('codesign', ['--force', '--sign', '-', app]);
const source = 'ios/StarlightPlayer/VideoProgramPlayer.mm';
writeFileSync(resolve(out, 'identity.json'), JSON.stringify({
  date: new Date().toISOString(), device,
  nativeSource: source,
  nativeSHA256: createHash('sha256').update(readFileSync(source)).digest('hex'),
  mediaRevision: JSON.parse(readFileSync('media/video/manifest.json')).revision,
  deviceBuildVersion: run('xcrun', ['vtool', '-show-build', resolve(out, 'VideoNativeValidation-device')]),
  simulatorBuildVersion: run('xcrun', ['vtool', '-show-build', resolve(app, 'VideoNativeValidation')]),
}, null, 2));
run('xcrun', ['simctl', 'install', device, app]);
run('xcrun', ['simctl', 'launch', '--terminate-running-process', device, id]);
const container = run('xcrun', ['simctl', 'get_app_container', device, id, 'data']).trim();
const complete = resolve(container, 'Documents/complete.txt');
const deadline = Date.now() + 180_000;
// Do not accept a prior run's completion file.
const launched = Date.now();
let events;
while (Date.now() < deadline) {
  if (existsSync(complete)) {
    const candidate = JSON.parse(readFileSync(resolve(container, 'Documents/events.json')));
    if (candidate[0]?.wallMs >= launched - 5000) { events = candidate; break; }
  }
  await new Promise(r => setTimeout(r, 1000));
}
if (!events) throw new Error('Native test did not finish within 180s');
writeFileSync(resolve(out, 'events.json'), JSON.stringify(events, null, 2));
const names = [...new Set(events.filter(e => e.event === 'load').map(e => e.scenario))];
const assertions = [];
for (const name of names) {
  const rows = events.filter(e => e.scenario === name);
  const rejected = rows.find(e => e.event === 'rejected' || e.event === 'failure');
  if (name === 'already-ended') {
    assertions.push({ name, pass: rejected?.code === 'video_window' });
    continue;
  }
  const ready = rows.find(e => e.event === 'ready');
  const samples = rows.filter(e => e.event === 'sample' && e.wallMs - (ready?.wallMs || 0) >= 600);
  const stable = samples.filter(e => e.rate > 0);
  const maxDriftMs = Math.max(0, ...stable.map(e => Math.abs(e.expected - e.actual) * 1000));
  assertions.push({ name, pass: !rejected && stable.length >= 5 && maxDriftMs <= 250,
    samples: samples.length, playingSamples: stable.length, maxDriftMs, rejected });
  if (['intro-salutation', 'salutation-regular', 'regular-repeat', 'regular-final', 'final-outro'].includes(name)) {
    const config = rows.find(e => e.event === 'load').config;
    const all = rows.filter(e => e.event === 'sample');
    let end = 0;
    const boundaries = config.spans.map(s => (end += s.durationTicks / config.timescale)).slice(0, -1);
    const crossed = boundaries.filter(t => all[0]?.actual < t && all.at(-1)?.actual >= t);
    const discontinuities = all.slice(1).filter((e, i) =>
      e.wallMs - all[i].wallMs > 500 || e.actual < all[i].actual - 0.01 ||
      Math.abs((e.actual - all[i].actual) - (e.wallMs - all[i].wallMs) / 1000) > 0.25);
    assertions.push({ name: `${name}-crossed`, pass: crossed.length === 1 && discontinuities.length === 0,
      crossed, discontinuities: discontinuities.length });
  }
  if (name === 'end-no-wrap') {
    assertions.push({ name: 'end-stopped', pass: samples.at(-1)?.rate === 0 && samples.at(-1)?.actual >= 4.9 });
  }
}
const paused = events.filter(e => e.event === 'sample' && e.scenario === 'paused-hold');
assertions.push({ name: 'pause-holds-media-not-clock', pass: paused.length >= 5 &&
  paused.every(e => e.rate === 0) && Math.abs(paused.at(-1).actual - paused[0].actual) < 0.01 &&
  paused.at(-1).expected - paused[0].expected >= 0.9 });
const resumed = events.filter(e => e.event === 'sample' && e.scenario === 'resumed').slice(6);
assertions.push({ name: 'resume-catches-current-time', pass: resumed.length >= 5 &&
  resumed.every(e => e.rate > 0 && Math.abs(e.actual - e.expected) <= 0.25) });
writeFileSync(resolve(out, 'analysis.json'), JSON.stringify(assertions, null, 2));
console.log(JSON.stringify(assertions, null, 2));
if (assertions.some(a => !a.pass)) process.exitCode = 1;
