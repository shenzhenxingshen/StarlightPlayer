import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

export const files = ['01_intro.mp4', '02_regular_cycle.mp4', '03_final_cycle.mp4', '04_outro.mp4'];
export const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');

export function definitionFromAssets(input) {
  const manifest = JSON.parse(readFileSync(resolve(input, 'manifest.json'), 'utf8'));
  const roles = ['intro', 'regular', 'final', 'outro'];
  if (JSON.stringify(manifest.program.sequence.map(s => [s.file, s.repeat])) !==
      JSON.stringify(files.map((f, i) => [f, i === 1 ? 48 : 1]))) {
    throw new Error('This isolated prototype requires the reviewed four-part 49-cycle program');
  }
  const segments = files.map((file, index) => {
    const clip = manifest.clips.find(c => c.file === file);
    const source = resolve(input, file);
    if (!clip || hash(source) !== clip.sha256) throw new Error(`Asset hash mismatch: ${file}`);
    const probe = JSON.parse(execFileSync('ffprobe',
      ['-v', 'error', '-show_streams', '-of', 'json', source], { encoding: 'utf8' }));
    const audio = probe.streams.find(s => s.codec_type === 'audio');
    const video = probe.streams.find(s => s.codec_type === 'video');
    if (audio?.time_base !== '1/44100' || !Number.isSafeInteger(audio.duration_ts) ||
        audio.duration_ts <= 0 || video?.codec_name !== 'h264') throw new Error(`Invalid media: ${file}`);
    return { asset: file, role: roles[index], durationTicks: audio.duration_ts,
      repeat: manifest.program.sequence[index].repeat };
  });
  return { id: '49-2025V1', revision: manifest.clips.map(c => c.sha256.slice(0, 12)).join('-'),
    timescale: 44100, segments };
}

export function makeEDL(timeline) {
  // Length-prefixed UTF-8 strings follow mpv's EDL grammar; only bundled known basenames.
  return '# mpv EDL v0\n' + timeline.spans.map(span => {
    if (!files.includes(span.asset)) throw new Error('Unknown bundled asset');
    const path = `media/${span.asset}`;
    const seconds = (span.endTicks - span.startTicks) / timeline.timescale;
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Invalid EDL length');
    return `%${Buffer.byteLength(path)}%${path},0,${seconds.toFixed(12)}`;
  }).join('\n') + '\n';
}
