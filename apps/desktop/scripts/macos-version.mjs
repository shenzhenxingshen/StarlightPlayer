// Match the application's deployment declaration to every bundled Mach-O library.
export function maxVersion(versions) {
  if (!versions.length || versions.some(v => !/^\d+\.\d+(?:\.\d+)?$/.test(v)))
    throw Error('Invalid macOS deployment version');
  return versions.reduce((highest, version) => {
    const a = highest.split('.').map(Number);
    const b = version.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((b[i] ?? 0) > (a[i] ?? 0)) return version;
      if ((b[i] ?? 0) < (a[i] ?? 0)) return highest;
    }
    return highest;
  });
}

export function minimumMacOSFromLoadCommands(output) {
  const versions = [
    ...[...output.matchAll(/cmd LC_BUILD_VERSION\s+cmdsize \d+\s+platform (?:1|MACOS)\s+minos (\d+\.\d+(?:\.\d+)?)/g)].map(m => m[1]),
    ...[...output.matchAll(/cmd LC_VERSION_MIN_MACOSX\s+cmdsize \d+\s+version (\d+\.\d+(?:\.\d+)?)/g)].map(m => m[1]),
  ];
  if (!versions.length) throw Error('Missing macOS deployment load command');
  return maxVersion(versions);
}
