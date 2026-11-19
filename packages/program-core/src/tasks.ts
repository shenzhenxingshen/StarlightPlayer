import { compileProgram, Definition, locateWallClock, Timeline } from './index';

export interface VideoAsset {
  id: string;
  file: string;
  title: string;
  role: Definition['segments'][number]['role'];
  durationTicks: number;
}
export interface Catalog {
  revision: string;
  timescale: number;
  assets: readonly VideoAsset[];
}
export interface VideoTask {
  id: string;
  name: string;
  enabled: boolean;
  hour: number;
  minute: number;
  second: number;
  weekdays: number[];
  sequence: { assetId: string; repeat: number }[];
}
export interface Occurrence {
  key: string;
  task: VideoTask;
  definition: Definition;
  startEpochMs: number;
  endEpochMs: number;
}
export interface VideoSession {
  occurrence: Occurrence;
  intent: 'playing' | 'paused' | 'stopped';
}

export function validateVideoTask(task: VideoTask, catalog: Catalog): Definition {
  if (
    !task ||
    typeof task.id !== 'string' ||
    !/^video-[a-zA-Z0-9_-]{1,100}$/.test(task.id) ||
    typeof task.name !== 'string' ||
    !task.name.trim() ||
    [...task.name.trim()].length > 30 ||
    typeof task.enabled !== 'boolean'
  )
    throw new Error('视频任务名称须为1～30个字符');
  for (const [part, maximum] of [
    [task.hour, 23],
    [task.minute, 59],
    [task.second, 59],
  ]) {
    if (!Number.isInteger(part) || part < 0 || part > maximum) throw new Error('启动时刻无效');
  }
  if (
    !Array.isArray(task.weekdays) ||
    !task.weekdays.length ||
    task.weekdays.some(d => !Number.isInteger(d) || d < 1 || d > 7) ||
    new Set(task.weekdays).size !== task.weekdays.length
  )
    throw new Error('请至少选择一个有效重复日期');
  if (!Array.isArray(task.sequence) || !task.sequence.length || task.sequence.length > 100) {
    throw new Error('视频流程需包含1～100个条目');
  }
  const definition: Definition = {
    id: task.id,
    revision: catalog.revision,
    timescale: catalog.timescale,
    segments: task.sequence.map(entry => {
      const asset = catalog.assets.find(a => a.id === entry?.assetId);
      if (!asset) throw new Error('未知的视频素材');
      if (!Number.isSafeInteger(entry.repeat) || entry.repeat < 1 || entry.repeat > 1000) {
        throw new Error('视频单项重复次数须为1～1,000的整数');
      }
      return {
        asset: asset.file,
        role: asset.role,
        durationTicks: asset.durationTicks,
        repeat: entry.repeat,
      };
    }),
  };
  const timeline = compileProgram(definition);
  // Bound native composition/playlist memory and prevent a daily occurrence overlapping itself.
  if (timeline.spans.length > 1000 || timeline.totalTicks / timeline.timescale >= 86400) {
    throw new Error('视频流程最多1,000段且总时长须小于24小时');
  }
  return definition;
}

export function defaultVideoTasks(): VideoTask[] {
  return [49, 98].map(count => ({
    id: `video-default-${count}`,
    name: `${count}遍视频任务`,
    enabled: false,
    hour: count === 49 ? 5 : 20,
    minute: count === 49 ? 30 : 0,
    second: 0,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    sequence: [
      { assetId: `intro${count}`, repeat: 1 },
      { assetId: 'salutation', repeat: 1 },
      { assetId: 'regular', repeat: count - 1 },
      { assetId: 'final', repeat: 1 },
      { assetId: 'outro', repeat: 1 },
    ],
  }));
}

/** A local-calendar date: never subtract fixed 86400s across DST. */
export function occurrenceOnDate(task: VideoTask, catalog: Catalog, date: Date): Occurrence | null {
  if (!Number.isFinite(date.getTime())) throw new Error('无效的任务日期');
  const definition = validateVideoTask(task, catalog);
  const day = date.getDay() || 7;
  if (!task.weekdays.includes(day)) return null;
  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    task.hour,
    task.minute,
    task.second,
    0,
  );
  if (
    start.getHours() !== task.hour ||
    start.getMinutes() !== task.minute ||
    start.getSeconds() !== task.second
  )
    return null; // DST gap; no silent one-hour shift.
  const timeline = compileProgram(definition);
  const startEpochMs = start.getTime();
  if (!Number.isSafeInteger(startEpochMs)) throw new Error('无效的任务日期');
  return {
    key: `${task.id}@${startEpochMs}`,
    task: JSON.parse(JSON.stringify(task)),
    definition,
    startEpochMs,
    endEpochMs: startEpochMs + (timeline.totalTicks * 1000) / timeline.timescale,
  };
}

/** Enabled gates automatic starts only. Manual join still honors the chosen calendar/window. */
export function activeOccurrence(
  task: VideoTask,
  catalog: Catalog,
  now: number,
): Occurrence | null {
  if (!Number.isSafeInteger(now)) throw new Error('无效的当前时间');
  for (const offset of [0, -1]) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    const occurrence = occurrenceOnDate(task, catalog, date);
    if (occurrence && now >= occurrence.startEpochMs && now < occurrence.endEpochMs)
      return occurrence;
  }
  return null;
}

/** Newest due occurrence wins, with stable ID ordering for simultaneous starts. */
export function dueOccurrence(
  tasks: VideoTask[],
  catalog: Catalog,
  now: number,
  seen: readonly string[],
): Occurrence | null {
  const latest = tasks
    .filter(t => t.enabled)
    .map(t => activeOccurrence(t, catalog, now))
    .filter((o): o is Occurrence => o !== null)
    .sort((a, b) => b.startEpochMs - a.startEpochMs || a.task.id.localeCompare(b.task.id))[0];
  // Never fall back to an older overlapping task after the newest has been handled.
  return latest && !seen.includes(latest.key) ? latest : null;
}

export function sessionTimeline(session: VideoSession, catalog: Catalog): Timeline {
  // A persisted snapshot must match this build's media. Reject old/tampered duration/path data.
  const expected = validateVideoTask(session.occurrence.task, catalog);
  if (
    JSON.stringify(expected) !== JSON.stringify(session.occurrence.definition) ||
    !Number.isSafeInteger(session.occurrence.startEpochMs) ||
    !['playing', 'paused', 'stopped'].includes(session.intent) ||
    session.occurrence.key !== `${expected.id}@${session.occurrence.startEpochMs}`
  ) {
    throw new Error('视频任务快照与当前素材不匹配');
  }
  const timeline = compileProgram(expected);
  if (
    session.occurrence.endEpochMs !==
    session.occurrence.startEpochMs + (timeline.totalTicks * 1000) / timeline.timescale
  ) {
    throw new Error('视频任务快照时长无效');
  }
  return timeline;
}

export function sessionPosition(session: VideoSession, catalog: Catalog, now: number) {
  return locateWallClock(sessionTimeline(session, catalog), session.occurrence.startEpochMs, now);
}
