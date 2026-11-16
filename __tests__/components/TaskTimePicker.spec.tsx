import React, { useState } from 'react';
import { Dimensions } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import TaskTimePicker from '@/components/TaskTimePicker';

const initial = { hour: 8, minute: 0, second: 0 };
const event = (rows: number, height = 48) => ({
  nativeEvent: { contentOffset: { x: 0, y: rows * height } },
});
const setFontScale = (fontScale: number) =>
  Dimensions.set({
    window: { width: 390, height: 844, scale: 3, fontScale },
    screen: { width: 390, height: 844, scale: 3, fontScale },
  });

function setup() {
  const change = jest.fn();
  const moving = jest.fn();
  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <TaskTimePicker
        value={value}
        onChange={next => {
          setValue(next);
          change(next);
        }}
        onScrollingChange={moving}
      />
    );
  }
  const screen = render(<Harness />);
  const wheel = (part: string) =>
    screen.getByTestId(`task-${part}-wheel`, { includeHiddenElements: true });
  return { ...screen, wheel, change, moving };
}

beforeEach(() => {
  jest.useFakeTimers();
  setFontScale(1);
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('任务时间拨轮收尾与边界', () => {
  it('短拖动没有惯性结束事件时，200ms后吸附并解除保存锁定', () => {
    const screen = setup();
    const wheel = screen.wheel('second');
    fireEvent(wheel, 'scrollBeginDrag');
    fireEvent.scroll(wheel, event(7.6));
    fireEvent(wheel, 'scrollEndDrag', event(7.6));
    act(() => jest.advanceTimersByTime(199));
    expect(screen.moving).toHaveBeenLastCalledWith(true);
    act(() => jest.advanceTimersByTime(1));
    expect(screen.moving).toHaveBeenLastCalledWith(false);
    expect(screen.change).toHaveBeenLastCalledWith({ ...initial, second: 8 });
  });

  it('惯性开始取消短拖动计时，持续滚动重新延后兜底并保留最终值', () => {
    const screen = setup();
    const wheel = screen.wheel('minute');
    fireEvent(wheel, 'scrollBeginDrag');
    fireEvent(wheel, 'scrollEndDrag', event(10));
    fireEvent(wheel, 'momentumScrollBegin');
    act(() => jest.advanceTimersByTime(200));
    expect(screen.moving).toHaveBeenLastCalledWith(true);
    for (const value of [20, 35, 48, 58.7]) {
      fireEvent.scroll(wheel, event(value));
      act(() => jest.advanceTimersByTime(100));
      expect(screen.moving).toHaveBeenLastCalledWith(true);
    }
    fireEvent(wheel, 'momentumScrollEnd', event(59));
    expect(screen.moving).toHaveBeenLastCalledWith(false);
    expect(screen.change).toHaveBeenLastCalledWith({ ...initial, minute: 59 });
    const callCount = screen.change.mock.calls.length;
    act(() => jest.advanceTimersByTime(300));
    expect(screen.change).toHaveBeenCalledTimes(callCount);
  });

  it('两列同时移动时必须都停稳才解除保存锁定，且不覆盖另一列', () => {
    const screen = setup();
    const hour = screen.wheel('hour');
    const second = screen.wheel('second');
    fireEvent(hour, 'scrollBeginDrag');
    fireEvent(second, 'scrollBeginDrag');
    fireEvent.scroll(hour, event(23));
    fireEvent.scroll(second, event(59));
    fireEvent(hour, 'scrollEndDrag', event(23));
    fireEvent(hour, 'momentumScrollEnd', event(23));
    expect(screen.moving).toHaveBeenLastCalledWith(true);
    fireEvent(second, 'scrollEndDrag', event(59));
    act(() => jest.advanceTimersByTime(200));
    expect(screen.moving).toHaveBeenLastCalledWith(false);
    expect(screen.change).toHaveBeenLastCalledWith({ hour: 23, minute: 0, second: 59 });
  });

  it.each([0.8, 1, 2, 3])('字体倍率%s时按实际行高吸附，行高上限为96', fontScale => {
    setFontScale(fontScale);
    const screen = setup();
    const wheel = screen.wheel('minute');
    const height = 48 * Math.max(1, Math.min(2, fontScale));
    expect(wheel.props.snapToInterval).toBe(height);
    fireEvent(wheel, 'scrollBeginDrag');
    fireEvent.scroll(wheel, event(12.5, height));
    fireEvent(wheel, 'scrollEndDrag', event(12.5, height));
    fireEvent(wheel, 'momentumScrollEnd', event(12.5, height));
    expect(screen.change).toHaveBeenLastCalledWith({ ...initial, minute: 13 });
  });

  it('外部值更新不会改写初始contentOffset，选中值仍跟随受控值', () => {
    const onChange = jest.fn();
    const onScrollingChange = jest.fn();
    const screen = render(
      <TaskTimePicker value={initial} onChange={onChange} onScrollingChange={onScrollingChange} />,
    );
    const offset = screen.getByTestId('task-hour-wheel', { includeHiddenElements: true }).props
      .contentOffset;
    screen.rerender(
      <TaskTimePicker
        value={{ hour: 23, minute: 59, second: 59 }}
        onChange={onChange}
        onScrollingChange={onScrollingChange}
      />,
    );
    expect(screen.getByLabelText('启动时').props.accessibilityValue.now).toBe(23);
    expect(
      screen.getByTestId('task-hour-wheel', { includeHiddenElements: true }).props.contentOffset,
    ).toBe(offset);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('卸载时清除待吸附计时，不在退出编辑页后继续回调', () => {
    const screen = setup();
    const wheel = screen.wheel('second');
    fireEvent(wheel, 'scrollBeginDrag');
    fireEvent(wheel, 'scrollEndDrag', event(5));
    screen.unmount();
    screen.change.mockClear();
    screen.moving.mockClear();
    act(() => jest.advanceTimersByTime(300));
    expect(screen.change).not.toHaveBeenCalled();
    expect(screen.moving).not.toHaveBeenCalled();
  });
});
