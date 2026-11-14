// Run on the native CI runner after packaging. Windows performs a per-user
// silent test installation only on CI; never installs into a developer's profile.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.env.CARGO_TARGET_DIR
  ? resolve(desktop, process.env.CARGO_TARGET_DIR)
  : join(desktop, 'src-tauri/target');
const scratch = await mkdtemp(join(tmpdir(), 'starlight-installer-'));
const run = (exe, args, options = {}) =>
  execFileSync(exe, args, { stdio: 'inherit', timeout: 600_000, ...options });
const ext = process.platform === 'darwin' ? '.dmg' : process.platform === 'win32' ? '.exe' : '.AppImage';
async function findFiles(path, predicate) {
  const found = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) found.push(...await findFiles(child, predicate));
    else if (entry.isFile() && predicate(child)) found.push(child);
    // Never follow symlinks, including the DMG's /Applications shortcut.
  }
  return found;
}
const installers = await findFiles(join(target, 'release/bundle'), p => p.endsWith(ext));
assert.equal(installers.length, 1, 'Expected one native installer');
const installer = installers[0];
let mounted = false;
try {
  if (process.platform === 'darwin') {
    run('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', scratch, installer]);
    mounted = true;
  } else if (process.platform === 'win32') {
    assert.equal(process.env.CI, 'true', 'Silent installation is restricted to disposable CI runners');
    // /D must be the last NSIS argument. This only modifies the disposable runner.
    run(installer, ['/S', `/D=${scratch}`]);
  } else {
    run(installer, ['--appimage-extract'], { cwd: scratch, stdio: 'pipe' });
  }
  const manifests = await findFiles(scratch, p => p.endsWith(join('runtime', 'manifest.json')));
  assert.equal(manifests.length, 1, 'Missing or duplicated installed resources');
  const resources = dirname(dirname(manifests[0]));
  run(process.execPath, [join(desktop, 'scripts/verify-runtime.mjs'), resources]);
  const smoke = join(target, 'debug/examples', process.platform === 'win32' ? 'bundle_smoke.exe' : 'bundle_smoke');
  assert((await stat(smoke)).isFile());
  const env = { ...process.env };
  for (const key of ['STARLIGHT_LIBMPV', 'LD_LIBRARY_PATH', 'DYLD_LIBRARY_PATH', 'DYLD_FALLBACK_LIBRARY_PATH'])
    delete env[key];
  // Prevent MSYS/Homebrew from supplying a missing transitive playback DLL.
  env.PATH = process.platform === 'win32'
    ? `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`
    : '/usr/bin:/bin:/usr/sbin:/sbin';
  run(smoke, [resources], { env, cwd: scratch });
  console.log(`PASS installer extraction/installation and bundled playback: ${installer}`);
} finally {
  if (mounted) run('hdiutil', ['detach', scratch]);
}
