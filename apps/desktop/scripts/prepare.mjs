// Build-time only. Mobile's catalog remains the source of truth during the pilot.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(desktop, '../..');
const output = resolve(desktop, 'generated');
await mkdir(output, { recursive: true });
const built = await build({
  entryPoints: [resolve(repo, 'src/constants/tracks.ts')],
  bundle: true,
  platform: 'neutral',
  format: 'iife',
  globalName: 'Catalog',
  write: false,
});
const context = vm.createContext({});
vm.runInContext(built.outputFiles[0].text, context, { timeout: 1000 });
const tracks = JSON.parse(JSON.stringify(context.Catalog.TRACKS));
if (tracks.length !== 21 || new Set(tracks.map(t => t.id)).size !== 21)
  throw new Error('Unexpected catalog');
for (const track of tracks) {
  if (
    basename(track.audioUrl) !== track.audioUrl ||
    !Number.isSafeInteger(track.durationMs) ||
    track.durationMs <= 0
  )
    throw new Error('Invalid asset');
  const bytes = await readFile(resolve(repo, 'ios/StarlightPlayer/audio', track.audioUrl));
  track.sha256 = createHash('sha256').update(bytes).digest('hex');
  track.bytes = bytes.length;
}
await writeFile(resolve(output, 'catalog.json'), JSON.stringify(tracks, null, 2) + '\n');
await build({
  entryPoints: [resolve(repo, 'packages/playback-core/src/index.ts')],
  bundle: true,
  platform: 'neutral',
  target: 'es2020',
  format: 'iife',
  globalName: 'PlaybackCore',
  outfile: resolve(output, 'playback-core.js'),
});
// Tauri's macOS bundler needs a multi-size ICNS, not a lone 1024px PNG.
// Generate derivatives in ignored desktop output; never change the mobile icon.
// Desktop surfaces (especially the tray) do not apply iOS's automatic corner mask.
const logo = await readFile(resolve(repo, 'src/assets/images/starlight-logo.png'));
const desktopIcon = resolve(output, 'desktop-icon.svg');
await writeFile(
  desktopIcon,
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs><clipPath id="rounded"><rect width="1024" height="1024" rx="224" ry="224"/></clipPath></defs>
  <image width="1024" height="1024" clip-path="url(#rounded)" xlink:href="data:image/png;base64,${logo.toString('base64')}"/>
</svg>\n`,
);
execFileSync(
  process.execPath,
  [
    resolve(desktop, 'node_modules/@tauri-apps/cli/tauri.js'),
    'icon',
    desktopIcon,
    '--output',
    resolve(output, 'icons'),
  ],
  { stdio: 'pipe' },
);
console.log(
  `Prepared shared runtime and verified ${tracks.length} source assets (no audio modified).`,
);
