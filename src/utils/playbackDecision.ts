import { PlayMode } from './storage';

export type PostCycleAction =
  | 'restart-current'
  | 'restart-current-reset-count'
  | 'next-track'
  | 'stop';

export function decidePostCycleAction(
  playMode: PlayMode,
  completedCount: number,
  repeatCount: number,
  isLastTrack: boolean,
): PostCycleAction {
  // 每首重复遍数始终先于播放模式。
  if (completedCount < repeatCount) return 'restart-current';

  switch (playMode) {
    case 'repeat-one':
      return 'restart-current-reset-count';
    case 'play-one':
      return 'stop';
    case 'repeat-all':
      return 'next-track';
    case 'play-all':
      return isLastTrack ? 'stop' : 'next-track';
  }
}

export function isValidQueueEndPosition(positionSeconds: number, durationSeconds: number): boolean {
  return (
    Number.isFinite(positionSeconds) &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0 &&
    positionSeconds >= durationSeconds - 2 &&
    positionSeconds <= durationSeconds + 5
  );
}
