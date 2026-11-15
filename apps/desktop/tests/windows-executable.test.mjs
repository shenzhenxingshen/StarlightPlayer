import test from 'node:test';
import assert from 'node:assert/strict';
import { assertWindowsGui, windowsSubsystem } from '../scripts/windows-executable.mjs';

function executable(magic = 0x20b, subsystem = 2) {
  const bytes = Buffer.alloc(512);
  bytes.write('MZ');
  bytes.writeUInt32LE(128, 0x3c);
  bytes.writeUInt32LE(0x00004550, 128);
  bytes.writeUInt16LE(240, 128 + 20);
  bytes.writeUInt16LE(magic, 128 + 24);
  bytes.writeUInt16LE(subsystem, 128 + 24 + 68);
  return bytes;
}

test('accepts Windows GUI executables in both PE formats', () => {
  for (const magic of [0x10b, 0x20b]) {
    assert.equal(windowsSubsystem(executable(magic)), 2);
    assert.doesNotThrow(() => assertWindowsGui(executable(magic)));
  }
});

test('rejects console and non-GUI applications (the original release regression)', () => {
  for (const magic of [0x10b, 0x20b]) {
    for (const subsystem of [0, 1, 3, 9]) {
      assert.equal(windowsSubsystem(executable(magic, subsystem)), subsystem);
      assert.throws(() => assertWindowsGui(executable(magic, subsystem)), /must use/);
    }
  }
});

test('rejects missing signatures, invalid offsets and truncated PE headers', () => {
  assert.throws(() => windowsSubsystem('not a buffer'));
  for (const length of [0, 1, 63, 64, 127, 151, 152, 221, 391])
    assert.throws(() => windowsSubsystem(executable().subarray(0, length)));
  for (const [offset, value, size] of [
    [0, 0, 2], [128, 0, 4], [0x3c, 0, 4], [0x3c, 0xffffffff, 4],
    [148, 69, 2], [148, 0xffff, 2], [152, 0, 2],
  ]) {
    const bytes = executable();
    bytes.writeUIntLE(value, offset, size);
    assert.throws(() => windowsSubsystem(bytes));
  }
});
