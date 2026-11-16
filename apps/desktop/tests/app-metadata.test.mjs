import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const json = path => JSON.parse(read(path));

test('desktop app name and version agree across UI, npm, Cargo and Tauri', () => {
  const pkg = json('package.json');
  const lock = json('package-lock.json');
  const tauri = json('src-tauri/tauri.conf.json');
  assert.equal(pkg.version, '0.1.1');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(tauri.version, pkg.version);
  assert.equal(tauri.productName, '星光播放器');
  assert.equal(tauri.app.windows[0].title, tauri.productName);
  assert.ok(read('index.html').includes(`<title>${tauri.productName}</title>`));
  for (const path of ['src-tauri/Cargo.toml', 'src-tauri/Cargo.lock']) {
    assert.ok(read(path).includes(`name = "starlight-desktop"\nversion = "${pkg.version}"`));
  }
  const ui = read('src/main.tsx');
  assert.match(ui, /import \{ version as desktopVersion \} from '\.\.\/package\.json'/);
  assert.match(ui, /import \{ productName as appName \} from '\.\.\/src-tauri\/tauri\.conf\.json'/);
  assert.doesNotMatch(ui, /技术预览|电脑版|preview-badge/);
});

test('display rename preserves app identity, data path and executable name', () => {
  assert.equal(json('src-tauri/tauri.conf.json').identifier, 'org.starlightplayer.desktop.preview');
  assert.match(read('src-tauri/Cargo.toml'), /name = "starlight-desktop"/);
  assert.match(read('src-tauri/src/host.rs'), /desktop-v1\.json/);
});
