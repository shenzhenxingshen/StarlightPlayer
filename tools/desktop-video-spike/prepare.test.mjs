import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { files, hash, definitionFromAssets, makeEDL } from './prepare.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const build = resolve(root, 'release/desktop-video-spike');
const evidence = JSON.parse(readFileSync(resolve(build, 'build-evidence.json'), 'utf8'));
const { compileProgram, locateTicks } = createRequire(import.meta.url)(resolve(build, 'core/index.js'));

test('test uses the current shared source, not an old desktop build', () => {
  assert.equal(hash(resolve(root, 'packages/program-core/src/index.ts')),
    evidence.inputs['packages/program-core/src/index.ts']);
});

test('four validated assets produce exactly the reviewed shared timeline', () => {
  const input = evidence.materialInput.directory;
  const bundledMedia = resolve(build, 'StarlightVideoPrototype.app/Contents/Resources/media');
  assert.equal(hash(resolve(input, 'manifest.json')), evidence.materialInput.manifestSHA256);
  assert.equal(hash(resolve(bundledMedia, 'manifest.json')), evidence.materialInput.manifestSHA256);
  for (const file of files) {
    assert.equal(hash(resolve(input, file)), evidence.media[file]);
    assert.equal(hash(resolve(bundledMedia, file)), evidence.media[file]);
  }
  const definition = definitionFromAssets(input);
  assert.deepEqual(definitionFromAssets(bundledMedia), definition);
  assert.deepEqual(definition, evidence.definition);
  const timeline = compileProgram(definition);
  assert.deepEqual(timeline, evidence.timeline);
  assert.equal(timeline.spans.length, 51);
  assert.equal(timeline.totalCycles, 49);
  assert.equal(timeline.totalTicks, 164818149);
  assert.equal(timeline.timescale, 44100);
  for (const span of timeline.spans.slice(0, -1)) {
    assert.equal(locateTicks(timeline, span.endTicks - 1).span.index, span.index);
    assert.equal(locateTicks(timeline, span.endTicks).span.index, span.index + 1);
  }
  assert.equal(locateTicks(timeline, timeline.totalTicks).status, 'ended');
});

test('EDL has 51 explicit bounded entries using only four relative assets', () => {
  const edl = makeEDL(evidence.timeline);
  const lines = edl.trim().split('\n');
  assert.equal(lines.shift(), '# mpv EDL v0');
  assert.equal(lines.length, 51);
  const counts = new Map();
  let total = 0;
  lines.forEach((line, i) => {
    const match = line.match(/^%(\d+)%(media\/[^,]+),0,(\d+\.\d{12})$/);
    assert.ok(match, line);
    const [, bytes, path, seconds] = match;
    assert.equal(Number(bytes), Buffer.byteLength(path));
    assert.equal(path, `media/${evidence.timeline.spans[i].asset}`);
    assert.ok(files.includes(path.slice(6)));
    counts.set(path.slice(6), (counts.get(path.slice(6)) ?? 0) + 1);
    total += Number(seconds);
  });
  assert.deepEqual([...counts.values()], [1, 48, 1, 1]);
  assert.ok(Math.abs(total - 164818149 / 44100) < 1e-8);
  assert.equal(readFileSync(resolve(build,
    'StarlightVideoPrototype.app/Contents/Resources/program.edl'), 'utf8'), edl);
});

test('untrusted external paths, separators and invalid lengths are rejected', () => {
  for (const asset of ['../01_intro.mp4', '/tmp/file.mp4', 'https://example.org/a', 'a,b', 'a\nb']) {
    const timeline = structuredClone(evidence.timeline);
    timeline.spans[0].asset = asset;
    assert.throws(() => makeEDL(timeline), /Unknown bundled asset/);
  }
  for (const length of [0, -1, NaN, Infinity]) {
    const timeline = structuredClone(evidence.timeline);
    timeline.spans[0].endTicks = length;
    assert.throws(() => makeEDL(timeline), /Invalid EDL length/);
  }
});
