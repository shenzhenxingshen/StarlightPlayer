// Inspect installed/extracted resources, not the staging directory.
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const resources = resolve(process.argv[2] || '');
assert(process.argv[2], 'Pass the installed resource directory');
const root = join(resources, 'runtime');
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.tracks.length, 21);
assert.equal(new Set(manifest.tracks.map(t => t.id)).size, 21);
assert.equal(manifest.platform, process.platform);
assert.equal(manifest.arch, process.arch);
assert(manifest.libraries.length > 0);
for (const [directory, entries, field] of [
  ['audio', manifest.tracks, 'audioUrl'],
  ['lib', manifest.libraries, 'name'],
]) {
  for (const entry of entries) {
    const name = entry[field];
    assert.equal(name, basename(name), 'Manifest path must be a filename');
    const bytes = await readFile(join(root, directory, name));
    assert.equal(bytes.length, entry.bytes, `${name}: size mismatch`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256,
      `${name}: SHA-256 mismatch`);
  }
}
assert((await stat(join(root, 'THIRD_PARTY.md'))).size > 0);
assert((await readdir(join(root, 'licenses'))).length > 0);
console.log(`PASS extracted runtime: ${manifest.tracks.length} audio files, ` +
  `${manifest.libraries.length} native libraries; all hashes match (${manifest.commit}).`);
