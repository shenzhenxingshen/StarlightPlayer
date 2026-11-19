import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { files, hash, definitionFromAssets, makeEDL } from './prepare.mjs';

if (process.platform !== 'darwin') throw new Error('The current window adapter is macOS only');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const tool = resolve(root, 'tools/desktop-video-spike');
const out = resolve(root, 'release/desktop-video-spike');
const app = resolve(out, 'StarlightVideoPrototype.app');
const resources = resolve(app, 'Contents/Resources');
const macos = resolve(app, 'Contents/MacOS');
// An explicit material revision can be tested without replacing the original extracts.
const input = resolve(process.argv[2] || resolve(root, 'release/video/49-2025V1'));
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });
mkdirSync(resolve(resources, 'media'), { recursive: true });
mkdirSync(resolve(out, 'core'), { recursive: true });
mkdirSync(macos, { recursive: true });
run(process.execPath, ['node_modules/typescript/bin/tsc', 'packages/program-core/src/index.ts',
  '--strict', '--target', 'ES2019', '--module', 'commonjs', '--skipLibCheck',
  '--outDir', resolve(out, 'core'), '--types', 'node']);
const { compileProgram } = createRequire(import.meta.url)(resolve(out, 'core/index.js'));
const definition = definitionFromAssets(input);
const timeline = compileProgram(definition);
writeFileSync(resolve(resources, 'program.json'), JSON.stringify(definition, null, 2));
writeFileSync(resolve(resources, 'program.edl'), makeEDL(timeline));
writeFileSync(resolve(resources, 'program-core.js'), 'var exports = {};\n' +
  readFileSync(resolve(out, 'core/index.js'), 'utf8') + '\nvar ProgramCore = exports;\n');
for (const file of files) copyFileSync(resolve(input, file), resolve(resources, 'media', file));
copyFileSync(resolve(input, 'manifest.json'), resolve(resources, 'media/manifest.json'));
copyFileSync(resolve(tool, 'Info.plist'), resolve(app, 'Contents/Info.plist'));
const prefix = execFileSync('brew', ['--prefix'], { encoding: 'utf8' }).trim();
run('xcrun', ['clang', '-std=c11', '-O2', '-Wall', '-Wextra', '-Werror',
  '-I', `${prefix}/include`, '-c', resolve(tool, 'Engine.c'), '-o', resolve(out, 'Engine.o')]);
run('xcrun', ['swiftc', '-parse-as-library', '-swift-version', '5', '-O',
  '-import-objc-header', resolve(tool, 'Engine.h'), resolve(tool, 'Preview.swift'), resolve(out, 'Engine.o'),
  '-L', `${prefix}/lib`, '-lmpv', '-framework', 'AppKit', '-framework', 'JavaScriptCore',
  '-o', resolve(macos, 'StarlightVideoPrototype')]);
run('codesign', ['--force', '--sign', '-', app]);
writeFileSync(resolve(out, 'build-evidence.json'), JSON.stringify({
  builtAt: new Date().toISOString(), definition, timeline,
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  platform: process.platform, arch: process.arch, productionIntegration: false,
  materialInput: { directory: input, manifestSHA256: hash(resolve(input, 'manifest.json')) },
  inputs: Object.fromEntries(['Engine.c', 'Engine.h', 'Preview.swift', 'prepare.mjs', 'build.mjs', 'Info.plist']
    .map(f => [`tools/desktop-video-spike/${f}`, hash(resolve(tool, f))])
    .concat([['packages/program-core/src/index.ts', hash(resolve(root, 'packages/program-core/src/index.ts'))]])),
  media: Object.fromEntries(files.map(f => [f, hash(resolve(resources, 'media', f))])),
  executableSHA256: hash(resolve(macos, 'StarlightVideoPrototype')),
  nativeDependencies: execFileSync('otool', ['-L', resolve(macos, 'StarlightVideoPrototype')], { encoding: 'utf8' }),
}, null, 2));
console.log(`Built local macOS prototype: ${app}`);
