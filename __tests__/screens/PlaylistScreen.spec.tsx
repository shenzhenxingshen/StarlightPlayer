import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SectionList } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import { State, useActiveTrack, usePlaybackState } from 'react-native-track-player';
import PlaylistScreen from '@/screens/PlaylistScreen';
import { TRACKS } from '@/constants/tracks';
import { useSettingsStore } from '@/store/settingsStore';
import { loadExpectedPlaying, saveExpectedPlaying } from '@/utils/storage';
import { loadTrackAndPlay } from '@/utils/trackManager';
import { addLog } from '@/utils/logger';

jest.mock('@/utils/trackManager', () => ({ loadTrackAndPlay: jest.fn() }));
jest.mock('@/utils/logger', () => ({ addLog: jest.fn() }));

const activeTrackHook = useActiveTrack as jest.Mock;
const playbackStateHook = usePlaybackState as jest.Mock;
const loadTrackAndPlayMock = loadTrackAndPlay as jest.Mock;

describe('<PlaylistScreen />', () => {
  beforeEach(() => {
    (new MMKV() as any).clearAll();
    useSettingsStore.setState({ isCareMode: false, isSyncMode: false, repeatCount: 1 });
    activeTrackHook.mockReturnValue({ id: TRACKS[0].id });
    playbackStateHook.mockReturnValue({ state: State.Playing });
    loadTrackAndPlayMock.mockReset().mockResolvedValue(undefined);
  });

  it('渲染四个分区、全部曲目并标出正在播放曲目', () => {
    const { getByText, UNSAFE_getByType } = render(<PlaylistScreen />);
    const sections = UNSAFE_getByType(SectionList).props.sections;
    expect(sections.map((section: any) => section.title)).toEqual([
      '大悲咒系列',
      '仪轨回向',
      '佛号圣号',
      '经典歌曲',
    ]);
    expect(sections.flatMap((section: any) => section.data)).toHaveLength(TRACKS.length);
    expect(getByText('大悲咒系列')).toBeTruthy();
    expect(getByText('仪轨回向')).toBeTruthy();
    expect(getByText(TRACKS[0].title)).toBeTruthy();
  });

  it('点击曲目按全局索引创建新的用户播放任务', async () => {
    const { getByText } = render(<PlaylistScreen />);
    fireEvent.press(getByText(TRACKS[4].title));
    await waitFor(() => expect(loadTrackAndPlayMock).toHaveBeenCalledWith(4, 'user'));
  });

  it('切歌失败时清除期望播放状态并记录日志', async () => {
    saveExpectedPlaying(true);
    loadTrackAndPlayMock.mockRejectedValueOnce(new Error('load failed'));
    const { getByText } = render(<PlaylistScreen />);
    fireEvent.press(getByText(TRACKS[1].title));

    await waitFor(() => expect(loadExpectedPlaying()).toBe(false));
    expect(addLog).toHaveBeenCalledWith('ERROR', 'Playlist:loadTrack(1) failed', expect.any(Error));
  });
});
