/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-shadow */
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import TrackPlayer, { RepeatMode, State } from 'react-native-track-player';
import { MMKV } from 'react-native-mmkv';
import App from '@/App';
import { TRACKS } from '@/constants/tracks';
import { useSettingsStore } from '@/store/settingsStore';
import {
  loadCurrentTrack,
  loadCycleEligible,
  loadExpectedPlaying,
  loadSessionCount,
  saveCurrentTrack,
  saveSessionCount,
  setSettings,
} from '@/utils/storage';

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { NavigationContainer: ({ children }: any) => <>{children}</> };
});

jest.mock('@react-navigation/bottom-tabs', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    createBottomTabNavigator: () => ({
      Navigator: ({ children }: any) => <View>{children}</View>,
      Screen: ({ name }: any) => <Text>{`screen:${name}`}</Text>,
    }),
  };
});

jest.mock('@/screens/PlayerScreen', () => 'PlayerScreen');
jest.mock('@/screens/PlaylistScreen', () => 'PlaylistScreen');
jest.mock('@/screens/ProfileScreen', () => 'ProfileScreen');
jest.mock('@/utils/logger', () => ({ addLog: jest.fn() }));
jest.mock('@/utils/playerOptions', () => ({ buildPlayerOptions: jest.fn(() => ({ mock: true })) }));
jest.mock('@/utils/playerCommandQueue', () => ({
  enqueuePlayerCommand: jest.fn((_label: string, operation: () => unknown) =>
    Promise.resolve().then(operation),
  ),
}));
jest.mock('@/utils/trackManager', () => ({ replaceTrackInCommand: jest.fn(async () => {}) }));

const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer>;

describe('<App /> 初始化与导航', () => {
  beforeAll(() => {
    (new MMKV() as any).clearAll();
    useSettingsStore.setState({ isCareMode: false, isSyncMode: false, repeatCount: 7 });
    setSettings({ isCareMode: false, isSyncMode: false, repeatCount: 7 });
    saveCurrentTrack({ id: TRACKS[0].id, index: 0 });
    saveSessionCount(5);
    mockedTrackPlayer.setupPlayer.mockResolvedValue();
    mockedTrackPlayer.updateOptions.mockResolvedValue();
    mockedTrackPlayer.setRepeatMode.mockResolvedValue(RepeatMode.Off);
    mockedTrackPlayer.getActiveTrack.mockResolvedValue({ id: TRACKS[1].id } as never);
    mockedTrackPlayer.getProgress.mockResolvedValue({ position: 10, duration: 60, buffered: 20 });
    mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.Playing });
    jest.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(600);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('接管原生队列时以原生曲目为权威并清理旧任务', async () => {
    const { getByText } = render(<App />);
    expect(getByText('当勤精进')).toBeTruthy();
    await waitFor(() => expect(getByText('screen:Player')).toBeTruthy());

    expect(mockedTrackPlayer.setupPlayer).toHaveBeenCalledWith({
      minBuffer: 5,
      maxBuffer: 50,
      autoHandleInterruptions: false,
    });
    expect(mockedTrackPlayer.setRepeatMode).toHaveBeenCalledWith(RepeatMode.Off);
    expect(loadCurrentTrack()?.id).toBe(TRACKS[1].id);
    expect(loadSessionCount()).toBe(0);
    expect(loadCycleEligible()).toBe(false);
    expect(loadExpectedPlaying()).toBe(true);
    expect(getByText('screen:Playlist')).toBeTruthy();
    expect(getByText('screen:Profile')).toBeTruthy();
  });

  it('已经初始化后快速进入，关怀模式隐藏列表页', async () => {
    useSettingsStore.setState({ isCareMode: true });
    const { getByText, queryByText } = render(<App />);
    await waitFor(() => expect(getByText('screen:Player')).toBeTruthy());
    expect(queryByText('screen:Playlist')).toBeNull();
    expect(getByText('screen:Profile')).toBeTruthy();
  });
});
