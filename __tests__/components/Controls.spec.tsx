import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, StyleSheet } from 'react-native';
import Controls, { MODE_CONFIG, PlayMode } from '@/components/Controls';

const callbacks = () => ({
  onPlayPause: jest.fn(),
  onSkipToNext: jest.fn(),
  onSkipToPrevious: jest.fn(),
  onToggleMode: jest.fn(),
  onToggleSync: jest.fn(),
});

const normalProps = () => ({
  ...callbacks(),
  isPlaying: false,
  playMode: 'repeat-all' as const,
  isSyncMode: true,
  modeLabel: '列表循环',
});

const orderedButtonIds = [
  'play-mode-button',
  'previous-button',
  'play-pause-button',
  'next-button',
  'sync-button',
];

describe('<Controls />', () => {
  it('四种模式配置形成完整闭环，并为每种模式提供图标和文案', () => {
    let mode: PlayMode = 'repeat-one';
    const visited: PlayMode[] = [];
    for (let index = 0; index < 4; index += 1) {
      visited.push(mode);
      expect(MODE_CONFIG[mode].icon).toEqual(expect.any(String));
      expect(MODE_CONFIG[mode].label).toEqual(expect.any(String));
      mode = MODE_CONFIG[mode].next;
    }
    expect(visited).toEqual(['repeat-one', 'play-one', 'repeat-all', 'play-all']);
    expect(mode).toBe('repeat-one');
  });

  it.each([
    ['row', 'controls-row', 'row'],
    ['rail', 'controls-rail', 'column'],
  ] as const)(
    '%s 布局都保持模式、上一首、播放、下一首、同步的操作顺序',
    (orientation, containerId, flexDirection) => {
      const props = normalProps();
      const { getByTestId, UNSAFE_getAllByType } = render(
        <Controls {...props} orientation={orientation} />,
      );

      expect(UNSAFE_getAllByType(Pressable).map(button => button.props.testID)).toEqual(
        orderedButtonIds,
      );
      expect(StyleSheet.flatten(getByTestId(containerId).props.style)).toMatchObject({
        flexDirection,
        alignItems: 'center',
      });
    },
  );

  it('五个按钮分别触发正确回调', () => {
    const props = normalProps();
    const { getByTestId } = render(<Controls {...props} />);

    fireEvent.press(getByTestId('play-mode-button'));
    fireEvent.press(getByTestId('previous-button'));
    fireEvent.press(getByTestId('play-pause-button'));
    fireEvent.press(getByTestId('next-button'));
    fireEvent.press(getByTestId('sync-button'));

    expect(props.onToggleMode).toHaveBeenCalledTimes(1);
    expect(props.onSkipToPrevious).toHaveBeenCalledTimes(1);
    expect(props.onPlayPause).toHaveBeenCalledTimes(1);
    expect(props.onSkipToNext).toHaveBeenCalledTimes(1);
    expect(props.onToggleSync).toHaveBeenCalledTimes(1);
  });

  it('播放状态、同步状态和当前模式均具有明确的无障碍语义', () => {
    const props = normalProps();
    const { getByTestId, rerender } = render(<Controls {...props} />);

    expect(getByTestId('play-mode-button').props).toMatchObject({
      accessibilityRole: 'button',
      accessibilityLabel: '切换播放模式，当前列表循环',
      accessibilityState: { selected: false },
      hitSlop: 8,
    });
    expect(getByTestId('play-pause-button').props).toMatchObject({
      accessibilityLabel: '播放',
      accessibilityState: { selected: false },
      hasTVPreferredFocus: true,
    });
    expect(getByTestId('sync-button').props).toMatchObject({
      accessibilityLabel: '关闭同步播放',
      accessibilityState: { selected: true },
    });

    rerender(<Controls {...props} isPlaying isSyncMode={false} />);
    expect(getByTestId('play-pause-button').props).toMatchObject({
      accessibilityLabel: '暂停',
      accessibilityState: { selected: true },
    });
    expect(getByTestId('sync-button').props).toMatchObject({
      accessibilityLabel: '开启同步播放',
      accessibilityState: { selected: false },
    });
  });

  it('获得和失去电视焦点时切换清晰的焦点样式', () => {
    const { getByTestId, UNSAFE_getAllByType } = render(<Controls {...normalProps()} />);
    const previousButton = UNSAFE_getAllByType(Pressable).find(
      button => button.props.testID === 'previous-button',
    );
    expect(previousButton).toBeDefined();

    act(() => previousButton?.props.onFocus());
    expect(StyleSheet.flatten(getByTestId('previous-button').props.style)).toMatchObject({
      borderWidth: 3,
      transform: [{ scale: 1.08 }],
    });

    act(() => previousButton?.props.onBlur());
    expect(
      StyleSheet.flatten(getByTestId('previous-button').props.style).borderWidth,
    ).toBeUndefined();
  });

  it('内联模式提示可见，external 模式由外层布局统一显示', () => {
    const props = normalProps();
    const { getByText, queryByText, rerender } = render(<Controls {...props} />);
    expect(getByText('列表循环')).toBeTruthy();

    rerender(<Controls {...props} modeLabelPlacement="external" />);
    expect(queryByText('列表循环')).toBeNull();

    rerender(<Controls {...props} modeLabel={null} />);
    expect(queryByText('列表循环')).toBeNull();
  });

  it('关怀模式只保留放大的播放按钮，并使用传入的显式尺寸', () => {
    const props = normalProps();
    const { getByTestId, queryByTestId, queryByText, UNSAFE_getAllByType } = render(
      <Controls
        {...props}
        isPlaying
        isCareMode
        orientation="rail"
        height={180}
        sizes={{ playButton: 96, playIcon: 70 }}
      />,
    );

    expect(UNSAFE_getAllByType(Pressable)).toHaveLength(1);
    expect(queryByTestId('play-mode-button')).toBeNull();
    expect(queryByTestId('sync-button')).toBeNull();
    expect(queryByText('列表循环')).toBeNull();
    expect(StyleSheet.flatten(getByTestId('controls-rail').props.style)).toMatchObject({
      height: 180,
      justifyContent: 'center',
    });
    expect(StyleSheet.flatten(getByTestId('play-pause-button').props.style)).toMatchObject({
      width: 96,
      height: 96,
      borderRadius: 48,
    });
    expect(getByTestId('play-pause-button').props).toMatchObject({
      accessibilityLabel: '暂停',
      accessibilityState: { selected: true },
      hasTVPreferredFocus: true,
    });

    fireEvent.press(getByTestId('play-pause-button'));
    expect(props.onPlayPause).toHaveBeenCalledTimes(1);
    expect(props.onToggleMode).not.toHaveBeenCalled();
    expect(props.onToggleSync).not.toHaveBeenCalled();
    expect(props.onSkipToPrevious).not.toHaveBeenCalled();
    expect(props.onSkipToNext).not.toHaveBeenCalled();
  });

  it('横向关怀模式使用默认大尺寸并支持未播放状态', () => {
    const { getByTestId } = render(<Controls {...normalProps()} isCareMode />);
    expect(StyleSheet.flatten(getByTestId('play-pause-button').props.style)).toMatchObject({
      width: 112,
      height: 112,
      borderRadius: 56,
    });
    expect(getByTestId('play-pause-button').props).toMatchObject({
      accessibilityLabel: '播放',
      accessibilityState: { selected: false },
    });
  });

  it('异常播放模式在运行时安全回退为单曲循环', () => {
    const props = normalProps();
    const { getByTestId } = render(<Controls {...props} playMode={'unknown' as PlayMode} />);
    expect(getByTestId('play-mode-button').props.accessibilityLabel).toBe(
      '切换播放模式，当前单曲循环',
    );
  });
});
