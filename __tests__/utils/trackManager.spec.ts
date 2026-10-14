import TrackPlayer, { State } from 'react-native-track-player';
import { MMKV } from 'react-native-mmkv';
import {
  getCurrentIndex,
  setCurrentIndex,
  getNextIndex,
  getPrevIndex,
  isLastTrack,
  ensureCurrentTrackLoadedInCommand,
  ensurePlayableAndPlayInCommand,
  loadTrack,
  loadTrackAndPlay,
  loadNextTrackAndPlay,
  loadPreviousTrackAndPlay,
  playWithRetryInCommand,
  replaceTrackInCommand,
} from '@/utils/trackManager';
import { TRACKS } from '@/constants/tracks';
import {
  incrementTaskCompletedCount,
  beginPendingTrackChange,
  loadCurrentTrack,
  loadSessionCount,
  loadTaskCompletedCount,
  resetPlaybackTask,
  saveCurrentTrack,
  savePlayerState,
  saveSessionCount,
  setSettings,
} from '@/utils/storage';

const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer>;

describe('trackManager · 索引边界', () => {
  beforeEach(() => {
    (new MMKV() as any).clearAll();
    setCurrentIndex(0);
  });

  it('setCurrentIndex 越界会被夹紧', () => {
    setCurrentIndex(-1);
    expect(getCurrentIndex()).toBe(0);
    setCurrentIndex(TRACKS.length + 5);
    expect(getCurrentIndex()).toBe(TRACKS.length - 1);
  });

  it('getNextIndex 末尾回绕到 0', () => {
    setCurrentIndex(TRACKS.length - 1);
    expect(getNextIndex()).toBe(0);
  });

  it('getPrevIndex 开头回绕到末尾', () => {
    setCurrentIndex(0);
    expect(getPrevIndex()).toBe(TRACKS.length - 1);
  });

  it('isLastTrack 末尾时为 true', () => {
    setCurrentIndex(TRACKS.length - 1);
    expect(isLastTrack()).toBe(true);
    setCurrentIndex(0);
    expect(isLastTrack()).toBe(false);
  });

  it('未知曲目ID依次回退到持久化索引和player_state', () => {
    saveCurrentTrack({ id: 'legacy-unknown', index: 3 });
    expect(getCurrentIndex()).toBe(3);

    (new MMKV() as any).clearAll();
    savePlayerState({ trackIndex: 4, playMode: 'repeat-one' });
    expect(getCurrentIndex()).toBe(4);
  });

  it('显式曲目ID优先参与上下首和末曲判断', () => {
    setCurrentIndex(0);
    expect(getNextIndex(TRACKS[5].id)).toBe(6);
    expect(getPrevIndex(TRACKS[5].id)).toBe(4);
    expect(isLastTrack(TRACKS[TRACKS.length - 1].id)).toBe(true);
  });
});

describe('trackManager · 播放任务边界', () => {
  beforeEach(() => {
    (new MMKV() as any).clearAll();
    setCurrentIndex(0);
    setSettings({ isCareMode: false, isSyncMode: false, repeatCount: 108 });
    mockedTrackPlayer.reset.mockReset().mockResolvedValue();
    mockedTrackPlayer.add.mockReset().mockResolvedValue(0);
    mockedTrackPlayer.seekTo.mockReset().mockResolvedValue();
    mockedTrackPlayer.play.mockReset().mockResolvedValue();
    mockedTrackPlayer.getPlaybackState.mockReset().mockResolvedValue({ state: State.Playing });
  });

  it('用户手动重选当前曲目会创建新任务并清零', async () => {
    resetPlaybackTask(TRACKS[0].id);
    incrementTaskCompletedCount(TRACKS[0].id);
    saveSessionCount(1);

    await loadTrackAndPlay(0, 'user');

    expect(loadSessionCount()).toBe(0);
    expect(loadTaskCompletedCount(TRACKS[0].id)).toBe(0);
  });

  it('仅因原生队列丢失而恢复当前曲目时保留累计遍数', async () => {
    resetPlaybackTask(TRACKS[0].id);
    incrementTaskCompletedCount(TRACKS[0].id);
    saveSessionCount(1);

    await loadTrack(0, 'restore');

    expect(loadSessionCount()).toBe(1);
    expect(loadTaskCompletedCount(TRACKS[0].id)).toBe(1);
  });
});

