/* eslint-disable @typescript-eslint/no-var-requires */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import TrackPlayer from 'react-native-track-player';
import App from '@/App';

jest.mock('@react-navigation/native', () => {
  const ReactModule = require('react');
  return {
    NavigationContainer: ({ children }: any) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});
jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({ Navigator: 'Navigator', Screen: 'Screen' }),
}));
jest.mock('@/screens/PlayerScreen', () => 'PlayerScreen');
jest.mock('@/screens/PlaylistScreen', () => 'PlaylistScreen');
jest.mock('@/screens/ProfileScreen', () => 'ProfileScreen');
jest.mock('@/utils/logger', () => ({ addLog: jest.fn() }));
jest.mock('@/utils/playerCommandQueue', () => ({
  enqueuePlayerCommand: jest.fn((_label: string, operation: () => unknown) =>
    Promise.resolve().then(operation),
  ),
}));

const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer>;

describe('<App /> 初始化失败', () => {
  it('连续五次 setupPlayer 失败后停止重试并显示错误', async () => {
    jest.useFakeTimers();
    mockedTrackPlayer.setupPlayer.mockRejectedValue(new Error('fatal setup'));
    try {
      const { getByText } = render(<App />);
      await act(async () => {
        await jest.runAllTimersAsync();
      });

      expect(mockedTrackPlayer.setupPlayer).toHaveBeenCalledTimes(5);
      expect(getByText(/初始化失败: Error: fatal setup/)).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});
