import TrackPlayer, { State } from 'react-native-track-player';
import { MMKV } from 'react-native-mmkv';
import {
  getCurrentIndex,
  setCurrentIndex,
  getNextIndex,
  getPrevIndex,
  isLastTrack,
  loadTrack,
  loadTrackAndPlay,
} from '@/utils/trackManager';
import { TRACKS } from '@/constants/tracks';
import {
  incrementTaskCompletedCount,
  loadSessionCount,
  loadTaskCompletedCount,
  resetPlaybackTask,
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
