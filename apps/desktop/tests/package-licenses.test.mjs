import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyDebianCopyright } from '../scripts/package-licenses.mjs';

test('Debian license collection ignores broken optional documentation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'starlight-license-test-'));
  try {
    const docs = join(root, 'docs');
    await mkdir(docs);
    await writeFile(join(docs, 'copyright'), 'Package license and copyright');
    // Windows packaging never uses Debian docs, and symlinks need privileges.
    if (process.platform !== 'win32')
      await symlink('removed-optional-docs', join(docs, 'NEWS.gz'));
    const out = join(root, 'licenses');
    await copyDebianCopyright(docs, out);
    assert.equal(await readFile(join(out, 'copyright'), 'utf8'), 'Package license and copyright');
    await assert.rejects(copyDebianCopyright(join(root, 'missing'), join(root, 'invalid')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
