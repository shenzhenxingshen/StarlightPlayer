/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-shadow */
import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import TrackPlayer, {
  Event,
  State,
  useActiveTrack,
  usePlaybackState,
  useProgress,
} from 'react-native-track-player';
import { MMKV } from 'react-native-mmkv';
import PlayerScreen from '@/screens/PlayerScreen';
import { TRACKS } from '@/constants/tracks';
import { useSettingsStore } from '@/store/settingsStore';
import {
  loadExpectedPlaying,
  loadPlayerState,
  saveCurrentTrack,
  saveCycleEligible,
  saveExpectedPlaying,
  savePlaybackTaskProgress,
  savePlayerState,
  setSettings,
} from '@/utils/storage';
import {
  ensureCurrentTrackLoadedInCommand,
  ensurePlayableAndPlayInCommand,
  loadNextTrackAndPlay,
  loadPreviousTrackAndPlay,
} from '@/utils/trackManager';
import { resetCycleIfCompleted, seekWithReasonInCommand } from '@/utils/playbackCycle';
import { addLog } from '@/utils/logger';

jest.mock('@/components/TrackInfo', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ track, isPlaying }: any) => <Text>{`track:${track?.id ?? 'none'}:${isPlaying}`}</Text>;
});

jest.mock('@/components/ProgressBar', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  const { formatRepeatCount } = require('@/utils/numberFormat');
  return ({ currentRepeat, totalRepeat, seekable, onSeek }: any) => (
    <Pressable testID="mock-seek" onPress={() => onSeek(12.5)}>
      <Text>{`repeats:${currentRepeat == null ? '-' : formatRepeatCount(currentRepeat)}:${
        totalRepeat == null ? '-' : formatRepeatCount(totalRepeat)
      }:${seekable}`}</Text>
    </Pressable>
  );
});

jest.mock('@/components/Controls', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  const MODE_CONFIG = {
    'repeat-one': { icon: 'repeat-one', label: '单曲循环', next: 'play-one' },
    'play-one': { icon: 'looks-one', label: '单曲播放', next: 'repeat-all' },
    'repeat-all': { icon: 'repeat', label: '列表循环', next: 'play-all' },
    'play-all': { icon: 'playlist-play', label: '列表播放', next: 'repeat-one' },
  };
  const MockControls = (props: any) => (
    <View>
      <Text testID="mode-state">{`${props.playMode}:${props.modeLabel ?? '-'}:${props.isSyncMode}`}</Text>
      <Pressable testID="play-pause" onPress={props.onPlayPause} />
      <Pressable testID="next" onPress={props.onSkipToNext} />
      <Pressable testID="previous" onPress={props.onSkipToPrevious} />
      <Pressable testID="toggle-mode" onPress={props.onToggleMode} />
      <Pressable testID="toggle-sync" onPress={props.onToggleSync} />
    </View>
  );
  return { __esModule: true, default: MockControls, MODE_CONFIG };
});

jest.mock('@/utils/trackManager', () => ({
  getCurrentIndex: jest.fn(() => 0),
  getNextIndex: jest.fn(() => 1),
  getPrevIndex: jest.fn(() => 20),
  ensureCurrentTrackLoadedInCommand: jest.fn(),
  ensurePlayableAndPlayInCommand: jest.fn(),
  loadNextTrackAndPlay: jest.fn(),
  loadPreviousTrackAndPlay: jest.fn(),
}));

jest.mock('@/utils/playerCommandQueue', () => ({
  enqueuePlayerCommand: jest.fn((_label: string, operation: () => unknown) =>
    Promise.resolve().then(operation),
  ),
}));

jest.mock('@/utils/playbackCycle', () => ({
  resetCycleIfCompleted: jest.fn(),
  seekWithReasonInCommand: jest.fn(async () => {}),
}));

jest.mock('@/utils/playerOptions', () => ({ buildPlayerOptions: jest.fn(() => ({ mock: true })) }));
jest.mock('@/utils/logger', () => ({ addLog: jest.fn() }));

