import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(desktop, 'installers');
await mkdir(output, { recursive: true });
const bundle = join(desktop, 'src-tauri/target/release/bundle');
const ext = process.platform === 'darwin' ? '.dmg' : process.platform === 'win32' ? '.exe' : '.AppImage';
const files = [];
async function scan(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) await scan(child);
    else if (entry.name.endsWith(ext)) files.push(child);
  }
}
await scan(bundle);
if (!files.length) throw Error(`No ${ext} installer found`);
const hashes = [];
for (const file of files) {
  const bytes = await readFile(file);
  const name = basename(file).replaceAll(' ', '_');
  await copyFile(file, join(output, name));
  hashes.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
}
await copyFile(join(desktop, 'generated/runtime/manifest.json'), join(output, 'runtime-manifest.json'));
await copyFile(join(desktop, 'THIRD_PARTY.md'), join(output, 'THIRD_PARTY.md'));
await writeFile(join(output, 'SHA256SUMS.txt'), hashes.join('\n') + '\n');
console.log(hashes.join('\n'));
