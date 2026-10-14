/* eslint-disable @typescript-eslint/no-var-requires */
import TrackPlayer, { Event } from 'react-native-track-player';
import { Platform } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import { loadExpectedPlaying, saveExpectedPlaying } from '@/utils/storage';

const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer> & {
  __emit(event: string, payload?: unknown): Promise<void> | undefined;
};

describe('PlaybackService · Android 专属错误事件', () => {
  const originalOS = Platform.OS;

  beforeAll(async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const { default: PlaybackService } = require('@/services/playbackService');
    await PlaybackService();
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  });

  beforeEach(() => {
    (new MMKV() as any).clearAll();
  });

  it('Android 注册 PlayerError 监听器', () => {
    const registeredEvents = mockedTrackPlayer.addEventListener.mock.calls.map(([event]) => event);
    expect(registeredEvents).toContain(Event.PlayerError);
  });

  it('没有持续播放意图时 PlayerError 只记录，不安排恢复', async () => {
    jest.useFakeTimers();
    try {
      saveExpectedPlaying(false);
      mockedTrackPlayer.__emit(Event.PlayerError, { code: 'E_SERVICE', message: 'start failed' });
      await jest.advanceTimersByTimeAsync(6000);
      expect(mockedTrackPlayer.getPlaybackState).not.toHaveBeenCalled();
      expect(loadExpectedPlaying()).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('仍期望播放时 PlayerError 进入 watchdog，用户取消后安全退出', async () => {
    jest.useFakeTimers();
    try {
      saveExpectedPlaying(true);
      mockedTrackPlayer.__emit(Event.PlayerError, { code: 'E_SERVICE', message: 'start failed' });
      saveExpectedPlaying(false);
      await jest.advanceTimersByTimeAsync(1500);
      expect(mockedTrackPlayer.getPlaybackState).not.toHaveBeenCalled();
      expect(loadExpectedPlaying()).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
