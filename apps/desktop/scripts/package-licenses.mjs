import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// Debian's copyright file contains the package copyright/license inventory.
// Do not recursively copy documentation: minimal runners may retain dangling
// NEWS/changelog links after optional documentation packages are removed.
export async function copyDebianCopyright(docRoot, destination) {
  await mkdir(destination, { recursive: true });
  // Follow a valid copyright symlink, but fail closed if copyright is absent.
  await copyFile(join(docRoot, 'copyright'), join(destination, 'copyright'));
}
