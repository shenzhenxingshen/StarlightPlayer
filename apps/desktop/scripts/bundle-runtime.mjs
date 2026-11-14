// Stage a self-contained, host-platform runtime. Never modifies mobile assets.
// Run prepare:runtime first. Only generated/runtime is replaced.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, cp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(desktop, '../..');
const generated = join(desktop, 'generated');
const runtime = join(generated, 'runtime');
const lib = join(runtime, 'lib');
const licenses = join(runtime, 'licenses');
const run = (exe, args) => execFileSync(exe, args, { encoding: 'utf8' }).trim();
await rm(runtime, { recursive: true, force: true });
await mkdir(lib, { recursive: true });
await mkdir(licenses, { recursive: true });
await mkdir(join(runtime, 'audio'), { recursive: true });
const tracks = JSON.parse(await readFile(join(generated, 'catalog.json'), 'utf8'));
for (const track of tracks) {
  const source = join(repo, 'ios/StarlightPlayer/audio', track.audioUrl);
  if (createHash('sha256').update(await readFile(source)).digest('hex') !== track.sha256)
    throw Error(`Asset changed after catalog generation: ${track.id}`);
  await copyFile(source, join(runtime, 'audio', track.audioUrl));
}

const origins = {};
const sourceByName = new Map();
const queue = [];
async function add(source, name = basename(source)) {
  source = await realpath(source);
  const prior = sourceByName.get(name);
  if (prior) {
    if (prior !== source) throw Error(`Library name collision: ${name}`);
    return;
  }
  sourceByName.set(name, source);
  await copyFile(source, join(lib, name));
  queue.push({ source, name });
}
if (process.platform === 'darwin') {
  const prefix = run('brew', ['--prefix']);
  await add(process.env.STARLIGHT_LIBMPV || join(prefix, 'opt/mpv/lib/libmpv.2.dylib'), 'libmpv.2.dylib');
  const dependencies = source =>
    run('otool', ['-L', source]).split('\n').slice(1)
      .map(line => line.trim().split(' (compatibility')[0]).filter(Boolean);
  const system = path => path.startsWith('/System/') || path.startsWith('/usr/lib/');
  function resolveDependency(dep, source) {
    if (isAbsolute(dep)) return dep;
    if (dep.startsWith('@loader_path/')) return resolve(dirname(source), dep.slice(13));
    if (dep.startsWith('@rpath/')) {
      const load = run('otool', ['-l', source]);
      const paths = [...load.matchAll(/cmd LC_RPATH\s+cmdsize \d+\s+path (.+?) \(offset/g)];
      for (const [, path] of paths) {
        const candidate = join(path.replace('@loader_path', dirname(source)), dep.slice(7));
        try { run('test', ['-f', candidate]); return candidate; } catch { /* next rpath */ }
      }
    }
    throw Error(`Cannot resolve dependency ${dep} from ${basename(source)}`);
  }
  const packages = new Set();
  for (let index = 0; index < queue.length; index++) {
    const { source, name } = queue[index];
    const target = join(lib, name);
    const changes = [];
    for (const dep of dependencies(source)) {
      if (system(dep)) continue;
      const resolved = resolveDependency(dep, source);
      // The first otool entry of a dylib may be its own install name.
      if (await realpath(resolved) === source) continue;
      await add(resolved, basename(dep));
      changes.push('-change', dep, `@loader_path/${basename(dep)}`);
    }
    run('chmod', ['u+w', target]);
    run('install_name_tool', ['-id', `@loader_path/${name}`, ...changes, target]);
    run('codesign', ['--force', '--sign', '-', target]);
    for (const dep of dependencies(target))
      if (!system(dep) && !dep.startsWith('@loader_path/'))
        throw Error(`Unbundled dependency in ${name}: ${dep}`);
    const match = source.match(/\/Cellar\/([^/]+)\/([^/]+)\//);
    if (match) {
      const [, pkg, version] = match;
      origins[name] = { package: pkg, version, provider: 'Homebrew' };
      if (!packages.has(pkg)) {
        packages.add(pkg);
        const pkgRoot = join(prefix, 'Cellar', pkg, version);
        const dest = join(licenses, pkg);
        await mkdir(dest, { recursive: true });
        for (const entry of await readdir(pkgRoot))
          if (/license|copying|copyright|notice|sbom|install_receipt/i.test(entry))
            await cp(join(pkgRoot, entry), join(dest, entry), { recursive: true });
      }
    }
  }
} else if (process.platform === 'win32') {
  // MSYS2 binaries expose the same libmpv C ABI to an MSVC Rust host.
  const mingw = process.env.STARLIGHT_MINGW_ROOT || 'C:/msys64/ucrt64';
  for (const name of await readdir(join(mingw, 'bin')))
    if (/\.dll$/i.test(name)) await add(join(mingw, 'bin', name));
  if (!sourceByName.has('libmpv-2.dll')) {
    if (!sourceByName.has('mpv-2.dll')) throw Error('MSYS2 libmpv API 2 DLL is missing');
    await add(join(mingw, 'bin', 'mpv-2.dll'), 'libmpv-2.dll');
  }
  await cp(join(mingw, 'share/licenses'), licenses, { recursive: true });
  const bash = resolve(mingw, '../usr/bin/bash.exe');
  await writeFile(join(licenses, 'msys2-packages.txt'), run(bash, ['-lc', 'pacman -Q']));
  origins.provider = 'MSYS2 UCRT64; versions in licenses/msys2-packages.txt';
} else if (process.platform === 'linux') {
  const source = process.env.STARLIGHT_LIBMPV || '/usr/lib/x86_64-linux-gnu/libmpv.so.2';
  await add(source, 'libmpv.so.2');
  // glibc and the ELF loader must come from the supported host OS, not be replaced.
  const hostABI = /^(ld-linux.*|lib(c|m|pthread|dl|rt|resolv|util|anl)\.so\.)/;
  const packages = new Set();
  for (let index = 0; index < queue.length; index++) {
    const { source, name } = queue[index];
    const listing = run('ldd', [source]);
    if (listing.includes('not found')) throw Error(`Unresolved ELF dependency: ${name}\n${listing}`);
    for (const [, dep] of listing.matchAll(/=> (\/[^\s]+) /g))
      if (!hostABI.test(basename(dep))) await add(dep);
    run('chmod', ['u+w', join(lib, name)]);
    run('patchelf', ['--set-rpath', '$ORIGIN', join(lib, name)]);
    try {
      let pkg;
      for (const path of [source, source.replace(/^\/usr\/lib\//, '/lib/')]) {
        try { pkg = run('dpkg-query', ['-S', path]).split(': ')[0]; break; } catch { /* usrmerge */ }
      }
      if (!pkg) throw Error(`No package owner for ${name}`);
      origins[name] = { package: pkg, version: run('dpkg-query', ['-W', '-f=${Version}', pkg]) };
      if (!packages.has(pkg)) {
        packages.add(pkg);
        const clean = pkg.split(':')[0];
        await cp(`/usr/share/doc/${clean}`, join(licenses, clean), { recursive: true, dereference: true });
      }
    } catch (error) { throw Error(`License inventory failed for ${name}: ${error}`); }
  }
} else {
  throw Error('Unsupported bundle platform');
}
const libraries = [];
for (const name of await readdir(lib)) {
  const bytes = await readFile(join(lib, name));
  libraries.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(join(runtime, 'manifest.json'), JSON.stringify({
  platform: process.platform, arch: process.arch,
  commit: run('git', ['-C', repo, 'rev-parse', 'HEAD']),
  tracks: tracks.map(({ id, audioUrl, bytes, sha256 }) => ({ id, audioUrl, bytes, sha256 })),
  libraries, origins,
}, null, 2) + '\n');
await copyFile(join(desktop, 'THIRD_PARTY.md'), join(runtime, 'THIRD_PARTY.md'));
const config = {
  bundle: {
    active: true,
    resources: { '../generated/runtime/': 'runtime/' },
    ...(process.platform === 'win32' ? {
      windows: { webviewInstallMode: { type: 'offlineInstaller', silent: true } },
    } : {}),
    ...(process.platform === 'linux' ? {
      linux: { appimage: { bundleMediaFramework: true } },
    } : {}),
  },
};
await writeFile(join(generated, 'bundle.config.json'), JSON.stringify(config, null, 2) + '\n');
console.log(`Bundled ${tracks.length} verified audio files and ${libraries.length} native libraries (${process.platform}/${process.arch}).`);
