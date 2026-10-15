/* eslint-disable @typescript-eslint/no-var-requires */
import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import Controls, { ControlsProps } from '@/components/Controls';
import {
  PlayerLayoutProps,
  PortraitPlayerLayout,
  WidePlayerLayout,
} from '@/components/PlayerLayouts';
import ProgressBar, { ProgressBarProps } from '@/components/ProgressBar';
import TrackInfo from '@/components/TrackInfo';
import { TRACKS } from '@/constants/tracks';
import { getPlayerLayout } from '@/utils/playerLayout';

jest.mock('@/components/VinylRecord', () => {
  const ReactModule = require('react');
  const { Text: NativeText } = require('react-native');
  return ({ isPlaying, size }: { isPlaying: boolean; size: number }) =>
    ReactModule.createElement(NativeText, { testID: 'layout-vinyl' }, `vinyl:${isPlaying}:${size}`);
});

const progressProps = (): ProgressBarProps => ({
  position: 17,
  duration: 83,
  onSeek: jest.fn(),
  currentRepeat: 39,
  totalRepeat: 5_000_000,
  seekable: true,
});

const controlsProps = (): ControlsProps => ({
  isPlaying: false,
  playMode: 'repeat-all',
  isSyncMode: true,
  modeLabel: '列表循环',
  onPlayPause: jest.fn(),
  onSkipToNext: jest.fn(),
  onSkipToPrevious: jest.fn(),
  onToggleMode: jest.fn(),
  onToggleSync: jest.fn(),
});

const playerProps = (
  layout: PlayerLayoutProps['layout'],
  isCareMode = false,
): PlayerLayoutProps => ({
  layout,
  track: TRACKS[4],
  isPlaying: true,
  isCareMode,
  progressProps: progressProps(),
  controlsProps: controlsProps(),
});

const expectedControlSizes = (layout: PlayerLayoutProps['layout']) => ({
  playButton: layout.playButtonSize,
  playIcon: layout.playIconSize,
  skipIcon: layout.sideIconSize,
  functionIcon: layout.functionIconSize,
});

describe('PlayerLayouts', () => {
  it('竖屏布局透传曲目、进度和控制属性，并强制使用横向结构', () => {
    const layout = getPlayerLayout(390, 844);
    const props = playerProps(layout);
    const { getByTestId, getByText, UNSAFE_getByType } = render(
      <PortraitPlayerLayout {...props} />,
    );

    expect(getByTestId('player-layout-portrait')).toBeTruthy();
    expect(getByText('列表循环')).toBeTruthy();

    expect(UNSAFE_getByType(TrackInfo).props).toMatchObject({
      track: props.track,
      isPlaying: true,
      isCareMode: false,
      variant: 'stacked',
      vinylSize: layout.vinylSize,
      titleFontSize: layout.titleFontSize,
    });
    expect(UNSAFE_getByType(ProgressBar).props).toMatchObject({
      ...props.progressProps,
      orientation: 'horizontal',
    });
    expect(UNSAFE_getByType(Controls).props).toMatchObject({
      ...props.controlsProps,
      orientation: 'row',
      height: layout.controlRowHeight,
      sizes: expectedControlSizes(layout),
      modeLabelPlacement: 'external',
    });
  });

  it.each([
    ['square', 1024, 768],
    ['landscape', 1280, 700],
  ] as const)('%s 布局左右槽等宽，控制、唱片和进度共用整高结构', (mode, width, height) => {
    const layout = getPlayerLayout(width, height);
    const props = playerProps(layout);
    const { getByTestId, UNSAFE_getByType } = render(<WidePlayerLayout {...props} />);

    expect(layout.mode).toBe(mode);
    const rootStyle = StyleSheet.flatten(getByTestId(`player-layout-${mode}`).props.style);
    const leftStyle = StyleSheet.flatten(getByTestId('left-side-slot').props.style);
    const rightStyle = StyleSheet.flatten(getByTestId('right-side-slot').props.style);
    const trackNode = UNSAFE_getByType(TrackInfo);
    const centerStyle = StyleSheet.flatten(trackNode.parent?.props.style);

    expect(rootStyle).toMatchObject({
      flexDirection: 'row',
      alignItems: 'stretch',
      maxWidth: layout.contentMaxWidth,
    });
    expect(leftStyle).toMatchObject({ width: layout.sideSlot, height: '100%' });
    expect(rightStyle).toMatchObject({ width: layout.sideSlot, height: '100%' });
    expect(leftStyle.width).toBe(rightStyle.width);
    expect(centerStyle).toMatchObject({
      flex: 1,
      minWidth: 0,
      height: '100%',
      marginHorizontal: layout.contentGap,
    });
  });

  it.each([
    ['square', 1024, 768],
    ['landscape', 1280, 700],
  ] as const)(
    '%s 布局完整透传 props，并强制采用 rail、stage、vertical 组合',
    (_mode, width, height) => {
      const layout = getPlayerLayout(width, height);
      const props = playerProps(layout);
      const { UNSAFE_getByType } = render(<WidePlayerLayout {...props} />);

      expect(UNSAFE_getByType(TrackInfo).props).toMatchObject({
        track: props.track,
        isPlaying: true,
        isCareMode: false,
        variant: 'stage',
        vinylSize: layout.vinylSize,
        titleFontSize: layout.titleFontSize,
      });
      expect(UNSAFE_getByType(ProgressBar).props).toMatchObject({
        ...props.progressProps,
        orientation: 'vertical',
      });
      expect(UNSAFE_getByType(Controls).props).toMatchObject({
        ...props.controlsProps,
        orientation: 'rail',
        sizes: expectedControlSizes(layout),
        modeLabelPlacement: 'external',
      });
    },
  );

  it.each(['portrait', 'wide'] as const)('关怀模式在 %s 布局隐藏外置模式提示', variant => {
    const layout =
      variant === 'portrait' ? getPlayerLayout(390, 844, true) : getPlayerLayout(1280, 700, true);
    const props = playerProps(layout, true);
    const Component = variant === 'portrait' ? PortraitPlayerLayout : WidePlayerLayout;
    const { queryByTestId, UNSAFE_getByType } = render(<Component {...props} />);

    expect(queryByTestId('mode-toast')).toBeNull();
    expect(UNSAFE_getByType(TrackInfo).props.isCareMode).toBe(true);
  });

  it('没有模式提示文案时不渲染空提示框', () => {
    const layout = getPlayerLayout(1024, 768);
    const props = playerProps(layout);
    props.controlsProps.modeLabel = null;
    const { queryByTestId } = render(<WidePlayerLayout {...props} />);
    expect(queryByTestId('mode-toast')).toBeNull();
  });
});
