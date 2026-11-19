import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrRect, qrTreatment } from './qr-treatment.mjs';

const catalog = JSON.parse(readFileSync(new URL('../../media/video/manifest.json', import.meta.url)));
test('only the reviewed regular/final sources are edited', () => {
  for (const entry of catalog.assets)
    assert.equal(!!qrTreatment(entry), ['regular', 'final'].includes(entry.id));
});
test('a different source/geometry fails closed instead of reusing the mask', () => {
  const regular = catalog.assets.find(a => a.id === 'regular');
  assert.throws(() => qrTreatment({ ...regular, sourceSHA256: 'different' }));
  assert.throws(() => qrTreatment({ ...regular, width: 1920 }));
});
test('mask includes quiet zone and stays above subtitles and inside the canvas', () => {
  const { x, y, w, h } = qrRect;
  assert.ok(x < 688 && y < 285 && x + w > 802 && y + h > 398);
  assert.ok(y + h + 1 < 408);
  assert.ok(x > 0 && y > 0 && x + w < 856 && y + h < 482);
});
