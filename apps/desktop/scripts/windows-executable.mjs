// Inspect the installed application's PE header, not the NSIS installer stub.
import assert from 'node:assert/strict';

export function windowsSubsystem(bytes) {
  assert(Buffer.isBuffer(bytes), 'Expected executable bytes');
  assert(bytes.length >= 64, 'Truncated DOS header');
  assert.equal(bytes.toString('ascii', 0, 2), 'MZ', 'Missing DOS signature');
  const pe = bytes.readUInt32LE(0x3c);
  assert(pe >= 64 && pe <= bytes.length - 24, 'Invalid PE header offset');
  assert.equal(bytes.readUInt32LE(pe), 0x00004550, 'Missing PE signature');
  const optional = pe + 24;
  const size = bytes.readUInt16LE(pe + 20);
  assert(size >= 70 && size <= bytes.length - optional, 'Truncated optional header');
  const magic = bytes.readUInt16LE(optional);
  assert(magic === 0x10b || magic === 0x20b, 'Expected PE32 or PE32+');
  // Subsystem is at offset 68 in both PE32 and PE32+ optional headers.
  return bytes.readUInt16LE(optional + 68);
}

export function assertWindowsGui(bytes) {
  assert.equal(windowsSubsystem(bytes), 2,
    'Windows release app must use IMAGE_SUBSYSTEM_WINDOWS_GUI (2), not console (3)');
}
