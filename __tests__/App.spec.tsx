/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-shadow */
import React from 'react';
import * as ReactNative from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import TrackPlayer, { RepeatMode, State } from 'react-native-track-player';
import { MMKV } from 'react-native-mmkv';
import App from '@/App';
import { TRACKS } from '@/constants/tracks';
import { useSettingsStore } from '@/store/settingsStore';
import { getPlayerLayout } from '@/utils/playerLayout';
import {
  loadCurrentTrack,
  loadCycleEligible,
  loadExpectedPlaying,
  loadSessionCount,
  saveCurrentTrack,
  saveSessionCount,
  setSettings,
} from '@/utils/storage';

const mockNavigatorMount = jest.fn();

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: any) => <View>{children}</View>,
    SafeAreaView: ({ children }: any) => <View>{children}</View>,
    useSafeAreaInsets: () => mockInsets,
  };
});

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { NavigationContainer: ({ children }: any) => <>{children}</> };
});

jest.mock('@react-navigation/bottom-tabs', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  const Navigator = ({ children, ...props }: any) => {
    React.useEffect(() => {
      mockNavigatorMount();
    }, []);
    return (
      <View testID="tab-navigator" {...props}>
        {children}
      </View>
    );
  };
  return {
    createBottomTabNavigator: () => ({
      Navigator,
      Screen: ({ name, options }: any) => (
        <View testID={`tab-screen-${name}`} screenOptions={options}>
          <Text>{`screen:${name}`}</Text>
          {options?.tabBarIcon?.({ color: 'mock-color' })}
        </View>
      ),
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

type Viewport = { width: number; height: number; scale: number; fontScale: number };

let mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };

function setViewport(viewport: Viewport): void {
  ReactNative.Dimensions.set({ window: viewport, screen: viewport });
}

describe('<App /> 初始化与导航', () => {
  beforeAll(() => {
    setViewport({ width: 390, height: 844, scale: 3, fontScale: 1 });
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

  it('三类窗口使用共享导航 token、安全区，并在尺寸变化时保持同一导航实例', async () => {
    useSettingsStore.setState({ isCareMode: false });
    mockInsets = { top: 0, bottom: 24, left: 0, right: 0 };
    setViewport({ width: 390, height: 844, scale: 3, fontScale: 1 });

    const { getByTestId, getByText, rerender } = render(<App />);
    await waitFor(() => expect(getByText('screen:Player')).toBeTruthy());
    const setupCallsBeforeResize = mockedTrackPlayer.setupPlayer.mock.calls.length;
    const optionCallsBeforeResize = mockedTrackPlayer.updateOptions.mock.calls.length;

    const cases: Viewport[] = [
      { width: 390, height: 844, scale: 3, fontScale: 1 },
      { width: 600, height: 500, scale: 2, fontScale: 1 },
      { width: 1000, height: 500, scale: 2, fontScale: 1 },
    ];
    const observed = cases.map(viewport => {
      act(() => setViewport(viewport));
      rerender(<App />);

      const layout = getPlayerLayout(viewport.width, viewport.height, false);
      const navigatorOptions = getByTestId('tab-navigator').props.screenOptions;

      expect(navigatorOptions.tabBarStyle).toMatchObject({
        height: layout.tabBarHeight + mockInsets.bottom,
        paddingBottom: Math.max(layout.tabBarPaddingBottom, mockInsets.bottom),
        paddingTop: layout.tabBarPaddingTop,
      });
      expect(navigatorOptions.tabBarLabelStyle).toEqual({ fontSize: layout.tabLabelSize });
      (
        [
          ['Player', 'play-circle-outline'],
          ['Playlist', 'queue-music'],
          ['Profile', 'person'],
        ] as const
      ).forEach(([screen, iconName]) => {
        const options = getByTestId(`tab-screen-${screen}`).props.screenOptions;
        expect(options.tabBarIcon({ color: 'test-color' }).props).toMatchObject({
          name: iconName,
          size: layout.tabIconSize,
          color: 'test-color',
        });
      });

      return {
        mode: layout.mode,
        height: layout.tabBarHeight,
        iconSize: layout.tabIconSize,
        labelSize: layout.tabLabelSize,
      };
    });

    expect(observed.map(item => item.mode)).toEqual(['portrait', 'square', 'landscape']);
    expect(new Set(observed.map(item => item.height)).size).toBe(3);
    expect(new Set(observed.map(item => item.iconSize)).size).toBe(3);
    expect(new Set(observed.map(item => item.labelSize)).size).toBe(3);
    expect(mockNavigatorMount).toHaveBeenCalledTimes(1);
    expect(mockedTrackPlayer.setupPlayer).toHaveBeenCalledTimes(setupCallsBeforeResize);
    expect(mockedTrackPlayer.updateOptions).toHaveBeenCalledTimes(optionCallsBeforeResize);
  });

  it('已经初始化后快速进入，关怀模式隐藏列表页', async () => {
    useSettingsStore.setState({ isCareMode: true });
    const { getByText, queryByText } = render(<App />);
    await waitFor(() => expect(getByText('screen:Player')).toBeTruthy());
    expect(queryByText('screen:Playlist')).toBeNull();
    expect(getByText('screen:Profile')).toBeTruthy();
  });
});
