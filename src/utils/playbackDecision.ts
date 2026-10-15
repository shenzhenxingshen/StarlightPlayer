import { State } from 'react-native-track-player';
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

/**
 * 只有接管到启动前已存在的原生队列时，才从原生状态恢复“应持续播放”意图。
 * 冷启动重建队列也会短暂经过 Loading，但那只是资源加载，不能因此自动播放。
 */
export function shouldRestoreExpectedPlaying(
  hasNativeActiveTrack: boolean,
  state: State,
): boolean {
  return (
    hasNativeActiveTrack &&
    (state === State.Playing || state === State.Buffering || state === State.Loading)
  );
}
