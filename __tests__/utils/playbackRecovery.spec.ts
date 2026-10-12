import TrackPlayer, { State } from 'react-native-track-player';
import { MMKV } from 'react-native-mmkv';
import { TRACKS } from '@/constants/tracks';
import { ensurePlayableAndPlayInCommand, setCurrentIndex } from '@/utils/trackManager';
import { loadCycleEligible, setSettings } from '@/utils/storage';
import * as syncUtils from '@/utils/syncUtils';

const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer>;

describe('trackManager · 终态与空队列恢复', () => {
  beforeEach(() => {
    (new MMKV() as any).clearAll();
    setCurrentIndex(0);
    setSettings({ isCareMode: false, isSyncMode: false, repeatCount: 7 });
    mockedTrackPlayer.getProgress.mockResolvedValue({ position: 0, duration: 0, buffered: 0 });
    mockedTrackPlayer.seekTo.mockResolvedValue();
    mockedTrackPlayer.play.mockResolvedValue();
    mockedTrackPlayer.retry.mockResolvedValue(0 as never);
    mockedTrackPlayer.reset.mockResolvedValue();
    mockedTrackPlayer.add.mockResolvedValue(0);
  });

  it('Ended 状态会先回到 0，再开始播放并恢复计数资格', async () => {
    mockedTrackPlayer.getActiveTrack.mockResolvedValue({
      id: TRACKS[0].id,
      url: TRACKS[0].audioUrl,
    });
    mockedTrackPlayer.getPlaybackState
      .mockResolvedValueOnce({ state: State.Ended })
      .mockResolvedValueOnce({ state: State.Playing });

    await ensurePlayableAndPlayInCommand('test-ended');

    expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(0);
    expect(mockedTrackPlayer.play).toHaveBeenCalled();
    expect(loadCycleEligible()).toBe(true);
  });

  it('同步模式异常恢复会按墙钟对齐，并作废从中途恢复的当前遍', async () => {
    const alignedSpy = jest.spyOn(syncUtils, 'calculateAlignedPosition').mockReturnValue(10_000);
    try {
      setSettings({ isCareMode: false, isSyncMode: true, repeatCount: 7 });
      mockedTrackPlayer.getActiveTrack.mockResolvedValue({
        id: TRACKS[0].id,
        url: TRACKS[0].audioUrl,
      });
      mockedTrackPlayer.getPlaybackState
        .mockResolvedValueOnce({ state: State.Stopped })
        .mockResolvedValueOnce({ state: State.Playing });

      await ensurePlayableAndPlayInCommand('test-sync-recovery', {
        restartTerminal: false,
        alignToClock: true,
      });

      expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(10);
      expect(mockedTrackPlayer.play).toHaveBeenCalled();
      expect(loadCycleEligible()).toBe(false);
    } finally {
      alignedSpy.mockRestore();
    }
  });

  it('原生队列为空时会重建当前曲目后再播放', async () => {
    mockedTrackPlayer.getActiveTrack.mockResolvedValue(undefined);
    mockedTrackPlayer.getPlaybackState
      .mockResolvedValueOnce({ state: State.Ready })
      .mockResolvedValueOnce({ state: State.Playing });

    await ensurePlayableAndPlayInCommand('test-empty-queue');

    expect(mockedTrackPlayer.reset).toHaveBeenCalled();
    expect(mockedTrackPlayer.add).toHaveBeenCalledWith(
      expect.objectContaining({ id: TRACKS[0].id }),
    );
    expect(mockedTrackPlayer.play).toHaveBeenCalled();
  });
});
