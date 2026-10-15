/* eslint-disable @typescript-eslint/no-var-requires */
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import TrackPlayer, { RepeatMode, State } from 'react-native-track-player';
import { MMKV } from 'react-native-mmkv';
import App from '@/App';
import { savePlayerState } from '@/utils/storage';
import { replaceTrackInCommand } from '@/utils/trackManager';

jest.mock('@react-navigation/native', () => {
  const ReactModule = require('react');
  return {
    NavigationContainer: ({ children }: any) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});

jest.mock('@react-navigation/bottom-tabs', () => {
  const ReactModule = require('react');
  const { Text, View } = require('react-native');
  return {
    createBottomTabNavigator: () => ({
      Navigator: ({ children }: any) => ReactModule.createElement(View, null, children),
      Screen: ({ name }: any) => ReactModule.createElement(Text, null, `screen:${name}`),
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
const mockedReplaceTrack = replaceTrackInCommand as jest.MockedFunction<
  typeof replaceTrackInCommand
>;

describe('<App /> 冷启动重试与队列重建', () => {
  it('前台初始化暂时失败后复用原生播放器，并按保存索引重建空队列', async () => {
    (new MMKV() as any).clearAll();
    savePlayerState({ trackIndex: 4, playMode: 'play-all' });
    mockedTrackPlayer.setupPlayer
      .mockRejectedValueOnce(new Error('activity is not ready'))
      .mockRejectedValueOnce({ code: 'player_already_initialized' });
    mockedTrackPlayer.updateOptions.mockResolvedValue();
    mockedTrackPlayer.setRepeatMode.mockResolvedValue(RepeatMode.Off);
    mockedTrackPlayer.getActiveTrack.mockResolvedValue(undefined);
    mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.Paused });
    const now = jest.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(600);
    try {
      const { getByText } = render(<App />);
      expect(getByText('当勤精进')).toBeTruthy();
      await waitFor(() => expect(getByText('screen:Player')).toBeTruthy(), { timeout: 2000 });

      expect(mockedTrackPlayer.setupPlayer).toHaveBeenCalledTimes(2);
      expect(mockedReplaceTrack).toHaveBeenCalledWith(4, 'restore');
    } finally {
      now.mockRestore();
    }
  });
});
