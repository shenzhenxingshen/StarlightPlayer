import test from 'node:test';
import assert from 'node:assert/strict';
import { maxVersion, minimumMacOSFromLoadCommands } from '../scripts/macos-version.mjs';

test('macOS deployment versions compare numerically, including patch releases', () => {
  assert.equal(maxVersion(['10.9', '10.13', '15.0', '14.9']), '15.0');
  assert.equal(maxVersion(['15.0', '15.0.1']), '15.0.1');
  assert.equal(maxVersion(['15.0.0', '15.0']), '15.0.0');
  assert.throws(() => maxVersion([]));
  assert.throws(() => maxVersion(['unknown']));
});

test('Mach-O version parsing supports modern, legacy and multi-architecture commands', () => {
  const modern = 'cmd LC_BUILD_VERSION\n cmdsize 32\n platform MACOS\n minos 15.0\n sdk 15.5';
  const legacy = 'cmd LC_VERSION_MIN_MACOSX\n cmdsize 16\n version 11.0\n sdk 12.0';
  assert.equal(minimumMacOSFromLoadCommands(modern), '15.0');
  assert.equal(minimumMacOSFromLoadCommands(modern.replace('MACOS', '1')), '15.0');
  assert.equal(minimumMacOSFromLoadCommands(legacy), '11.0');
  assert.equal(minimumMacOSFromLoadCommands(`${modern}\n${legacy}`), '15.0');
  assert.throws(() => minimumMacOSFromLoadCommands(modern.replace('MACOS', 'IOS')));
  assert.throws(() => minimumMacOSFromLoadCommands('cmd LC_ID_DYLIB'));
});
