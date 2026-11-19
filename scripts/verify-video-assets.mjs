import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(process.argv[2] || resolve(root, 'media/video'));
const manifest = JSON.parse(readFileSync(resolve(root, 'media/video/manifest.json'), 'utf8'));
for (const asset of manifest.assets) {
  const path = resolve(directory, asset.file);
  if (
    statSync(path).size !== asset.bytes ||
    createHash('sha256').update(readFileSync(path)).digest('hex') !== asset.sha256
  ) {
    throw new Error(`Video asset changed or incomplete: ${asset.file}`);
  }
  console.log(`Verified ${asset.file}: ${asset.durationTicks}/${manifest.timescale}s`);
}
