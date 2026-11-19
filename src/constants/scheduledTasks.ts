import { ScheduledTask, ScheduledTaskDraft, TaskWeekday } from '../types/scheduledTask';

export const ALL_TASK_WEEKDAYS: readonly TaskWeekday[] = [1, 2, 3, 4, 5, 6, 7];
export const TASK_WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

/** Only a missing legacy field means daily; invalid/empty selections must never become daily. */
export function normalizeTaskWeekdays(value: unknown): TaskWeekday[] | null {
  if (value === undefined) return [...ALL_TASK_WEEKDAYS];
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some(day => !Number.isInteger(day) || day < 1 || day > 7)
  )
    return null;
  return [...new Set(value as TaskWeekday[])].sort((a, b) => a - b);
}

export function formatTaskWeekdays(task: Pick<ScheduledTask, 'weekdays'>): string {
  const days = normalizeTaskWeekdays(task.weekdays) ?? [];
  if (days.length === 7) return '每天';
  if (days.join(',') === '1,2,3,4,5') return '周一至周五';
  if (days.join(',') === '6,7') return '周末';
  return days.length ? `周${days.map(day => TASK_WEEKDAY_LABELS[day - 1]).join('、')}` : '未选择';
}

export function isTaskScheduledOn(task: Pick<ScheduledTask, 'weekdays'>, at: number): boolean {
  if (!Number.isFinite(at) || !Number.isFinite(new Date(at).getTime())) return false;
  const weekday = (new Date(at).getDay() || 7) as TaskWeekday;
  return normalizeTaskWeekdays(task.weekdays)?.includes(weekday) ?? false;
}

/** Validate the original planned occurrence, not the (possibly next-day) delivery time. */
export function matchesTaskOccurrence(
  task: Pick<ScheduledTask, 'weekdays' | 'hour' | 'minute' | 'second'>,
  at: number,
): boolean {
  const date = new Date(at);
  return (
    isTaskScheduledOn(task, at) &&
    date.getHours() === task.hour &&
    date.getMinutes() === task.minute &&
    date.getSeconds() === task.second
  );
}

export const DEFAULT_SCHEDULED_TASKS: readonly ScheduledTask[] = [
  {
    id: 'default-morning',
    name: '早自习',
    hour: 5,
    minute: 30,
    second: 0,
    weekdays: [...ALL_TASK_WEEKDAYS],
    trackId: 'a05',
    repeatCount: 49,
    playMode: 'play-one',
    isSyncMode: true,
    enabled: false,
  },
  {
    id: 'default-opportunity',
    name: '见缝插针',
    hour: 6,
    minute: 30,
    second: 0,
    weekdays: [...ALL_TASK_WEEKDAYS],
    trackId: 'a05',
    repeatCount: 500,
    playMode: 'repeat-one',
    isSyncMode: true,
    enabled: false,
  },
  {
    id: 'default-evening',
    name: '晚自习',
    hour: 20,
    minute: 0,
    second: 0,
    weekdays: [...ALL_TASK_WEEKDAYS],
    trackId: 'a05',
    repeatCount: 98,
    playMode: 'play-one',
    isSyncMode: true,
    enabled: false,
  },
];

export const NEW_SCHEDULED_TASK: ScheduledTaskDraft = {
  name: '',
  hour: 8,
  minute: 0,
  second: 0,
  weekdays: [...ALL_TASK_WEEKDAYS],
  trackId: 'a05',
  repeatCount: 1,
  playMode: 'play-one',
  isSyncMode: true,
  enabled: false,
};

export function taskTimeInSeconds(task: Pick<ScheduledTask, 'hour' | 'minute' | 'second'>): number {
  return task.hour * 3600 + task.minute * 60 + task.second;
}

export function sortScheduledTasks(tasks: readonly ScheduledTask[]): ScheduledTask[] {
  return [...tasks].sort(
    (left, right) =>
      taskTimeInSeconds(left) - taskTimeInSeconds(right) || left.id.localeCompare(right.id),
  );
}

export type TaskTimeProjection = Pick<
  ScheduledTask,
  'id' | 'name' | 'hour' | 'minute' | 'second' | 'enabled'
> & { weekdays: number[] };
export function findEnabledTaskTimeConflict<T extends TaskTimeProjection>(
  tasks: readonly T[],
  candidate: TaskTimeProjection,
): T | null {
  if (!candidate.enabled) return null;
  const candidateTime = taskTimeInSeconds(candidate);
  return (
    tasks.find(
      task =>
        task.id !== candidate.id &&
        task.enabled &&
        taskTimeInSeconds(task) === candidateTime &&
        (normalizeTaskWeekdays(task.weekdays) ?? []).some(day =>
          normalizeTaskWeekdays(candidate.weekdays)?.includes(day),
        ),
    ) ?? null
  );
}

export function formatTaskTime(task: Pick<ScheduledTask, 'hour' | 'minute' | 'second'>): string {
  return [task.hour, task.minute, task.second]
    .map(value => String(value).padStart(2, '0'))
    .join(':');
}
