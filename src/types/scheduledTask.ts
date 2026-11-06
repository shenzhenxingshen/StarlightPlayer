import type { PlayMode } from '../utils/storage';

export interface ScheduledTask {
  id: string;
  name: string;
  hour: number;
  minute: number;
  second: number;
  trackId: string;
  repeatCount: number;
  playMode: PlayMode;
  isSyncMode: boolean;
  enabled: boolean;
}

export type ScheduledTaskDraft = Omit<ScheduledTask, 'id'>;
