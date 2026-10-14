import TrackPlayer, { Event, State } from 'react-native-track-player';
import { MMKV } from 'react-native-mmkv';
import PlaybackService from '@/services/playbackService';
import { TRACKS } from '@/constants/tracks';
import {
  bumpTrackGeneration,
  getPlaybackStats,
  loadCurrentTrack,
  loadCycleEligible,
  loadExpectedPlaying,
  loadPlaybackPausedAt,
  loadSessionCount,
  loadTaskCompletedCount,
  loadTrackGeneration,
  resetPlaybackTask,
  saveCurrentTrack,
  saveCycleEligible,
  saveExpectedPlaying,
  savePlaybackPausedAt,
  savePlayerState,
  saveSessionCount,
  setSettings,
} from '@/utils/storage';
import { setCurrentIndex } from '@/utils/trackManager';
import { enqueuePlayerCommand } from '@/utils/playerCommandQueue';
import * as syncUtils from '@/utils/syncUtils';

const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer> & {
  __emit(event: string, payload?: unknown): Promise<void> | undefined;
};

describe('PlaybackService · 停止后的恢复', () => {
  let now = Date.now();
  let dateNowSpy: jest.SpyInstance<number, []>;

  beforeAll(async () => {
    dateNowSpy = jest.spyOn(Date, 'now');
    await PlaybackService();
  });

  afterAll(() => {
    dateNowSpy.mockRestore();
  });

  beforeEach(() => {
    now += 60_000;
    dateNowSpy.mockReturnValue(now);
    (new MMKV() as any).clearAll();
    setCurrentIndex(0);
    setSettings({ isCareMode: false, isSyncMode: false, repeatCount: 7 });
    mockedTrackPlayer.getActiveTrack.mockReset().mockResolvedValue({
      id: TRACKS[0].id,
      url: TRACKS[0].audioUrl,
    });
    mockedTrackPlayer.getProgress.mockReset().mockResolvedValue({
      position: TRACKS[0].durationMs! / 1000,
      duration: TRACKS[0].durationMs! / 1000,
      buffered: TRACKS[0].durationMs! / 1000,
    });
    mockedTrackPlayer.seekTo.mockReset().mockResolvedValue();
    mockedTrackPlayer.play.mockReset().mockResolvedValue();
    mockedTrackPlayer.pause.mockReset().mockResolvedValue();
    mockedTrackPlayer.stop.mockReset().mockResolvedValue();
    mockedTrackPlayer.reset.mockReset().mockResolvedValue();
    mockedTrackPlayer.add.mockReset().mockResolvedValue(0);
    mockedTrackPlayer.retry.mockReset().mockResolvedValue(0 as never);
    mockedTrackPlayer.getPlaybackState.mockReset().mockResolvedValue({ state: State.Playing });
  });

  it('RemoteStop 会取消持续播放和当前遍资格', async () => {
    saveExpectedPlaying(true);
    saveCycleEligible(true);

    await mockedTrackPlayer.__emit(Event.RemoteStop);

    expect(loadExpectedPlaying()).toBe(false);
    expect(loadCycleEligible()).toBe(false);
    expect(mockedTrackPlayer.stop).toHaveBeenCalled();
  });

  it('Stopped 状态再次播放时从 0 开始并恢复计数资格', async () => {
    saveExpectedPlaying(false);
    saveCycleEligible(false);
    mockedTrackPlayer.getPlaybackState
      .mockResolvedValueOnce({ state: State.Stopped })
      .mockResolvedValueOnce({ state: State.Playing });

    await mockedTrackPlayer.__emit(Event.RemotePlay);

    expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(0);
    expect(mockedTrackPlayer.play).toHaveBeenCalled();
    expect(loadExpectedPlaying()).toBe(true);
    expect(loadCycleEligible()).toBe(true);
  });

  it('普通暂停会取消持续播放预期，但保留当前遍资格', async () => {
    saveExpectedPlaying(true);
    saveCycleEligible(true);

    await mockedTrackPlayer.__emit(Event.RemotePause);

    expect(loadExpectedPlaying()).toBe(false);
    expect(loadCycleEligible()).toBe(true);
    expect(mockedTrackPlayer.pause).toHaveBeenCalledTimes(1);
  });

  it('普通远程 seek 到中途会作废当前遍资格', async () => {
    saveCycleEligible(true);

    await mockedTrackPlayer.__emit(Event.RemoteSeek, { position: 37 });

    expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(37);
    expect(loadCycleEligible()).toBe(false);
  });

  it('同步模式拒绝远程任意 seek，并回到时钟对齐位置', async () => {
    setSettings({ isCareMode: false, isSyncMode: true, repeatCount: 7 });

    await mockedTrackPlayer.__emit(Event.RemoteSeek, { position: 37 });

    expect(mockedTrackPlayer.seekTo).toHaveBeenCalledTimes(1);
    expect(mockedTrackPlayer.seekTo).not.toHaveBeenCalledWith(37);
  });

  it('连续两次远程下一首会按队列执行两次，而不是重复加载同一首', async () => {
    const first = mockedTrackPlayer.__emit(Event.RemoteNext);
    const second = mockedTrackPlayer.__emit(Event.RemoteNext);
    await Promise.all([first, second]);

    expect(loadCurrentTrack()?.id).toBe(TRACKS[2].id);
    expect(mockedTrackPlayer.reset).toHaveBeenCalledTimes(2);
  });

  it('第一首执行远程上一首会回绕到列表末尾', async () => {
    await mockedTrackPlayer.__emit(Event.RemotePrevious);

    expect(loadCurrentTrack()?.id).toBe(TRACKS[TRACKS.length - 1].id);
  });

  it('临时音频中断结束后会按用户原播放意图恢复', async () => {
    saveExpectedPlaying(true);
    saveCycleEligible(true);

    await mockedTrackPlayer.__emit(Event.RemoteDuck, { paused: true, permanent: false });
    expect(mockedTrackPlayer.pause).toHaveBeenCalledTimes(1);
    expect(loadExpectedPlaying()).toBe(true);

    await mockedTrackPlayer.__emit(Event.RemoteDuck, { paused: false, permanent: false });
    expect(mockedTrackPlayer.play).toHaveBeenCalledTimes(1);
  });

  it('本来就暂停时收到 Duck，不会把原暂停时间覆盖成刚刚暂停', async () => {
    saveExpectedPlaying(false);
    savePlaybackPausedAt(now - 20_000);

    await mockedTrackPlayer.__emit(Event.RemoteDuck, { paused: true, permanent: false });

    expect(loadPlaybackPausedAt()).toBe(now - 20_000);
    expect(mockedTrackPlayer.pause).toHaveBeenCalledTimes(1);
  });

  it('永久音频中断会停止且作废当前遍', async () => {
    saveExpectedPlaying(true);
    saveCycleEligible(true);

    await mockedTrackPlayer.__emit(Event.RemoteDuck, { paused: false, permanent: true });

    expect(mockedTrackPlayer.stop).toHaveBeenCalledTimes(1);
    expect(loadExpectedPlaying()).toBe(false);
    expect(loadCycleEligible()).toBe(false);
  });

  it('普通模式未达 N 遍时，QueueEnded 从 0 重播当前曲', async () => {
    savePlayerState({ trackIndex: 0, playMode: 'play-all' });
    saveSessionCount(2);
    saveCycleEligible(true);
    saveExpectedPlaying(true);

    await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, {
      position: TRACKS[0].durationMs! / 1000,
    });

    expect(loadSessionCount()).toBe(3);
    expect(loadTaskCompletedCount(TRACKS[0].id)).toBe(3);
    expect(loadCurrentTrack()?.id).toBe(TRACKS[0].id);
    expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(0);
    expect(mockedTrackPlayer.play).toHaveBeenCalledTimes(1);
    expect(getPlaybackStats()[TRACKS[0].id]).toBe(1);
  });

  it('同步模式未达 N 遍时，QueueEnded 按当前墙钟重新对齐', async () => {
    const alignedPositionMs = 250;
    const alignedSpy = jest
      .spyOn(syncUtils, 'calculateAlignedPosition')
      .mockReturnValue(alignedPositionMs);
    try {
      setSettings({ isCareMode: false, isSyncMode: true, repeatCount: 7 });
      savePlayerState({ trackIndex: 0, playMode: 'play-all' });
      saveSessionCount(2);
      saveCycleEligible(true);

      await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, {
        position: TRACKS[0].durationMs! / 1000,
      });

      expect(loadSessionCount()).toBe(3);
      expect(loadCurrentTrack()?.id).toBe(TRACKS[0].id);
      expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(alignedPositionMs / 1000);
      expect(mockedTrackPlayer.play).toHaveBeenCalledTimes(1);
      expect(loadCycleEligible()).toBe(true);
    } finally {
      alignedSpy.mockRestore();
    }
  });

  it('repeat-one 达 N 遍后清零并继续当前曲', async () => {
    savePlayerState({ trackIndex: 0, playMode: 'repeat-one' });
    saveSessionCount(6);
    saveCycleEligible(true);

    await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, {
      position: TRACKS[0].durationMs! / 1000,
    });

    expect(loadSessionCount()).toBe(0);
    expect(loadTaskCompletedCount(TRACKS[0].id)).toBe(7);
    expect(loadCurrentTrack()?.id).toBe(TRACKS[0].id);
    expect(mockedTrackPlayer.play).toHaveBeenCalledTimes(1);
  });

  it('每首 1 遍的单曲循环会持续累计第 1、2、3 遍', async () => {
    setSettings({ isCareMode: false, isSyncMode: false, repeatCount: 1 });
    savePlayerState({ trackIndex: 0, playMode: 'repeat-one' });
    resetPlaybackTask(TRACKS[0].id);
    saveSessionCount(0);
    saveCycleEligible(true);
    const payload = { position: TRACKS[0].durationMs! / 1000 };

    await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, payload);
    expect(loadSessionCount()).toBe(0);
    expect(loadTaskCompletedCount(TRACKS[0].id)).toBe(1);

    dateNowSpy.mockReturnValue(now + 6_000);
    await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, payload);
    expect(loadTaskCompletedCount(TRACKS[0].id)).toBe(2);

    dateNowSpy.mockReturnValue(now + 12_000);
    await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, payload);
    expect(loadTaskCompletedCount(TRACKS[0].id)).toBe(3);
  });

  it('同步 repeat-one 达 N 遍后清零并按当前墙钟重新对齐', async () => {
    const alignedPositionMs = 300;
    const alignedSpy = jest
      .spyOn(syncUtils, 'calculateAlignedPosition')
      .mockReturnValue(alignedPositionMs);
    try {
      setSettings({ isCareMode: false, isSyncMode: true, repeatCount: 7 });
      savePlayerState({ trackIndex: 0, playMode: 'repeat-one' });
      saveSessionCount(6);
      saveCycleEligible(true);

      await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, {
        position: TRACKS[0].durationMs! / 1000,
      });

      expect(loadSessionCount()).toBe(0);
      expect(loadTaskCompletedCount(TRACKS[0].id)).toBe(7);
      expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(alignedPositionMs / 1000);
      expect(mockedTrackPlayer.play).toHaveBeenCalledTimes(1);
      expect(loadCycleEligible()).toBe(true);
    } finally {
      alignedSpy.mockRestore();
    }
  });

  it('play-one 达 N 遍后停止，不再自动重播', async () => {
    savePlayerState({ trackIndex: 0, playMode: 'play-one' });
    saveSessionCount(6);
    saveCycleEligible(true);
    saveExpectedPlaying(true);

    await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, {
      position: TRACKS[0].durationMs! / 1000,
    });

    expect(loadSessionCount()).toBe(7);
    expect(loadTaskCompletedCount(TRACKS[0].id)).toBe(7);
    expect(loadExpectedPlaying()).toBe(false);
    expect(mockedTrackPlayer.play).not.toHaveBeenCalled();
  });

  it('单曲播放完成后再次播放视为新任务并清零累计遍数', async () => {
    setSettings({ isCareMode: false, isSyncMode: false, repeatCount: 1 });
    savePlayerState({ trackIndex: 0, playMode: 'play-one' });
    resetPlaybackTask(TRACKS[0].id);
    saveSessionCount(0);
    saveCycleEligible(true);

    await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, {
      position: TRACKS[0].durationMs! / 1000,
    });
    expect(loadTaskCompletedCount(TRACKS[0].id)).toBe(1);

    await mockedTrackPlayer.__emit(Event.RemotePlay);

    expect(loadSessionCount()).toBe(0);
    expect(loadTaskCompletedCount(TRACKS[0].id)).toBe(0);
    expect(loadCycleEligible()).toBe(true);
    expect(mockedTrackPlayer.seekTo).toHaveBeenLastCalledWith(0);
  });

  it('repeat-all 达 N 遍后切到下一首并清零', async () => {
    savePlayerState({ trackIndex: 0, playMode: 'repeat-all' });
    saveSessionCount(6);
    saveCycleEligible(true);

    await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, {
      position: TRACKS[0].durationMs! / 1000,
    });

    expect(loadCurrentTrack()?.id).toBe(TRACKS[1].id);
    expect(loadSessionCount()).toBe(0);
    expect(mockedTrackPlayer.play).toHaveBeenCalledTimes(1);
  });

  it('play-all 在最后一首达 N 遍后停止', async () => {
    const lastIndex = TRACKS.length - 1;
    setCurrentIndex(lastIndex);
    savePlayerState({ trackIndex: lastIndex, playMode: 'play-all' });
    saveSessionCount(6);
    saveCycleEligible(true);
    saveExpectedPlaying(true);
    mockedTrackPlayer.getActiveTrack.mockResolvedValue({
      id: TRACKS[lastIndex].id,
      url: TRACKS[lastIndex].audioUrl,
    });
    mockedTrackPlayer.getProgress.mockResolvedValue({
      position: TRACKS[lastIndex].durationMs! / 1000,
      duration: TRACKS[lastIndex].durationMs! / 1000,
      buffered: TRACKS[lastIndex].durationMs! / 1000,
    });

    await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, {
      position: TRACKS[lastIndex].durationMs! / 1000,
    });

    expect(loadCurrentTrack()?.id).toBe(TRACKS[lastIndex].id);
    expect(loadExpectedPlaying()).toBe(false);
    expect(mockedTrackPlayer.play).not.toHaveBeenCalled();
  });

  it('QueueEnded 位置不接近结尾时不计数', async () => {
    saveSessionCount(0);
    saveCycleEligible(true);

    await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, { position: 10 });

    expect(loadSessionCount()).toBe(0);
    expect(loadTaskCompletedCount(TRACKS[0].id)).toBe(0);
    expect(getPlaybackStats()[TRACKS[0].id]).toBeUndefined();
    expect(mockedTrackPlayer.play).toHaveBeenCalledTimes(1);
  });

  it('同一代曲目的重复 QueueEnded 只计数一次', async () => {
    saveSessionCount(0);
    saveCycleEligible(true);
    const payload = { position: TRACKS[0].durationMs! / 1000 };

    const first = mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, payload);
    const duplicate = mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, payload);
    await Promise.all([first, duplicate]);

    expect(loadSessionCount()).toBe(1);
    expect(loadTaskCompletedCount(TRACKS[0].id)).toBe(1);
    expect(getPlaybackStats()[TRACKS[0].id]).toBe(1);
  });

  it('系统时钟回拨不会把下一次合法 QueueEnded 永久当作重复事件', async () => {
    saveSessionCount(0);
    saveCycleEligible(true);
    const payload = { position: TRACKS[0].durationMs! / 1000 };

    await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, payload);
    dateNowSpy.mockReturnValue(now - 60_000);
    await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, payload);

    expect(loadSessionCount()).toBe(2);
    expect(getPlaybackStats()[TRACKS[0].id]).toBe(2);
  });

  it('超过去重窗口的旧 QueueEnded 在新一遍刚开始时仍不会重复计数', async () => {
    saveSessionCount(0);
    saveCycleEligible(true);
    const payload = { position: TRACKS[0].durationMs! / 1000 };

    await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, payload);
    dateNowSpy.mockReturnValue(now + 6_000);
    mockedTrackPlayer.getProgress.mockResolvedValue({
      position: 6,
      duration: 273.894,
      buffered: 20,
    });
    await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, payload);

    expect(loadSessionCount()).toBe(1);
    expect(getPlaybackStats()[TRACKS[0].id]).toBe(1);
  });

  it('QueueEnded 动作失败时只重试动作，不重复增加遍数和统计', async () => {
    saveSessionCount(0);
    saveCycleEligible(true);
    mockedTrackPlayer.play
      .mockRejectedValueOnce(new Error('play-1'))
      .mockRejectedValueOnce(new Error('play-2'))
      .mockResolvedValueOnce();

    await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, {
      position: TRACKS[0].durationMs! / 1000,
    });

    expect(mockedTrackPlayer.play).toHaveBeenCalledTimes(3);
    expect(mockedTrackPlayer.retry).toHaveBeenCalledTimes(1);
    expect(loadSessionCount()).toBe(1);
    expect(loadTaskCompletedCount(TRACKS[0].id)).toBe(1);
    expect(getPlaybackStats()[TRACKS[0].id]).toBe(1);
  });

  it('原生 active track 与持久化曲目不一致时忽略迟到的 QueueEnded', async () => {
    saveSessionCount(0);
    saveCycleEligible(true);
    mockedTrackPlayer.getActiveTrack.mockResolvedValue({
      id: TRACKS[1].id,
      url: TRACKS[1].audioUrl,
    });

    await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, {
      position: TRACKS[0].durationMs! / 1000,
    });

    expect(loadSessionCount()).toBe(0);
    expect(mockedTrackPlayer.play).not.toHaveBeenCalled();
  });

  it('迟到的 ActiveTrackChanged 不会覆盖当前原生曲目', async () => {
    mockedTrackPlayer.getActiveTrack.mockResolvedValue({
      id: TRACKS[0].id,
      url: TRACKS[0].audioUrl,
    });

    await mockedTrackPlayer.__emit(Event.PlaybackActiveTrackChanged, {
      track: { id: TRACKS[1].id },
    });

    expect(loadCurrentTrack()?.id).toBe(TRACKS[0].id);
  });

  it('未预期的原生真换曲会同步持久化状态并清零遍数', async () => {
    saveSessionCount(4);
    resetPlaybackTask(TRACKS[0].id);
    saveCycleEligible(true);
    mockedTrackPlayer.getActiveTrack.mockResolvedValue({
      id: TRACKS[1].id,
      url: TRACKS[1].audioUrl,
    });

    await mockedTrackPlayer.__emit(Event.PlaybackActiveTrackChanged, {
      track: { id: TRACKS[1].id },
    });

    expect(loadCurrentTrack()?.id).toBe(TRACKS[1].id);
    expect(loadSessionCount()).toBe(0);
    expect(loadTaskCompletedCount(TRACKS[1].id)).toBe(0);
    expect(loadTrackGeneration()).toBe(0);
    expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(0);
  });

  it('意外进入 Stopped 且仍期望播放时，watchdog 会自动恢复', async () => {
    jest.useFakeTimers({ doNotFake: ['Date'] });
    try {
      saveExpectedPlaying(true);
      mockedTrackPlayer.getPlaybackState
        .mockResolvedValueOnce({ state: State.Stopped })
        .mockResolvedValue({ state: State.Playing });

      mockedTrackPlayer.__emit(Event.PlaybackState, { state: State.Stopped });
      await jest.advanceTimersByTimeAsync(1500);

      expect(mockedTrackPlayer.play).toHaveBeenCalledTimes(1);
      expect(loadExpectedPlaying()).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('同步模式 watchdog 按墙钟恢复，而不是固定回到 0', async () => {
    jest.useFakeTimers({ doNotFake: ['Date'] });
    const alignedSpy = jest.spyOn(syncUtils, 'calculateAlignedPosition').mockReturnValue(10_000);
    try {
      setSettings({ isCareMode: false, isSyncMode: true, repeatCount: 7 });
      saveExpectedPlaying(true);
      saveCycleEligible(true);
      mockedTrackPlayer.getPlaybackState
        .mockResolvedValueOnce({ state: State.Stopped })
        .mockResolvedValueOnce({ state: State.Stopped })
        .mockResolvedValue({ state: State.Playing });

      mockedTrackPlayer.__emit(Event.PlaybackState, { state: State.Stopped });
      await jest.advanceTimersByTimeAsync(1500);

      expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(10);
      expect(mockedTrackPlayer.seekTo).not.toHaveBeenCalledWith(0);
      expect(mockedTrackPlayer.play).toHaveBeenCalledTimes(1);
      expect(loadCycleEligible()).toBe(false);
    } finally {
      alignedSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it('watchdog 等待命令锁时收到停止意图，不会重新播放', async () => {
    jest.useFakeTimers({ doNotFake: ['Date'] });
    let releaseBlocker!: () => void;
    const blockerGate = new Promise<void>(resolve => {
      releaseBlocker = resolve;
    });
    try {
      const blocker = enqueuePlayerCommand('test:watchdog-blocker', () => blockerGate);
      await Promise.resolve();
      await Promise.resolve();

      saveExpectedPlaying(true);
      mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.Stopped });
      mockedTrackPlayer.__emit(Event.PlaybackState, { state: State.Stopped });
      jest.advanceTimersByTime(1500);
      await Promise.resolve();

      // 模拟另一 ReactContext 在 watchdog 取得原生锁前提交用户意图。
      saveExpectedPlaying(false);
      releaseBlocker();
      await blocker;
      await enqueuePlayerCommand('test:watchdog-drain', async () => {});

      expect(mockedTrackPlayer.play).not.toHaveBeenCalled();
      expect(loadExpectedPlaying()).toBe(false);
    } finally {
      releaseBlocker();
      jest.useRealTimers();
    }
  });

  it('watchdog 连续三轮恢复失败后停止无限重试', async () => {
    jest.useFakeTimers({ doNotFake: ['Date'] });
    try {
      saveExpectedPlaying(true);
      mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.Stopped });
      mockedTrackPlayer.play.mockRejectedValue(new Error('cannot play'));

      mockedTrackPlayer.__emit(Event.PlaybackError, { code: 'E_IO', message: 'read failed' });
      await jest.advanceTimersByTimeAsync(1500);
      await jest.advanceTimersByTimeAsync(3000);
      await jest.advanceTimersByTimeAsync(6000);

      expect(mockedTrackPlayer.play).toHaveBeenCalledTimes(6);
      expect(mockedTrackPlayer.retry).toHaveBeenCalledTimes(3);
      expect(loadExpectedPlaying()).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('原生 generation 不匹配时忽略旧 QueueEnded', async () => {
    saveSessionCount(0);
    saveCycleEligible(true);
    const generation = bumpTrackGeneration();
    mockedTrackPlayer.getActiveTrack.mockResolvedValue({
      id: TRACKS[0].id,
      url: TRACKS[0].audioUrl,
      starlightGeneration: generation - 1,
    } as never);

    await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, {
      position: TRACKS[0].durationMs! / 1000,
    });

    expect(loadSessionCount()).toBe(0);
  });

  it('持久化当前曲目缺失时可从原生 active track 恢复 QueueEnded', async () => {
    (new MMKV() as any).clearAll();
    setSettings({ isCareMode: false, isSyncMode: false, repeatCount: 2 });
    saveCycleEligible(true);
    mockedTrackPlayer.getActiveTrack.mockResolvedValue({
      id: TRACKS[0].id,
      url: TRACKS[0].audioUrl,
    });

    await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, {
      position: TRACKS[0].durationMs! / 1000,
    });

    expect(loadCurrentTrack()?.id).toBe(TRACKS[0].id);
    expect(loadSessionCount()).toBe(1);
  });

  it('未知 active track 的 QueueEnded 不会污染计数', async () => {
    saveCurrentTrack({ id: 'unknown', index: 0 });
    saveCycleEligible(true);
    mockedTrackPlayer.getActiveTrack.mockResolvedValue({ id: 'unknown', url: 'unknown.mp3' });

    await mockedTrackPlayer.__emit(Event.PlaybackQueueEnded, { position: 100 });

    expect(loadSessionCount()).toBe(0);
    expect(mockedTrackPlayer.play).not.toHaveBeenCalled();
  });
});
