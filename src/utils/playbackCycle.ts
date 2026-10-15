import TrackPlayer from 'react-native-track-player';
import { addLog } from './logger';
import {
  getSettings,
  clearPlaybackPausedAt,
  loadCycleEligible,
  loadCurrentTrack,
  loadPlaybackPausedAt,
  loadSessionCount,
  resetPlaybackTask,
  saveCycleEligible,
  saveSessionCount,
} from './storage';

export const CYCLE_START_TOLERANCE_SECONDS = 1.5;

export type SeekReason =
  | 'track-start'
  | 'cycle-restart'
  | 'sync-cycle'
  | 'sync-join'
  | 'sync-recovery'
  | 'sync-resume'
  | 'user-seek'
  | 'remote-seek';

export function isNearCycleStart(position: number): boolean {
  return Number.isFinite(position) && position >= 0 && position <= CYCLE_START_TOLERANCE_SECONDS;
}

function circularDistance(a: number, b: number, duration?: number): number {
  const direct = Math.abs(a - b);
  return duration && duration > 0 ? Math.min(direct, Math.abs(duration - direct)) : direct;
}

/** 必须在 player command queue 内调用。 */
export async function seekWithReasonInCommand(
  position: number,
  reason: SeekReason,
  duration?: number,
): Promise<boolean> {
  if (!Number.isFinite(position)) throw new Error(`Invalid seek position: ${position}`);
  const normalizedPosition = Math.max(
    0,
    duration && duration > 0 ? Math.min(position, duration) : position,
  );
  const previousEligible = loadCycleEligible();
  let eligible = isNearCycleStart(normalizedPosition);
  let pausedSeconds: number | null = null;

  if (reason === 'sync-resume') {
    const before = (await TrackPlayer.getProgress()).position;
    const pausedAt = loadPlaybackPausedAt();
    if (pausedAt != null) {
      const elapsedMs = Date.now() - pausedAt;
      // 系统时钟回拨时无法证明播放连续，按不合格处理，避免误计一遍。
      pausedSeconds = elapsedMs >= 0 ? elapsedMs / 1000 : Number.POSITIVE_INFINITY;
    }
    const pauseWasContinuous =
      pausedSeconds == null || pausedSeconds <= CYCLE_START_TOLERANCE_SECONDS;
    eligible =
      isNearCycleStart(normalizedPosition) ||
      (previousEligible &&
        pauseWasContinuous &&
        circularDistance(before, normalizedPosition, duration) <= CYCLE_START_TOLERANCE_SECONDS);
  } else if (reason === 'user-seek' || reason === 'remote-seek') {
    // 主动回到开头后完整播放仍然可计数；跳到其他位置则当前遍作废。
    eligible = isNearCycleStart(normalizedPosition);
  }

  await TrackPlayer.seekTo(normalizedPosition);
  saveCycleEligible(eligible);
  if (reason === 'sync-resume') clearPlaybackPausedAt();
  addLog(
    'INFO',
    `seekWithReason: ${reason} → ${normalizedPosition.toFixed(2)}s eligible=${eligible} paused=${pausedSeconds?.toFixed(2) ?? 'n/a'}s`,
  );
  return eligible;
}

export function resetCycleIfCompleted(): boolean {
  const { repeatCount } = getSettings();
  const count = loadSessionCount();
  if (count < repeatCount) return false;

  saveSessionCount(0);
  const trackId = loadCurrentTrack()?.id;
  if (trackId) resetPlaybackTask(trackId);
  saveCycleEligible(false);
  addLog('INFO', `resetCycle: ${count}>=${repeatCount} → reset task=${trackId ?? 'none'}`);
  return true;
}
