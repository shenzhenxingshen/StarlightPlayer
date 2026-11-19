import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(root, 'release/video-program-spike');
const input = resolve(process.argv[2] || resolve(root, 'release/video/49-2025V1'));
const manifest = JSON.parse(readFileSync(resolve(input, 'manifest.json'), 'utf8'));
const app = resolve(out, 'VideoProgramSpike.app');
mkdirSync(resolve(out, 'core'), { recursive: true });
mkdirSync(resolve(app, 'media'), { recursive: true });
const run = (bin, args) => execFileSync(bin, args, { cwd: root, stdio: 'inherit' });
run(process.execPath, ['node_modules/typescript/bin/tsc', 'packages/program-core/src/index.ts',
  '--strict', '--target', 'ES2019', '--module', 'commonjs', '--skipLibCheck',
  '--outDir', resolve(out, 'core'), '--types', 'node']);
run(process.execPath, ['--test', 'tools/video-program-spike/core.test.cjs']);
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const roles = ['intro', 'regular', 'final', 'outro'];
const segments = manifest.program.sequence.map((item, index) => {
  const source = resolve(input, item.file);
  const clip = manifest.clips.find(c => c.file === item.file);
  if (hash(source) !== clip.sha256) throw new Error(`Asset hash mismatch: ${item.file}`);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', source]));
  const audio = probe.streams.find(s => s.codec_type === 'audio');
  if (audio.time_base !== '1/44100') throw new Error('This spike expects 44100 Hz asset ticks');
  copyFileSync(source, resolve(app, 'media', item.file));
  return { asset: item.file, role: roles[index], durationTicks: audio.duration_ts, repeat: item.repeat };
});
const source = manifest.source.path;
if (!existsSync(source) || hash(source) !== manifest.source.sha256) throw new Error('Original source missing or changed');
copyFileSync(source, resolve(app, 'media/original.mp4'));
const definition = {
  id: '49-2025V1', revision: manifest.clips.map(c => c.sha256.slice(0, 12)).join('-'),
  timescale: 44100, segments,
};
writeFileSync(resolve(app, 'program.json'), JSON.stringify(definition, null, 2));
// Same compiled TypeScript executes in Node tests and iOS JavaScriptCore.
writeFileSync(resolve(app, 'program-core.js'), 'var exports = {};\n' +
  readFileSync(resolve(out, 'core/index.js'), 'utf8') + '\nvar ProgramCore = exports;\n');
copyFileSync(resolve(root, 'tools/video-program-spike/Info.plist'), resolve(app, 'Info.plist'));
const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' }).trim();
const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
const sources = ['Probe.swift', 'AudioTap.c', 'AudioTap.h'].map(s => resolve(root, 'tools/video-program-spike', s));
run('xcrun', ['clang', '-target', `${arch}-apple-ios13.4-simulator`, '-isysroot', sdk,
  '-std=c11', '-O2', '-Wall', '-Wextra', '-c', sources[1], '-o', resolve(out, 'AudioTap.o')]);
run('xcrun', ['swiftc', '-parse-as-library', '-swift-version', '5', '-target', `${arch}-apple-ios13.4-simulator`, '-sdk', sdk,
  '-O', '-import-objc-header', sources[2], sources[0], resolve(out, 'AudioTap.o'),
  '-framework', 'UIKit', '-framework', 'AVFoundation', '-framework', 'JavaScriptCore',
  '-framework', 'MediaToolbox', '-framework', 'AudioToolbox', '-o', resolve(app, 'VideoProgramSpike')]);
run('codesign', ['--force', '--sign', '-', app]);
// Apple Silicon simulator slices have an iOS 14 floor. Separately compile/link
// a device slice to verify API availability for production's iOS 13.4 minimum.
// No signing, provisioning or physical-device installation is performed here.
const deviceSDK = execFileSync('xcrun', ['--sdk', 'iphoneos', '--show-sdk-path'], { encoding: 'utf8' }).trim();
run('xcrun', ['clang', '-target', 'arm64-apple-ios13.4', '-isysroot', deviceSDK,
  '-std=c11', '-O2', '-Wall', '-Wextra', '-c', sources[1], '-o', resolve(out, 'AudioTap-device.o')]);
run('xcrun', ['swiftc', '-parse-as-library', '-swift-version', '5', '-target', 'arm64-apple-ios13.4', '-sdk', deviceSDK,
  '-O', '-import-objc-header', sources[2], sources[0], resolve(out, 'AudioTap-device.o'),
  '-framework', 'UIKit', '-framework', 'AVFoundation', '-framework', 'JavaScriptCore',
  '-framework', 'MediaToolbox', '-framework', 'AudioToolbox', '-o', resolve(out, 'VideoProgramSpike-device')]);
const buildVersion = binary => execFileSync('xcrun', ['vtool', '-show-build', binary], { encoding: 'utf8' }).trim();
writeFileSync(resolve(out, 'build-evidence.json'), JSON.stringify({
  builtAt: new Date().toISOString(),
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  productionIntegration: false, requestedMinimumIOS: '13.4', definition,
  simulatorBuildVersion: buildVersion(resolve(app, 'VideoProgramSpike')),
  deviceBuildVersion: buildVersion(resolve(out, 'VideoProgramSpike-device')),
  oldIOSRuntimeTested: false,
  originalSHA256: manifest.source.sha256,
  inputs: Object.fromEntries([...sources, resolve(root, 'packages/program-core/src/index.ts'),
    resolve(root, 'tools/video-program-spike/build.mjs'), resolve(root, 'tools/video-program-spike/Info.plist'),
    resolve(app, 'program-core.js')].map(p => [p.replace(root + '/', ''), hash(p)])),
  executableSHA256: hash(resolve(app, 'VideoProgramSpike')),
}, null, 2));
console.log(`Built isolated simulator app: ${app}`);
