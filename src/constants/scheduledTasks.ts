import { ScheduledTask, ScheduledTaskDraft } from '../types/scheduledTask';

export const DEFAULT_SCHEDULED_TASKS: readonly ScheduledTask[] = [
  {
    id: 'default-morning',
    name: '早自习',
    hour: 5,
    minute: 30,
    second: 0,
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

export function formatTaskTime(task: Pick<ScheduledTask, 'hour' | 'minute' | 'second'>): string {
  return [task.hour, task.minute, task.second]
    .map(value => String(value).padStart(2, '0'))
    .join(':');
}