describe('trackManager · 原生队列、重试与竞态', () => {
  beforeEach(() => {
    (new MMKV() as any).clearAll();
    setSettings({ isCareMode: false, isSyncMode: false, repeatCount: 7 });
    saveCurrentTrack({ id: TRACKS[0].id, index: 0 });
    mockedTrackPlayer.reset.mockReset().mockResolvedValue();
    mockedTrackPlayer.add.mockReset().mockResolvedValue(0);
    mockedTrackPlayer.play.mockReset().mockResolvedValue();
    mockedTrackPlayer.retry.mockReset().mockResolvedValue(true);
    mockedTrackPlayer.seekTo.mockReset().mockResolvedValue();
    mockedTrackPlayer.getActiveTrack.mockReset().mockResolvedValue({ id: TRACKS[0].id } as never);
    mockedTrackPlayer.getPlaybackState.mockReset().mockResolvedValue({ state: State.Playing });
  });

  it('没有本地状态时从原生active track恢复权威曲目', async () => {
    (new MMKV() as any).clearAll();
    mockedTrackPlayer.getActiveTrack.mockResolvedValue({ id: TRACKS[2].id } as never);
    const track = await ensureCurrentTrackLoadedInCommand('test:native-restore');
    expect(track.id).toBe(TRACKS[2].id);
    expect(loadCurrentTrack()?.id).toBe(TRACKS[2].id);
  });

  it('原生队列与持久化曲目不一致时重建队列', async () => {
    mockedTrackPlayer.getActiveTrack.mockResolvedValue({ id: TRACKS[1].id } as never);
    const track = await ensureCurrentTrackLoadedInCommand('test:rebuild');
    expect(track.id).toBe(TRACKS[0].id);
    expect(mockedTrackPlayer.reset).toHaveBeenCalledTimes(1);
    expect(mockedTrackPlayer.add).toHaveBeenCalledWith(
      expect.objectContaining({ id: TRACKS[0].id }),
    );
    expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(0);
  });

  it('Error状态先重建，Stopped状态从0恢复后播放', async () => {
    mockedTrackPlayer.getPlaybackState
      .mockResolvedValueOnce({ state: State.Error } as never)
      .mockResolvedValueOnce({ state: State.Stopped })
      .mockResolvedValue({ state: State.Playing });
    await ensurePlayableAndPlayInCommand('test:error-recovery');
    expect(mockedTrackPlayer.reset).toHaveBeenCalledTimes(1);
    expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(0);
    expect(mockedTrackPlayer.play).toHaveBeenCalledTimes(1);
  });

  it('同步恢复按墙钟seek而不是回到0', async () => {
    mockedTrackPlayer.getPlaybackState
      .mockResolvedValueOnce({ state: State.Stopped })
      .mockResolvedValue({ state: State.Playing });
    await ensurePlayableAndPlayInCommand('test:sync-recovery', {
      restartTerminal: false,
      alignToClock: true,
    });
    expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(expect.any(Number));
    expect(mockedTrackPlayer.play).toHaveBeenCalledTimes(1);
  });

  it('第一次play失败会retry，第二次成功', async () => {
    mockedTrackPlayer.play.mockRejectedValueOnce(new Error('first failed')).mockResolvedValueOnce();
    await playWithRetryInCommand('test:retry');
    expect(mockedTrackPlayer.play).toHaveBeenCalledTimes(2);
    expect(mockedTrackPlayer.retry).toHaveBeenCalledTimes(1);
  });

  it('两次play均失败时向上抛出最后错误', async () => {
    mockedTrackPlayer.play
      .mockRejectedValueOnce(new Error('first failed'))
      .mockRejectedValueOnce(new Error('second failed'));
    await expect(playWithRetryInCommand('test:fail')).rejects.toThrow('second failed');
    expect(mockedTrackPlayer.retry).toHaveBeenCalledTimes(1);
  });

  it('reset或add期间出现更新的换曲命令时旧命令失效', async () => {
    mockedTrackPlayer.reset.mockImplementationOnce(async () => {
      beginPendingTrackChange(TRACKS[1].id, 1, 'user');
    });
    await expect(replaceTrackInCommand(0, 'user')).resolves.toBeNull();
    expect(mockedTrackPlayer.add).not.toHaveBeenCalled();

    (new MMKV() as any).clearAll();
    mockedTrackPlayer.reset.mockReset().mockResolvedValue();
    mockedTrackPlayer.add.mockImplementationOnce(async () => {
      beginPendingTrackChange(TRACKS[2].id, 2, 'user');
      return 0;
    });
    await expect(replaceTrackInCommand(0, 'user')).resolves.toBeNull();
    expect(loadCurrentTrack()).toBeNull();
  });

  it('上下首包装函数按当前权威索引换歌并播放', async () => {
    await loadNextTrackAndPlay('user');
    expect(loadCurrentTrack()?.id).toBe(TRACKS[1].id);
    await loadPreviousTrackAndPlay('remote');
    expect(loadCurrentTrack()?.id).toBe(TRACKS[0].id);
    expect(mockedTrackPlayer.play).toHaveBeenCalledTimes(2);
  });
});
