import React from 'react';
import { act, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import ProgressBar, { formatPlaybackTime } from '@/components/ProgressBar';

const responderEvent = (locationX: number, locationY = 0) => ({
  nativeEvent: { locationX, locationY },
  touchHistory: {
    numberActiveTouches: 1,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: 1,
    touchBank: [
      {
        touchActive: true,
        currentTimeStamp: 1,
        currentPageX: locationX,
        currentPageY: locationY,
        previousPageX: 0,
        previousPageY: 0,
      },
    ],
  },
});

const accessibilityAction = (actionName: string) => ({
  nativeEvent: { actionName },
});

describe('<ProgressBar />', () => {
  it('显示当前位置、总时长和准确的进度比例', () => {
    const { getByTestId } = render(<ProgressBar position={65} duration={180} onSeek={() => {}} />);
    expect(getByTestId('current-time').props.children).toBe('1:05');
    expect(getByTestId('duration-time').props.children).toBe('3:00');
    expect(StyleSheet.flatten(getByTestId('progress-fill').props.style).width).toBe(
      `${(65 / 180) * 100}%`,
    );
  });

  it('遍数在视觉上只显示数字，但保留完整中文无障碍释义', () => {
    const { getByTestId, queryByText } = render(
      <ProgressBar
        position={0}
        duration={60}
        onSeek={() => {}}
        currentRepeat={2}
        totalRepeat={7}
      />,
    );

    expect(getByTestId('current-repeat').props).toMatchObject({
      children: '2',
      accessibilityLabel: '当前遍数：2',
    });
    expect(getByTestId('total-repeat').props).toMatchObject({
      children: '7',
      accessibilityLabel: '每首重复遍数：7',
    });
    expect(queryByText('当前遍数：2')).toBeNull();
    expect(queryByText('每首重复遍数：7')).toBeNull();
  });

  it('可只显示当前遍数，不显示总遍数', () => {
    const { getByTestId, queryByTestId } = render(
      <ProgressBar position={0} duration={60} onSeek={() => {}} currentRepeat={12} />,
    );
    expect(getByTestId('current-repeat').props.children).toBe('12');
    expect(queryByTestId('total-repeat')).toBeNull();
  });

  it('大遍数使用千分位且无障碍文案与可见数字一致', () => {
    const { getByTestId } = render(
      <ProgressBar
        position={0}
        duration={60}
        onSeek={() => {}}
        currentRepeat={4_999_999}
        totalRepeat={5_000_000}
      />,
    );
    expect(getByTestId('current-repeat').props).toMatchObject({
      children: '4,999,999',
      accessibilityLabel: '当前遍数：4,999,999',
    });
    expect(getByTestId('total-repeat').props).toMatchObject({
      children: '5,000,000',
      accessibilityLabel: '每首重复遍数：5,000,000',
    });
  });

  it('关怀模式隐藏两类遍数', () => {
    const { queryByTestId } = render(
      <ProgressBar
        position={0}
        duration={60}
        onSeek={() => {}}
        currentRepeat={2}
        totalRepeat={7}
        isCareMode
      />,
    );
    expect(queryByTestId('current-repeat')).toBeNull();
    expect(queryByTestId('total-repeat')).toBeNull();
  });

  it('垂直布局把遍数组放在时间轴左侧并按高度计算进度', () => {
    const { getByTestId } = render(
      <ProgressBar
        position={25}
        duration={100}
        onSeek={() => {}}
        currentRepeat={39}
        totalRepeat={5_000_000}
        orientation="vertical"
      />,
    );
    const repeatStack = within(getByTestId('repeat-stack'));
    expect(repeatStack.getByTestId('current-repeat').props.children).toBe('39');
    expect(repeatStack.getByTestId('total-repeat').props.children).toBe('5,000,000');
    expect(StyleSheet.flatten(getByTestId('progress-fill').props.style).height).toBe('25%');
    expect(getByTestId('current-time').props.children).toBe('0:25');
    expect(getByTestId('duration-time').props.children).toBe('1:40');
  });

  it('横向拖动仅预览，并在松手时提交一次最终位置', () => {
    const onSeek = jest.fn();
    const { getByTestId } = render(
      <ProgressBar position={0} duration={100} onSeek={onSeek} seekable />,
    );
    const area = getByTestId('progress-seek-area');
    act(() => {
      area.props.onLayout({ nativeEvent: { layout: { width: 200, height: 40 } } });
      expect(area.props.onStartShouldSetResponder(responderEvent(40))).toBe(true);
      expect(area.props.onMoveShouldSetResponder(responderEvent(40))).toBe(true);
      area.props.onResponderGrant(responderEvent(40));
      area.props.onResponderMove(responderEvent(160));
    });

    expect(getByTestId('current-time').props.children).toBe('1:20');
    expect(onSeek).not.toHaveBeenCalled();
    act(() => area.props.onResponderRelease(responderEvent(160)));
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(80);
  });

  it('垂直拖动只使用 Y 轴，忽略 X 坐标', () => {
    const onSeek = jest.fn();
    const { getByTestId } = render(
      <ProgressBar position={0} duration={120} onSeek={onSeek} seekable orientation="vertical" />,
    );
    const area = getByTestId('progress-seek-area');
    act(() => {
      area.props.onLayout({ nativeEvent: { layout: { width: 44, height: 240 } } });
      area.props.onResponderGrant(responderEvent(9_999, 60));
      area.props.onResponderMove(responderEvent(-9_999, 180));
    });
    expect(getByTestId('current-time').props.children).toBe('1:30');
    act(() => area.props.onResponderRelease(responderEvent(0, 180)));
    expect(onSeek).toHaveBeenCalledWith(90);
  });

  it('横向和纵向拖动都会把越界位置夹紧在 0 与 duration', () => {
    const horizontalSeek = jest.fn();
    const horizontal = render(
      <ProgressBar position={20} duration={100} onSeek={horizontalSeek} seekable />,
    );
    const horizontalArea = horizontal.getByTestId('progress-seek-area');
    act(() => {
      horizontalArea.props.onLayout({ nativeEvent: { layout: { width: 100, height: 20 } } });
      horizontalArea.props.onResponderGrant(responderEvent(-10));
      horizontalArea.props.onResponderRelease(responderEvent(-10));
      horizontalArea.props.onResponderGrant(responderEvent(150));
      horizontalArea.props.onResponderRelease(responderEvent(150));
    });
    expect(horizontalSeek.mock.calls).toEqual([[0], [100]]);
    horizontal.unmount();

    const verticalSeek = jest.fn();
    const vertical = render(
      <ProgressBar
        position={20}
        duration={100}
        onSeek={verticalSeek}
        seekable
        orientation="vertical"
      />,
    );
    const verticalArea = vertical.getByTestId('progress-seek-area');
    act(() => {
      verticalArea.props.onLayout({ nativeEvent: { layout: { width: 20, height: 100 } } });
      verticalArea.props.onResponderGrant(responderEvent(0, -10));
      verticalArea.props.onResponderRelease(responderEvent(0, -10));
      verticalArea.props.onResponderGrant(responderEvent(0, 150));
      verticalArea.props.onResponderRelease(responderEvent(0, 150));
    });
    expect(verticalSeek.mock.calls).toEqual([[0], [100]]);
  });

  it('切换方向会清除旧轴长和未提交拖动，不会用横轴数据处理纵向手势', () => {
    const onSeek = jest.fn();
    const { getByTestId, rerender } = render(
      <ProgressBar position={10} duration={100} onSeek={onSeek} seekable />,
    );
    let area = getByTestId('progress-seek-area');
    act(() => {
      area.props.onLayout({ nativeEvent: { layout: { width: 100, height: 20 } } });
      area.props.onResponderGrant(responderEvent(80, 1));
    });
    expect(getByTestId('current-time').props.children).toBe('1:20');

    rerender(
      <ProgressBar position={10} duration={100} onSeek={onSeek} seekable orientation="vertical" />,
    );
    area = getByTestId('progress-seek-area');
    expect(getByTestId('current-time').props.children).toBe('0:10');
    expect(area.props.onStartShouldSetResponder(responderEvent(80, 10))).toBe(false);
    act(() => area.props.onResponderRelease(responderEvent(80, 10)));
    expect(onSeek).not.toHaveBeenCalled();

    act(() => {
      area.props.onLayout({ nativeEvent: { layout: { width: 400, height: 200 } } });
      area.props.onResponderGrant(responderEvent(400, 50));
      area.props.onResponderRelease(responderEvent(400, 50));
    });
    expect(onSeek).toHaveBeenCalledWith(25);
  });

  it('不可拖动、无有效时长或尚未测量时均不接管手势', () => {
    const onSeek = jest.fn();
    const { getByTestId, rerender } = render(
      <ProgressBar position={0} duration={100} onSeek={onSeek} seekable={false} />,
    );
    let area = getByTestId('progress-seek-area');
    const event = responderEvent(50);
    act(() => area.props.onLayout({ nativeEvent: { layout: { width: 100, height: 20 } } }));
    expect(area.props.onStartShouldSetResponder(event)).toBe(false);
    expect(area.props.onMoveShouldSetResponder(event)).toBe(false);
    act(() => {
      area.props.onResponderGrant(event);
      area.props.onResponderMove(responderEvent(60));
      area.props.onResponderRelease(responderEvent(60));
    });
    expect(onSeek).not.toHaveBeenCalled();

    rerender(<ProgressBar position={0} duration={0} onSeek={onSeek} seekable />);
    area = getByTestId('progress-seek-area');
    expect(area.props.onStartShouldSetResponder(event)).toBe(false);

    rerender(
      <ProgressBar position={0} duration={100} onSeek={onSeek} seekable orientation="vertical" />,
    );
    area = getByTestId('progress-seek-area');
    expect(area.props.onStartShouldSetResponder(event)).toBe(false);
  });

  it('拖动期间变为不可 seek 时丢弃旧位置，取消手势也不提交', () => {
    const onSeek = jest.fn();
    const { getByTestId, rerender } = render(
      <ProgressBar position={20} duration={100} onSeek={onSeek} seekable />,
    );
    let area = getByTestId('progress-seek-area');
    act(() => {
      area.props.onLayout({ nativeEvent: { layout: { width: 100, height: 20 } } });
      area.props.onResponderGrant(responderEvent(80));
    });
    rerender(<ProgressBar position={20} duration={100} onSeek={onSeek} seekable={false} />);
    area = getByTestId('progress-seek-area');
    act(() => area.props.onResponderRelease(responderEvent(80)));
    expect(onSeek).not.toHaveBeenCalled();

    rerender(<ProgressBar position={20} duration={100} onSeek={onSeek} seekable />);
    area = getByTestId('progress-seek-area');
    act(() => {
      area.props.onLayout({ nativeEvent: { layout: { width: 100, height: 20 } } });
      area.props.onResponderGrant(responderEvent(60));
      area.props.onResponderTerminate();
      area.props.onResponderRelease(responderEvent(60));
    });
    expect(getByTestId('current-time').props.children).toBe('0:20');
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('使用最新的 onSeek 回调而不是首次渲染时的闭包', () => {
    const firstSeek = jest.fn();
    const latestSeek = jest.fn();
    const { getByTestId, rerender } = render(
      <ProgressBar position={0} duration={100} onSeek={firstSeek} seekable />,
    );
    rerender(<ProgressBar position={0} duration={100} onSeek={latestSeek} seekable />);
    const area = getByTestId('progress-seek-area');
    act(() => {
      area.props.onLayout({ nativeEvent: { layout: { width: 100, height: 20 } } });
      area.props.onResponderGrant(responderEvent(30));
      area.props.onResponderRelease(responderEvent(30));
    });
    expect(firstSeek).not.toHaveBeenCalled();
    expect(latestSeek).toHaveBeenCalledWith(30);
  });

  it('可拖动进度条提供标准无障碍增减动作，并按总时长的 5% 调整', () => {
    const onSeek = jest.fn();
    const { getByTestId } = render(
      <ProgressBar position={50} duration={200} onSeek={onSeek} seekable />,
    );
    const area = getByTestId('progress-seek-area');

    expect(area.props.accessibilityActions).toEqual([
      { name: 'increment' },
      { name: 'decrement' },
    ]);
    act(() => {
      area.props.onAccessibilityAction(accessibilityAction('increment'));
      area.props.onAccessibilityAction(accessibilityAction('decrement'));
      area.props.onAccessibilityAction(accessibilityAction('activate'));
    });

    expect(onSeek.mock.calls).toEqual([[60], [40]]);
  });

  it('纵向进度条共用无障碍动作，以至少 1 秒步长调整并夹紧边界', () => {
    const onSeek = jest.fn();
    const { getByTestId, rerender } = render(
      <ProgressBar
        position={0.25}
        duration={10}
        onSeek={onSeek}
        seekable
        orientation="vertical"
      />,
    );
    let area = getByTestId('progress-seek-area');
    act(() => {
      area.props.onAccessibilityAction(accessibilityAction('increment'));
      area.props.onAccessibilityAction(accessibilityAction('decrement'));
    });
    expect(onSeek.mock.calls).toEqual([[1.25], [0]]);

    onSeek.mockClear();
    rerender(
      <ProgressBar
        position={9.5}
        duration={10}
        onSeek={onSeek}
        seekable
        orientation="vertical"
      />,
    );
    area = getByTestId('progress-seek-area');
    act(() => area.props.onAccessibilityAction(accessibilityAction('increment')));
    expect(onSeek).toHaveBeenCalledWith(10);
  });

  it('锁定、无有效时长或已在端点时不执行无障碍 seek', () => {
    const onSeek = jest.fn();
    const { getByTestId, rerender } = render(
      <ProgressBar position={20} duration={100} onSeek={onSeek} seekable={false} />,
    );
    let area = getByTestId('progress-seek-area');
    expect(area.props.accessibilityActions).toBeUndefined();
    expect(area.props.onAccessibilityAction).toBeUndefined();

    rerender(<ProgressBar position={20} duration={0} onSeek={onSeek} seekable />);
    area = getByTestId('progress-seek-area');
    expect(area.props.accessibilityActions).toBeUndefined();
    expect(area.props.onAccessibilityAction).toBeUndefined();

    rerender(<ProgressBar position={0} duration={100} onSeek={onSeek} seekable />);
    area = getByTestId('progress-seek-area');
    act(() => area.props.onAccessibilityAction(accessibilityAction('decrement')));

    rerender(<ProgressBar position={100} duration={100} onSeek={onSeek} seekable />);
    area = getByTestId('progress-seek-area');
    act(() => area.props.onAccessibilityAction(accessibilityAction('increment')));
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('负数、NaN 和无穷时间统一安全归零，并提供可调节无障碍值', () => {
    expect(formatPlaybackTime(-1)).toBe('0:00');
    expect(formatPlaybackTime(Number.NaN)).toBe('0:00');
    expect(formatPlaybackTime(Number.POSITIVE_INFINITY)).toBe('0:00');

    const { getByTestId } = render(
      <ProgressBar
        position={Number.NaN}
        duration={Number.POSITIVE_INFINITY}
        onSeek={() => {}}
        seekable
      />,
    );
    expect(getByTestId('current-time').props.children).toBe('0:00');
    expect(getByTestId('duration-time').props.children).toBe('0:00');
    expect(getByTestId('progress-seek-area').props).toMatchObject({
      accessibilityRole: 'adjustable',
      accessibilityLabel: '播放进度，可拖动',
      accessibilityValue: { min: 0, max: 0, now: 0, text: '0:00 / 0:00' },
    });
  });

  it('位置超过总时长时视觉和无障碍当前值均夹紧到末尾', () => {
    const { getByTestId } = render(<ProgressBar position={150} duration={100} onSeek={() => {}} />);
    expect(StyleSheet.flatten(getByTestId('progress-fill').props.style).width).toBe('100%');
    expect(getByTestId('progress-seek-area').props).toMatchObject({
      accessibilityLabel: '播放进度，已锁定',
      accessibilityValue: { min: 0, max: 100, now: 100, text: '2:30 / 1:40' },
    });
  });
});