const activeTrackHook = useActiveTrack as jest.Mock;
const playbackStateHook = usePlaybackState as jest.Mock;
const progressHook = useProgress as jest.Mock;
const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer> & {
  __emit: (event: string, payload: unknown) => unknown;
  __reset: () => void;
};
const ensureTrackMock = ensureCurrentTrackLoadedInCommand as jest.Mock;
const ensurePlayMock = ensurePlayableAndPlayInCommand as jest.Mock;
const nextMock = loadNextTrackAndPlay as jest.Mock;
const previousMock = loadPreviousTrackAndPlay as jest.Mock;
const resetCycleMock = resetCycleIfCompleted as jest.Mock;
const seekMock = seekWithReasonInCommand as jest.Mock;

describe('<PlayerScreen />', () => {
  beforeEach(() => {
    (new MMKV() as any).clearAll();
    mockedTrackPlayer.__reset();
    useSettingsStore.setState({ isCareMode: false, isSyncMode: false, repeatCount: 7 });
    setSettings({ isCareMode: false, isSyncMode: false, repeatCount: 7 });
    saveCurrentTrack({ id: TRACKS[0].id, index: 0 });
    savePlayerState({ trackIndex: 0, playMode: 'repeat-one' });
    saveCycleEligible(true);
    activeTrackHook.mockReturnValue({ id: TRACKS[0].id });
    playbackStateHook.mockReturnValue({ state: State.Paused });
    progressHook.mockReturnValue({ position: 0, duration: 60, buffered: 0 });
    mockedTrackPlayer.getActiveTrack.mockReset().mockResolvedValue({ id: TRACKS[0].id } as never);
    mockedTrackPlayer.pause.mockReset().mockResolvedValue();
    mockedTrackPlayer.updateOptions.mockReset().mockResolvedValue();
    ensureTrackMock.mockReset().mockResolvedValue(TRACKS[0]);
    ensurePlayMock.mockReset().mockResolvedValue(undefined);
    nextMock.mockReset().mockResolvedValue(undefined);
    previousMock.mockReset().mockResolvedValue(undefined);
    resetCycleMock.mockReset().mockReturnValue(false);
    seekMock.mockReset().mockResolvedValue(undefined);
  });

  it('大遍数、当前累计和四种模式切换均正确显示及持久化', () => {
    useSettingsStore.setState({ repeatCount: 5_000_000 });
    setSettings({ isCareMode: false, isSyncMode: false, repeatCount: 5_000_000 });
    savePlaybackTaskProgress({ trackId: TRACKS[0].id, completedCount: 4_999_998 });
    const { getByText, getByTestId } = render(<PlayerScreen />);

    expect(getByText('repeats:4,999,999:5,000,000:true')).toBeTruthy();
    fireEvent.press(getByTestId('toggle-mode'));
    expect(getByTestId('mode-state').props.children).toBe('play-one:单曲播放:false');
    expect(loadPlayerState()?.playMode).toBe('play-one');
  });

  it('普通模式播放新任务时从0开始并启动播放', async () => {
    resetCycleMock.mockReturnValue(true);
    const { getByTestId } = render(<PlayerScreen />);
    fireEvent.press(getByTestId('play-pause'));

    await waitFor(() =>
      expect(ensurePlayMock).toHaveBeenCalledWith('UI:play', { restartTerminal: true }),
    );
    expect(seekMock).toHaveBeenCalledWith(0, 'cycle-restart', TRACKS[0].durationMs! / 1000);
  });

  it('同步模式播放时按墙钟对齐并禁止进度条拖动', async () => {
    useSettingsStore.setState({ isSyncMode: true });
    setSettings({ isCareMode: false, isSyncMode: true, repeatCount: 7 });
    const { getByText, getByTestId } = render(<PlayerScreen />);
    expect(getByText('repeats:1:7:false')).toBeTruthy();
    fireEvent.press(getByTestId('play-pause'));

    await waitFor(() =>
      expect(ensurePlayMock).toHaveBeenCalledWith('UI:play', { restartTerminal: false }),
    );
    expect(seekMock).toHaveBeenCalledWith(
      expect.any(Number),
      'sync-resume',
      TRACKS[0].durationMs! / 1000,
    );
  });

  it('正在播放时执行暂停并清除期望播放状态', async () => {
    playbackStateHook.mockReturnValue({ state: State.Playing });
    saveExpectedPlaying(true);
    const { getByTestId } = render(<PlayerScreen />);
    fireEvent.press(getByTestId('play-pause'));

    await waitFor(() => expect(mockedTrackPlayer.pause).toHaveBeenCalled());
    expect(loadExpectedPlaying()).toBe(false);
  });

  it('开启同步时立即对齐；关闭同步时不额外seek', async () => {
    const { getByTestId, rerender } = render(<PlayerScreen />);
    fireEvent.press(getByTestId('toggle-sync'));
    await waitFor(() =>
      expect(seekMock).toHaveBeenCalledWith(
        expect.any(Number),
        'sync-join',
        TRACKS[0].durationMs! / 1000,
      ),
    );
    expect(useSettingsStore.getState().isSyncMode).toBe(true);

    seekMock.mockClear();
    rerender(<PlayerScreen />);
    fireEvent.press(getByTestId('toggle-sync'));
    await waitFor(() => expect(useSettingsStore.getState().isSyncMode).toBe(false));
    expect(seekMock).not.toHaveBeenCalled();
  });

  it('普通模式允许seek，同步模式和失效曲目拒绝seek', async () => {
    const { getByTestId, unmount } = render(<PlayerScreen />);
    fireEvent.press(getByTestId('mock-seek'));
    await waitFor(() =>
      expect(seekMock).toHaveBeenCalledWith(12.5, 'user-seek', TRACKS[0].durationMs! / 1000),
    );
    unmount();

    seekMock.mockClear();
    useSettingsStore.setState({ isSyncMode: true });
    setSettings({ isCareMode: false, isSyncMode: true, repeatCount: 7 });
    const locked = render(<PlayerScreen />);
    fireEvent.press(locked.getByTestId('mock-seek'));
    await act(async () => {});
    expect(seekMock).not.toHaveBeenCalled();

    act(() => useSettingsStore.setState({ isSyncMode: false }));
    setSettings({ isCareMode: false, isSyncMode: false, repeatCount: 7 });
    mockedTrackPlayer.getActiveTrack.mockResolvedValueOnce({ id: TRACKS[1].id } as never);
    fireEvent.press(locked.getByTestId('mock-seek'));
    await act(async () => {});
    expect(seekMock).not.toHaveBeenCalled();
  });

  it('上下首调用用户切歌，失败时记录并停止期望播放', async () => {
    nextMock.mockRejectedValueOnce(new Error('next failed'));
    previousMock.mockRejectedValueOnce(new Error('previous failed'));
    saveExpectedPlaying(true);
    const { getByTestId } = render(<PlayerScreen />);
    fireEvent.press(getByTestId('next'));
    fireEvent.press(getByTestId('previous'));

    await waitFor(() => expect(nextMock).toHaveBeenCalledWith('user'));
    expect(previousMock).toHaveBeenCalledWith('user');
    expect(loadExpectedPlaying()).toBe(false);
    expect(addLog).toHaveBeenCalledWith('ERROR', 'UI:skipNext failed', expect.any(Error));
    expect(addLog).toHaveBeenCalledWith('ERROR', 'UI:skipPrevious failed', expect.any(Error));
  });

  it('原生换曲和进入后台都会保存权威索引及播放模式', async () => {
    let appStateHandler: ((state: string) => void) | undefined;
    const appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      handler: (state: string) => void,
    ) => {
      appStateHandler = handler;
      return { remove: jest.fn() };
    }) as any);
    render(<PlayerScreen />);

    await act(async () => {
      await mockedTrackPlayer.__emit(Event.PlaybackActiveTrackChanged, {});
    });
    expect(loadPlayerState()).toEqual({ trackIndex: 0, playMode: 'repeat-one' });

    await act(async () => {
      appStateHandler?.('background');
      await Promise.resolve();
    });
    expect(loadPlayerState()).toEqual({ trackIndex: 0, playMode: 'repeat-one' });
    appStateSpy.mockRestore();
  });
});
