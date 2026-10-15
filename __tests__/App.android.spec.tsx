/* eslint-disable @typescript-eslint/no-var-requires */
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { PermissionsAndroid, Platform } from 'react-native';
import TrackPlayer, { RepeatMode, State } from 'react-native-track-player';
import { MMKV } from 'react-native-mmkv';
import App from '@/App';
import { TRACKS } from '@/constants/tracks';
import {
  loadTaskCompletedCount,
  saveCurrentTrack,
  saveSessionCount,
  setSettings,
} from '@/utils/storage';

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

const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer>;

describe('<App /> Android 首启', () => {
  const originalOS = Platform.OS;
  const originalVersion = Platform.Version;

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
    Object.defineProperty(Platform, 'Version', { configurable: true, value: originalVersion });
  });

  it('复用同一原生曲目、迁移累计遍数并请求通知权限', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    Object.defineProperty(Platform, 'Version', { configurable: true, value: 35 });
    (new MMKV() as any).clearAll();
    setSettings({ isCareMode: false, isSyncMode: false, repeatCount: 7 });
    saveCurrentTrack({ id: TRACKS[0].id, index: 0 });
    saveSessionCount(3);
    mockedTrackPlayer.setupPlayer.mockRejectedValueOnce(
      new Error('The player has already been initialized'),
    );
    mockedTrackPlayer.updateOptions.mockResolvedValue();
    mockedTrackPlayer.setRepeatMode.mockResolvedValue(RepeatMode.Off);
    mockedTrackPlayer.getActiveTrack.mockResolvedValue({ id: TRACKS[0].id } as never);
    mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.Paused });
    const request = jest
      .spyOn(PermissionsAndroid, 'request')
      .mockRejectedValue(new Error('notification denied'));
    const now = jest.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(100);
    try {
      const { getByText } = render(<App />);
      await waitFor(() => expect(getByText('screen:Player')).toBeTruthy(), { timeout: 2000 });

      expect(request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      expect(loadTaskCompletedCount(TRACKS[0].id)).toBe(3);
    } finally {
      request.mockRestore();
      now.mockRestore();
    }
  });
});
