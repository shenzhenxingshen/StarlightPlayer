import TrackPlayer from 'react-native-track-player';
import { MMKV } from 'react-native-mmkv';
import { seekWithReasonInCommand } from '@/utils/playbackCycle';
import { loadCycleEligible, saveCycleEligible, savePlaybackPausedAt } from '@/utils/storage';

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
});
