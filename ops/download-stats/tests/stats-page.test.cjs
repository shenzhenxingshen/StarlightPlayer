const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const html = fs.readFileSync(path.join(__dirname, '..', 'stats.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);

function fixture() {
  return {
    schema_version: 2,
    total_downloads: 1703, android_downloads: 1702, desktop_downloads: 1,
    last_updated: Math.floor(Date.now() / 1000),
    desktop_platforms: Object.fromEntries(
      ['macos-arm64', 'macos-x64', 'windows-x64', 'linux-x64']
        .map(key => [key, {downloads: key === 'windows-x64' ? 1 : 0}])),
  };
}
async function boot(response) {
  const elements = Object.fromEntries(ids.map(id => [id, {textContent: '-'}]));
  const context = vm.createContext({
    document: {getElementById(id) { assert.ok(elements[id], id); return elements[id]; }},
    window: {addEventListener() {}},
    fetch: async () => response,
    setInterval() {},
  });
  vm.runInContext(script, context);
  await new Promise(resolve => setImmediate(resolve));
  return {elements, context};
}
function success(data) { return {ok: true, json: async () => data}; }

test('renders totals, four platforms and thousands separators even without chart CDN', async () => {
  const {elements} = await boot(success(fixture()));
  assert.equal(elements.totalDownloads.textContent, '1,703');
  assert.equal(elements.androidDownloads.textContent, '1,702');
  assert.equal(elements.desktopDownloads.textContent, '1');
  assert.equal(elements['windows-x64'].textContent, '1');
  assert.equal(elements['macos-arm64'].textContent, '0');
  assert.match(elements.chartError.textContent, /数字仍然有效/);
});
test('HTTP failure is not presented as zero downloads', async () => {
  const {elements} = await boot({ok: false, status: 503});
  assert.equal(elements.totalDownloads.textContent, '-');
  assert.match(elements.dataError.textContent, /无法加载/);
});
test('bad schema, invalid counts and contradictory sums are rejected', async () => {
  for (const data of [
    {...fixture(), schema_version: 1}, {...fixture(), total_downloads: -1},
    {...fixture(), desktop_downloads: 4}, {...fixture(), total_downloads: 2},
    {...fixture(), desktop_platforms: {}}, {...fixture(), android_downloads: '1702'},
  ]) {
    const {elements} = await boot(success(data));
    assert.equal(elements.totalDownloads.textContent, '-');
    assert.match(elements.dataError.textContent, /无法加载/);
  }
});
test('failed refresh retains last known successful data', async () => {
  const {elements, context} = await boot(success(fixture()));
  context.fetch = async () => { throw new Error('offline'); };
  await vm.runInContext('refreshStats()', context);
  assert.equal(elements.totalDownloads.textContent, '1,703');
  assert.match(elements.dataError.textContent, /保留上次/);
});
test('old data shows staleness warning, later healthy refresh clears it', async () => {
  const data = fixture();
  data.last_updated -= 20 * 60;
  const {elements, context} = await boot(success(data));
  assert.match(elements.dataError.textContent, /超过 15 分钟/);
  context.fetch = async () => success(fixture());
  await vm.runInContext('refreshStats()', context);
  assert.equal(elements.dataError.textContent, '');
});
test('valid zero totals remain distinguishable from errors', async () => {
  const data = fixture();
  data.total_downloads = data.android_downloads = data.desktop_downloads = 0;
  Object.values(data.desktop_platforms).forEach(value => value.downloads = 0);
  const {elements} = await boot(success(data));
  assert.equal(elements.totalDownloads.textContent, '0');
  assert.equal(elements.dataError.textContent, '');
});
