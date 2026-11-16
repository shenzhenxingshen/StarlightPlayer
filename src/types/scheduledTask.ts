import type { PlayMode } from './playMode';

/** ISO weekday: Monday=1 ... Sunday=7, in the device's local timezone. */
export type TaskWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ScheduledTask {
  id: string;
  name: string;
  hour: number;
  minute: number;
  second: number;
  weekdays: TaskWeekday[];
  trackId: string;
  repeatCount: number;
  playMode: PlayMode;
  isSyncMode: boolean;
  enabled: boolean;
}

export type ScheduledTaskDraft = Omit<ScheduledTask, 'id'>;
