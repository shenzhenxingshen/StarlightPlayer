import TrackPlayer from 'react-native-track-player';
import { MMKV } from 'react-native-mmkv';
import {
  isNearCycleStart,
  resetCycleIfCompleted,
  seekWithReasonInCommand,
} from '@/utils/playbackCycle';
import {
  incrementTaskCompletedCount,
  loadCycleEligible,
  loadPlaybackPausedAt,
  loadSessionCount,
  loadTaskCompletedCount,
  resetPlaybackTask,
  saveCurrentTrack,
  saveCycleEligible,
  savePlaybackPausedAt,
  saveSessionCount,
  setSettings,
} from '@/utils/storage';

const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer>;

describe('playbackCycle · 同步恢复计数资格', () => {
  beforeEach(() => {
    (new MMKV() as any).clearAll();
    mockedTrackPlayer.getProgress.mockResolvedValue({ position: 10, duration: 70, buffered: 70 });
    mockedTrackPlayer.seekTo.mockResolvedValue();
  });

  it('暂停接近一个完整周期后，即使循环位置相同也会作废当前遍', async () => {
    saveCycleEligible(true);
    savePlaybackPausedAt(Date.now() - 70_000);

    await seekWithReasonInCommand(10.2, 'sync-resume', 70);

    expect(loadCycleEligible()).toBe(false);
  });

  it('短暂停且位置偏差很小时保留当前遍资格', async () => {
    saveCycleEligible(true);
    savePlaybackPausedAt(Date.now() - 500);

    await seekWithReasonInCommand(10.2, 'sync-resume', 70);

    expect(loadCycleEligible()).toBe(true);
  });

  it('长暂停后重新对齐到开头，可以作为一个新的完整周期', async () => {
    saveCycleEligible(true);
    savePlaybackPausedAt(Date.now() - 70_000);

    await seekWithReasonInCommand(0.5, 'sync-resume', 70);

    expect(loadCycleEligible()).toBe(true);
  });

  it('系统时钟回拨时不保留旧的当前遍资格', async () => {
    saveCycleEligible(true);
    savePlaybackPausedAt(Date.now() + 60_000);

    await seekWithReasonInCommand(10.2, 'sync-resume', 70);

    expect(loadCycleEligible()).toBe(false);
  });

  it('1.5 秒边界有效，负数、非有限值和边界外无效', () => {
    expect(isNearCycleStart(0)).toBe(true);
    expect(isNearCycleStart(1.5)).toBe(true);
    expect(isNearCycleStart(1.5001)).toBe(false);
    expect(isNearCycleStart(-0.01)).toBe(false);
    expect(isNearCycleStart(Number.NaN)).toBe(false);
    expect(isNearCycleStart(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('seek 会夹紧到合法范围，非法位置则拒绝', async () => {
    await expect(seekWithReasonInCommand(Number.NaN, 'user-seek', 70)).rejects.toThrow(
      'Invalid seek position',
    );
    await seekWithReasonInCommand(-5, 'user-seek', 70);
    expect(mockedTrackPlayer.seekTo).toHaveBeenLastCalledWith(0);
    expect(loadCycleEligible()).toBe(true);

    await seekWithReasonInCommand(80, 'remote-seek', 70);
    expect(mockedTrackPlayer.seekTo).toHaveBeenLastCalledWith(70);
    expect(loadCycleEligible()).toBe(false);

    await seekWithReasonInCommand(2, 'track-start');
    expect(mockedTrackPlayer.seekTo).toHaveBeenLastCalledWith(2);
  });

  it('没有暂停时间时，同步恢复可按环形距离保留资格', async () => {
    saveCycleEligible(true);
    mockedTrackPlayer.getProgress.mockResolvedValue({ position: 69.8, duration: 70, buffered: 70 });

    await seekWithReasonInCommand(0.2, 'sync-resume', 70);

    expect(loadCycleEligible()).toBe(true);
    expect(loadPlaybackPausedAt()).toBeNull();
  });

  it('旧遍无资格且同步位置不在开头时不能凭短暂停恢复资格', async () => {
    saveCycleEligible(false);
    savePlaybackPausedAt(Date.now() - 100);

    await seekWithReasonInCommand(10.1, 'sync-resume', 70);

    expect(loadCycleEligible()).toBe(false);
  });
});

describe('playbackCycle · 已完成任务再次播放', () => {
  beforeEach(() => {
    (new MMKV() as any).clearAll();
    setSettings({ isCareMode: false, isSyncMode: false, repeatCount: 7 });
    saveCurrentTrack({ id: 'a05', index: 4 });
    resetPlaybackTask('a05');
    incrementTaskCompletedCount('a05');
  });

  it('达到 N 遍后再次播放会同时清零决策计数和累计任务', () => {
    saveSessionCount(7);

    expect(resetCycleIfCompleted()).toBe(true);
    expect(loadSessionCount()).toBe(0);
    expect(loadTaskCompletedCount('a05')).toBe(0);
    expect(loadCycleEligible()).toBe(false);
  });

  it('尚未达到 N 遍时暂停恢复不会清零累计任务', () => {
    saveSessionCount(6);

    expect(resetCycleIfCompleted()).toBe(false);
    expect(loadSessionCount()).toBe(6);
    expect(loadTaskCompletedCount('a05')).toBe(1);
  });

  it('没有当前曲目时达到 N 遍仍可安全清零', () => {
    (new MMKV() as any).clearAll();
    setSettings({ isCareMode: false, isSyncMode: false, repeatCount: 1 });
    saveSessionCount(1);
    saveCycleEligible(true);

    expect(resetCycleIfCompleted()).toBe(true);
    expect(loadSessionCount()).toBe(0);
    expect(loadCycleEligible()).toBe(false);
  });
});
