import React from 'react';
import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import ProgressBar from '@/components/ProgressBar';

const responderEvent = (locationX: number) => ({
  nativeEvent: { locationX },
  touchHistory: {
    numberActiveTouches: 1,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: 1,
    touchBank: [
      {
        touchActive: true,
        currentTimeStamp: 1,
        currentPageX: locationX,
        currentPageY: 0,
        previousPageX: 0,
        previousPageY: 0,
      },
    ],
  },
});

describe('<ProgressBar />', () => {
  it('显示当前位置和总时长', () => {
    const { getByText } = render(<ProgressBar position={65} duration={180} onSeek={() => {}} />);
    expect(getByText('1:05')).toBeTruthy();
    expect(getByText('3:00')).toBeTruthy();
  });

  it('当前遍数在时间信息之前，总遍数在时间信息之后', () => {
    const { getByText, UNSAFE_getAllByType } = render(
      <ProgressBar
        position={0}
        duration={60}
        onSeek={() => {}}
        currentRepeat={2}
        totalRepeat={7}
      />,
    );
    expect(getByText('当前遍数：2')).toBeTruthy();
    expect(getByText('每首重复遍数：7')).toBeTruthy();
    const labels = UNSAFE_getAllByType(Text).map(node => node.props.children);
    expect(labels[0]).toEqual(['当前遍数：', '2']);
    expect(labels[labels.length - 1]).toEqual(['每首重复遍数：', '7']);
  });

  it('可只显示当前遍数，不显示每首重复遍数', () => {
    const { getByText, queryByText } = render(
      <ProgressBar position={0} duration={60} onSeek={() => {}} currentRepeat={12} />,
    );
    expect(getByText('当前遍数：12')).toBeTruthy();
    expect(queryByText(/每首重复遍数/)).toBeNull();
  });

  it('大遍数完整渲染', () => {
    const { getByText } = render(
      <ProgressBar
        position={0}
        duration={60}
        onSeek={() => {}}
        currentRepeat={4_999_999}
        totalRepeat={5_000_000}
      />,
    );
    expect(getByText('当前遍数：4,999,999')).toBeTruthy();
    expect(getByText('每首重复遍数：5,000,000')).toBeTruthy();
  });

  it('关怀模式不显示遍数', () => {
    const { queryByText } = render(
      <ProgressBar
        position={0}
        duration={60}
        onSeek={() => {}}
        currentRepeat={2}
        totalRepeat={7}
        isCareMode={true}
      />,
    );
    expect(queryByText('当前遍数：2')).toBeNull();
    expect(queryByText('每首重复遍数：7')).toBeNull();
  });

  it('duration 为 0 时位置文本依然渲染', () => {
    const { getAllByText } = render(<ProgressBar position={0} duration={0} onSeek={() => {}} />);
    expect(getAllByText('0:00')).toHaveLength(2);
  });

  it('拖动过程中只预览，松手时仅提交一次最终 seek', () => {
    const onSeek = jest.fn();
    const { getByTestId } = render(
      <ProgressBar position={0} duration={100} onSeek={onSeek} seekable={true} />,
    );
    const area = getByTestId('progress-seek-area');
    act(() => {
      area.props.onLayout({ nativeEvent: { layout: { width: 100 } } });
    });
    const event = responderEvent(80);
    act(() => {
      area.props.onResponderGrant(event);
    });
    expect(onSeek).not.toHaveBeenCalled();

    act(() => {
      area.props.onResponderRelease(event);
    });
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(80);
  });

  it('拖动期间切换为不可 seek 时，松手不会提交旧位置', () => {
    const onSeek = jest.fn();
    const { getByTestId, rerender } = render(
      <ProgressBar position={0} duration={100} onSeek={onSeek} seekable={true} />,
    );
    const area = getByTestId('progress-seek-area');
    const event = responderEvent(80);
    act(() => {
      area.props.onLayout({ nativeEvent: { layout: { width: 100 } } });
      area.props.onResponderGrant(event);
    });

    rerender(<ProgressBar position={0} duration={100} onSeek={onSeek} seekable={false} />);
    act(() => {
      area.props.onResponderRelease(event);
    });

    expect(onSeek).not.toHaveBeenCalled();
  });

  it('响应条件依赖可拖动状态、有效时长和布局宽度', () => {
    const { getByTestId, rerender } = render(
      <ProgressBar position={0} duration={100} onSeek={() => {}} seekable={true} />,
    );
    let area = getByTestId('progress-seek-area');
    const event = responderEvent(10);
    expect(area.props.onStartShouldSetResponder(event)).toBe(false);
    expect(area.props.onMoveShouldSetResponder(event)).toBe(false);

    act(() => {
      area.props.onLayout({ nativeEvent: { layout: { width: 100 } } });
    });
    expect(area.props.onStartShouldSetResponder(event)).toBe(true);
    expect(area.props.onMoveShouldSetResponder(event)).toBe(true);

    rerender(<ProgressBar position={0} duration={0} onSeek={() => {}} seekable={true} />);
    area = getByTestId('progress-seek-area');
    expect(area.props.onStartShouldSetResponder(event)).toBe(false);
  });

  it('移动时夹紧预览位置，取消手势会恢复且不提交 seek', () => {
    const onSeek = jest.fn();
    const { getByTestId, getByText, getAllByText } = render(
      <ProgressBar position={20} duration={100} onSeek={onSeek} seekable={true} />,
    );
    const area = getByTestId('progress-seek-area');
    act(() => {
      area.props.onLayout({ nativeEvent: { layout: { width: 100 } } });
      area.props.onResponderGrant(responderEvent(-10));
      area.props.onResponderMove(responderEvent(150));
    });
    expect(getAllByText('1:40')).toHaveLength(2);

    act(() => {
      area.props.onResponderTerminate();
    });
    expect(getByText('0:20')).toBeTruthy();
    expect(onSeek).not.toHaveBeenCalled();

    act(() => {
      area.props.onResponderRelease(responderEvent(50));
    });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('不可拖动时 grant 和 move 都安全忽略', () => {
    const onSeek = jest.fn();
    const { getByTestId } = render(
      <ProgressBar position={0} duration={100} onSeek={onSeek} seekable={false} />,
    );
    const area = getByTestId('progress-seek-area');
    act(() => {
      area.props.onLayout({ nativeEvent: { layout: { width: 100 } } });
      area.props.onResponderGrant(responderEvent(50));
      area.props.onResponderMove(responderEvent(60));
      area.props.onResponderRelease(responderEvent(60));
    });
    expect(onSeek).not.toHaveBeenCalled();
  });
});
