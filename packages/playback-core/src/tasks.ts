/** Pure task rules. Defaults, ordering and labels come directly from mobile v1.1. */
import {
  DEFAULT_SCHEDULED_TASKS,
  NEW_SCHEDULED_TASK,
  findEnabledTaskTimeConflict,
  formatTaskTime,
  sortScheduledTasks,
  normalizeTaskWeekdays,
  isTaskScheduledOn,
  formatTaskWeekdays,
} from '../../../src/constants/scheduledTasks';
import type { ScheduledTask } from '../../../src/types/scheduledTask';
import { validateConfig, type Config, type Track } from './index';

export {
  DEFAULT_SCHEDULED_TASKS,
  NEW_SCHEDULED_TASK,
  formatTaskTime,
  sortScheduledTasks,
  formatTaskWeekdays,
};
export type { ScheduledTask };
export const AUTOMATIC_TASK_WINDOW_MS = 15 * 60_000;
export interface TaskBook {
  version: 1;
  tasks: ScheduledTask[];
  /** Durable claim BEFORE starting native playback: never replay a claimed occurrence after a crash. */
  handled: Record<string, number>;
  notBefore: Record<string, number>;
}
export type TaskEdit =
  | { type: 'task-save'; task: ScheduledTask }
  | { type: 'task-delete'; id: string }
  | { type: 'task-enable'; id: string; enabled: boolean };
export interface Occurrence {
  taskId: string;
  scheduledAt: number;
  /** Local civil date + HH:mm:ss. DST's repeated clock time is still one daily task. */
  key: string;
}
const validId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-zA-Z0-9_-]{1,80}$/.test(value) &&
  !['__proto__', 'constructor', 'prototype'].includes(value);
const validInstant = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

