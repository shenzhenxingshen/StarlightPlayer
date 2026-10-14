import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Pressable } from 'react-native';
import Controls, { MODE_CONFIG } from '@/components/Controls';

const callbacks = () => ({
  onPlayPause: jest.fn(),
  onSkipToNext: jest.fn(),
  onSkipToPrevious: jest.fn(),
  onToggleMode: jest.fn(),
  onToggleSync: jest.fn(),
});

describe('<Controls />', () => {
  it('四种模式配置形成完整闭环', () => {
    let mode = 'repeat-one' as const;
    const visited: string[] = [];
    for (let i = 0; i < 4; i++) {
      visited.push(mode);
      mode = MODE_CONFIG[mode].next as typeof mode;
    }
    expect(visited).toEqual(['repeat-one', 'play-one', 'repeat-all', 'play-all']);
    expect(mode).toBe('repeat-one');
  });

  it('普通模式的五个操作分别触发正确回调并显示提示', () => {
    const handlers = callbacks();
    const { UNSAFE_getAllByType, getByText } = render(
      <Controls
        {...handlers}
        isPlaying={false}
        playMode="repeat-all"
        isSyncMode={true}
        modeLabel="列表循环"
      />,
    );

    expect(getByText('列表循环')).toBeTruthy();
    const buttons = UNSAFE_getAllByType(Pressable);
    expect(buttons).toHaveLength(5);
    buttons.forEach(button => fireEvent.press(button));
    expect(handlers.onToggleMode).toHaveBeenCalledTimes(1);
    expect(handlers.onToggleSync).toHaveBeenCalledTimes(1);
    expect(handlers.onSkipToPrevious).toHaveBeenCalledTimes(1);
    expect(handlers.onPlayPause).toHaveBeenCalledTimes(1);
    expect(handlers.onSkipToNext).toHaveBeenCalledTimes(1);
  });

  it('关怀模式只保留放大的播放/暂停按钮', () => {
    const handlers = callbacks();
    const { UNSAFE_getAllByType, queryByText } = render(
      <Controls
        {...handlers}
        isPlaying={true}
        playMode="play-one"
        isSyncMode={false}
        modeLabel="不应显示"
        isCareMode
      />,
    );

    const buttons = UNSAFE_getAllByType(Pressable);
    expect(buttons).toHaveLength(1);
    fireEvent.press(buttons[0]);
    expect(handlers.onPlayPause).toHaveBeenCalledTimes(1);
    expect(handlers.onToggleMode).not.toHaveBeenCalled();
    expect(queryByText('不应显示')).toBeNull();
  });
});
