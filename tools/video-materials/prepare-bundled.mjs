// Offline authoring tool, not a runtime/download dependency. Original files are never modified.
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
if (!process.argv[2] || !process.argv[3])
  throw new Error('Usage: node prepare-bundled.mjs SOURCE_DIR NEW_OUTPUT_DIR');
const sourceDirectory = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
if (existsSync(output)) throw new Error('Output must be a new directory (no overwriting)');
mkdirSync(output, { recursive: true });
const catalog = JSON.parse(readFileSync(resolve(root, 'media/video/manifest.json')));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const probe = path =>
  JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path]),
  );
const audioHash = path =>
  execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      path,
      '-map',
      '0:a:0',
      '-c:a',
      'copy',
      '-f',
      'hash',
      '-hash',
      'sha256',
      '-',
    ],
    { encoding: 'utf8' },
  ).trim();
const evidence = [];
for (const entry of catalog.assets) {
  const source = resolve(sourceDirectory, entry.original);
  const target = resolve(output, entry.file);
  if (
    hash(source) !== (entry.sourceSHA256 || entry.sha256) ||
    statSync(source).size !== (entry.sourceBytes || entry.bytes)
  ) {
    throw new Error(`Original has changed: ${entry.original}`);
  }
  console.log(`Compressing ${entry.original}`);
  const original = probe(source);
  execFileSync(
    'ffmpeg',
    [
      '-nostdin',
      '-v',
      'error',
      '-n',
      '-i',
      source,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0',
      '-map_metadata',
      '-1',
      '-map_chapters',
      '-1',
      '-vf',
      'scale=856:482:force_original_aspect_ratio=decrease,pad=856:482:(ow-iw)/2:(oh-ih)/2,setsar=1',
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '21',
      '-profile:v',
      'high',
      '-level:v',
      '3.1',
      '-pix_fmt',
      'yuv420p',
      '-fps_mode',
      'passthrough',
      '-video_track_timescale',
      '90000',
      '-c:a',
      'copy',
      '-movflags',
      '+faststart',
      target,
    ],
    { stdio: 'inherit' },
  );
  const result = probe(target);
  const video = result.streams.find(s => s.codec_type === 'video');
  const audio = result.streams.find(s => s.codec_type === 'audio');
  const previousVideo = original.streams.find(s => s.codec_type === 'video');
  const previousAudio = original.streams.find(s => s.codec_type === 'audio');
  const ticks = (video.duration_ts * catalog.timescale) / 90000;
  if (
    !Number.isInteger(ticks) ||
    ticks !== entry.durationTicks ||
    video.nb_frames !== previousVideo.nb_frames ||
    audio.duration_ts !== previousAudio.duration_ts ||
    audio.time_base !== previousAudio.time_base ||
    audioHash(source) !== audioHash(target)
  ) {
    throw new Error(`Timing/audio changed: ${entry.file}`);
  }
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-xerror', '-i', target, '-f', 'null', '-']);
  const quality = spawnSync(
    'ffmpeg',
    [
      '-nostdin',
      '-v',
      'info',
      '-i',
      source,
      '-i',
      target,
      '-filter_complex',
      '[0:v]scale=856:482:force_original_aspect_ratio=decrease,pad=856:482:(ow-iw)/2:(oh-ih)/2,setsar=1[ref];[ref][1:v]ssim',
      '-an',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const ssim = Number(quality.stderr?.match(/All:([0-9.]+)/)?.[1]);
  if (quality.status !== 0 || !Number.isFinite(ssim) || ssim < 0.97) {
    throw new Error(`Quality check failed: ${entry.file}, SSIM=${ssim}\n${quality.stderr}`);
  }
  evidence.push({
    file: entry.file,
    sourceSHA256: hash(source),
    sourceBytes: statSync(source).size,
    sha256: hash(target),
    bytes: statSync(target).size,
    durationTicks: ticks,
    frames: Number(video.nb_frames),
    ssim,
    audioUnchanged: true,
    fullyDecoded: true,
  });
}
writeFileSync(
  resolve(output, 'encoding-evidence.json'),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      video: 'H.264 High@3.1, yuv420p, 856x482, 30fps, libx264 slow CRF21, faststart',
      audio: 'AAC original bitstream copy (no resampling/re-encoding)',
      evidence,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(evidence, null, 2));