export function taskConfig(task: ScheduledTask): Config {
  return {
    trackId: task.trackId,
    repeatCount: task.repeatCount,
    mode: task.playMode,
    sync: task.isSyncMode,
  };
}
export function validateTask(raw: unknown, tracks: readonly Track[]): ScheduledTask {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('无效的任务');
  const t = raw as ScheduledTask;
  const allowed = [
    'id',
    'name',
    'hour',
    'minute',
    'second',
    'weekdays',
    'trackId',
    'repeatCount',
    'playMode',
    'isSyncMode',
    'enabled',
  ];
  if (Object.keys(t).some(key => !allowed.includes(key)) || !validId(t.id))
    throw new Error('无效的任务标识');
  if (
    typeof t.name !== 'string' ||
    !t.name.trim() ||
    t.name.trim().length > 30 ||
    /[\u0000-\u001f\u007f]/.test(t.name)
  )
    throw new Error('任务名称须为 1～30 个字符，不能含换行或控制字符');
  for (const [part, maximum] of [
    [t.hour, 23],
    [t.minute, 59],
    [t.second, 59],
  ]) {
    if (!Number.isInteger(part) || part < 0 || part > maximum)
      throw new Error('启动时刻须为 00:00:00～23:59:59');
  }
  if (typeof t.enabled !== 'boolean') throw new Error('无效的启用状态');
  const weekdays = normalizeTaskWeekdays(t.weekdays);
  if (!weekdays) throw new Error('请至少选择一个有效的重复星期');
  validateConfig(taskConfig(t), tracks);
  return { ...t, name: t.name.trim(), weekdays };
}
export function initialTaskBook(): TaskBook {
  return {
    version: 1,
    tasks: DEFAULT_SCHEDULED_TASKS.map(t => ({ ...t, weekdays: [...t.weekdays] })),
    handled: {},
    notBefore: {},
  };
}
export function restoreTaskBook(raw: unknown, tracks: readonly Track[]): TaskBook {
  const b = raw as TaskBook;
  if (
    !b ||
    b.version !== 1 ||
    !Array.isArray(b.tasks) ||
    b.tasks.length > 1000 ||
    !b.handled ||
    typeof b.handled !== 'object' ||
    Array.isArray(b.handled) ||
    !b.notBefore ||
    typeof b.notBefore !== 'object' ||
    Array.isArray(b.notBefore)
  )
    throw new Error('任务存档损坏，原文件已保留');
  const tasks = b.tasks.map(t => validateTask(t, tracks));
  if (
    new Set(tasks.map(t => t.id)).size !== tasks.length ||
    tasks.some(t => findEnabledTaskTimeConflict(tasks, t))
  )
    throw new Error('任务存档包含重复标识或同一时刻的启用任务');
  if (
    Object.entries(b.handled).some(([k, v]) => k.length > 120 || !validInstant(v)) ||
    Object.entries(b.notBefore).some(([k, v]) => !validId(k) || !validInstant(v))
  )
    throw new Error('任务执行记录损坏');
  return {
    version: 1,
    tasks: sortScheduledTasks(tasks),
    handled: { ...b.handled },
    notBefore: { ...b.notBefore },
  };
}
export function editTaskBook(
  book: TaskBook,
  edit: TaskEdit,
  nowMs: number,
  tracks: readonly Track[],
): TaskBook {
  if (!validInstant(nowMs)) throw new Error('无效的系统时间');
  const next: TaskBook = { ...book, tasks: [...book.tasks], notBefore: { ...book.notBefore } };
  if (edit.type === 'task-delete') {
    if (!validId(edit.id) || !next.tasks.some(t => t.id === edit.id)) throw new Error('任务不存在');
    next.tasks = next.tasks.filter(t => t.id !== edit.id);
    delete next.notBefore[edit.id];
    return next;
  }
  let candidate: ScheduledTask;
  if (edit.type === 'task-enable') {
    const existing = next.tasks.find(t => t.id === edit.id);
    if (!existing || typeof edit.enabled !== 'boolean') throw new Error('任务不存在或启用状态无效');
    candidate = validateTask({ ...existing, enabled: edit.enabled }, tracks);
  } else {
    candidate = validateTask(edit.task, tracks);
    const existing = next.tasks.find(t => t.id === candidate.id);
    // Creation/edit follows mobile: creation is disabled; edit preserves the switch.
    if ((!existing && candidate.enabled) || (existing && candidate.enabled !== existing.enabled))
      throw new Error('请通过任务列表的启用开关修改定时状态');
    if (!existing && next.tasks.length >= 1000) throw new Error('任务数量已达本机安全上限 1000');
  }
  const conflict = findEnabledTaskTimeConflict(next.tasks, candidate);
  if (conflict) throw new Error(`启动时刻与“${conflict.name}”冲突，请选择其他时刻`);
  const previous = next.tasks.find(t => t.id === candidate.id);
  next.tasks = sortScheduledTasks([...next.tasks.filter(t => t.id !== candidate.id), candidate]);
  // Editing or enabling never retrospectively starts an earlier occurrence.
  if (
    !previous ||
    !previous.enabled ||
    formatTaskTime(previous) !== formatTaskTime(candidate) ||
    previous.weekdays.join(',') !== candidate.weekdays.join(',')
  )
    next.notBefore[candidate.id] = nowMs;
  return next;
}
export function dueOccurrences(
  book: TaskBook,
  candidates: readonly Occurrence[],
  previousMs: number,
  nowMs: number,
): Occurrence[] {
  if (nowMs < previousMs) return []; // clock rollback: reset cursor, keep durable dedup
  const enabled = new Map(book.tasks.filter(t => t.enabled).map(t => [t.id, t]));
  return candidates
    .filter(
      o =>
        enabled.has(o.taskId) &&
        isTaskScheduledOn(enabled.get(o.taskId)!, o.scheduledAt) &&
        !Object.prototype.hasOwnProperty.call(book.handled, o.key) &&
        o.scheduledAt > previousMs &&
        o.scheduledAt <= nowMs &&
        o.scheduledAt > (book.notBefore[o.taskId] ?? -1) &&
        nowMs - o.scheduledAt <= AUTOMATIC_TASK_WINDOW_MS,
    )
    .sort((a, b) => a.scheduledAt - b.scheduledAt || a.taskId.localeCompare(b.taskId));
}
export function claimOccurrence(book: TaskBook, occurrence: Occurrence, nowMs: number): TaskBook {
  // Eight days of claims protect ordinary clock rollback; arbitrary multi-week time travel is unsupported.
  const handled = Object.fromEntries(
    Object.entries(book.handled).filter(([, at]) => at >= nowMs - 8 * 86_400_000),
  );
  handled[occurrence.key] = occurrence.scheduledAt;
  return { ...book, handled };
}
