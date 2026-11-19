import React from 'react';
import {
  AccessibilityInfo,
  Alert,
  BackHandler,
  Dimensions,
  NativeModules,
  StyleSheet,
} from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { MMKV } from 'react-native-mmkv';
import { defaultVideoTasks, activeOccurrence } from '../../packages/program-core/src/tasks';
import { VideoTaskEditScreen, VideoTaskListScreen } from '@/video/TaskScreens';
import VideoPlayer from '@/video/Player';
import { VIDEO_CATALOG } from '@/video/catalog';
import { loadVideoTasks, saveVideoSession } from '@/video/persistence';
import { useVideoTasks } from '@/video/taskStore';
import { useVideoState } from '@/video/runtime';
import { setVideoPlayerFocused, useVideoPresentation } from '@/video/presentation';
import { setMediaOwner } from '@/video/ownership';

const navigation = { navigate: jest.fn(), goBack: jest.fn(), getParent: jest.fn() };
const now = new Date(2026, 10, 19, 5, 40).getTime();
const viewport = (width: number, height: number, fontScale = 1) =>
  Dimensions.set({
    window: { width, height, scale: 3, fontScale },
    screen: { width, height, scale: 3, fontScale },
  });
beforeEach(() => {
  new MMKV().clearAll();
  jest.useFakeTimers();
  jest.setSystemTime(now);
  jest.clearAllMocks();
  useVideoTasks.setState({ tasks: defaultVideoTasks() });
  useVideoState.setState({ session: null, error: null });
  useVideoPresentation.setState({ fullscreen: false, focused: true });
  viewport(390, 844);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  NativeModules.VideoProgramPlayer.getStatus.mockResolvedValue({ playing: true, error: '' });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function edit() {
  return render(
    <VideoTaskEditScreen
      navigation={navigation as any}
      route={{ params: { taskId: 'video-default-49' } } as any}
    />,
  );
}

async function player() {
  const occurrence = activeOccurrence(defaultVideoTasks()[0], VIDEO_CATALOG, now)!;
  const session = { occurrence, intent: 'playing' as const };
  useVideoState.setState({ session });
  const screen = render(<VideoPlayer />);
  await act(async () => {});
  return { ...screen, session };
}

it('编辑名称、星期、重复次数和排序后保存，并保留默认98遍任务', () => {
  const screen = edit();
  fireEvent.changeText(screen.getByLabelText('视频任务名称'), '晚间验证');
  fireEvent.press(screen.getByLabelText('星期日'));
  fireEvent.changeText(screen.getByLabelText('第3项重复遍数'), '97');
  fireEvent.press(screen.getByLabelText('第3项上移'));
  fireEvent.press(screen.getByText('保存视频任务'));
  const task = loadVideoTasks()[0];
  expect(task.name).toBe('晚间验证');
  expect(task.weekdays).toEqual([1, 2, 3, 4, 5, 6]);
  expect(task.sequence[1]).toEqual({ assetId: 'regular', repeat: 97 });
  expect(loadVideoTasks()).toHaveLength(2);
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});

it('添加/移除素材，拒绝空遍数和空星期，不破坏保存内容', () => {
  const screen = edit();
  fireEvent.press(screen.getByText('添加视频片段'));
  fireEvent.press(screen.getByText('添加：98遍片头'));
  expect(screen.getByLabelText('第6项重复遍数')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('移除第6项'));
  fireEvent.press(screen.getByLabelText('编辑第3项'));
  fireEvent.changeText(screen.getByLabelText('第3项重复遍数'), '');
  fireEvent.press(screen.getByText('保存视频任务'));
  expect(Alert.alert).toHaveBeenCalled();
  expect(navigation.goBack).not.toHaveBeenCalled();
  expect(loadVideoTasks()[0].sequence[2].repeat).toBe(48);
  fireEvent.changeText(screen.getByLabelText('第3项重复遍数'), '48');
  for (const day of ['一', '二', '三', '四', '五', '六', '日'])
    fireEvent.press(screen.getByLabelText(`星期${day}`));
  fireEvent.press(screen.getByText('保存视频任务'));
  expect(navigation.goBack).not.toHaveBeenCalled();
});

it('定时开关不禁用手动加入按钮，且打开开关请求权限', async () => {
  const screen = render(<VideoTaskListScreen navigation={navigation as any} route={{} as any} />);
  expect(screen.getByLabelText('加入49遍视频任务')).toBeEnabled();
  await act(async () => {
    fireEvent(screen.getByLabelText('49遍视频任务定时启动'), 'valueChange', true);
  });
  expect(loadVideoTasks()[0].enabled).toBe(true);
  expect(NativeModules.ScheduledTaskManager.requestSchedulingPermission).toHaveBeenCalled();
});

it('播放页展示整套流程位置；原生中断后提供恢复入口', async () => {
  const occurrence = activeOccurrence(defaultVideoTasks()[0], VIDEO_CATALOG, now)!;
  useVideoState.setState({ session: { occurrence, intent: 'playing' } });
  const screen = render(<VideoPlayer />);
  await act(async () => {});
  expect(screen.getByTestId('video-current-cycle')).toHaveTextContent('8');
  expect(screen.getByTestId('video-total-cycles')).toHaveTextContent('49');
  expect(screen.getByText(/8\/48遍/)).toBeTruthy();
  expect(screen.getByText('暂停视频')).toBeTruthy();
  NativeModules.VideoProgramPlayer.getStatus.mockResolvedValue({
    playing: false,
    error: '系统中断',
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(500);
  });
  expect(screen.getByText('追平并继续')).toBeTruthy();
  expect(screen.getByText('系统中断')).toBeTruthy();
  jest.setSystemTime(Math.ceil(occurrence.endEpochMs));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(500);
  });
  expect(screen.getByTestId('video-current-cycle')).toHaveTextContent('本次流程已结束');
  expect(screen.queryByText('追平并继续')).toBeNull();
  screen.unmount();
});

it('进出全屏保持同一个视频表面，不调用加载/暂停/停止；Android返回键先退出全屏', async () => {
  const back = jest.spyOn(BackHandler, 'addEventListener');
  const screen = await player();
  const surface = screen.getByTestId('video-program-surface');
  const engine = NativeModules.VideoProgramPlayer;
  fireEvent.press(screen.getByLabelText('进入全屏'));
  expect(screen.getByTestId('video-program-surface')).toBe(surface);
  expect(
    screen.getAllByTestId('video-program-surface', { includeHiddenElements: true }),
  ).toHaveLength(1);
  expect(screen.getByLabelText('退出全屏')).toBeTruthy();
  const handler = back.mock.calls.find(([event]) => event === 'hardwareBackPress')![1];
  act(() => expect(handler()).toBe(true));
  expect(screen.getByLabelText('进入全屏')).toBeTruthy();
  expect(screen.getByTestId('video-program-surface')).toBe(surface);
  fireEvent.press(screen.getByLabelText('进入全屏'));
  fireEvent.press(screen.getByLabelText('退出全屏'));
  expect(screen.getByTestId('video-program-surface')).toBe(surface);
  expect(engine.load).not.toHaveBeenCalled();
  expect(engine.pause).not.toHaveBeenCalled();
  expect(engine.stop).not.toHaveBeenCalled();
});

it('全屏使用安全区内实测尺寸，不继承视频宽高比而使右侧/底部控制被裁切', async () => {
  const screen = await player();
  const surface = screen.getByTestId('video-program-surface');
  const layout = (width: number, height: number) =>
    fireEvent(screen.getByTestId('video-player-viewport'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    });
  layout(390, 700);
  fireEvent.press(screen.getByLabelText('进入全屏'));
  expect(StyleSheet.flatten(screen.getByTestId('video-stage').props.style)).toMatchObject({
    width: 390,
    height: 700,
  });
  expect(
    StyleSheet.flatten(screen.getByTestId('video-stage').props.style).aspectRatio,
  ).toBeUndefined();
  // Hiding the tab bar / rotating causes a new actual viewport measurement.
  layout(750, 330);
  expect(StyleSheet.flatten(screen.getByTestId('video-stage').props.style)).toMatchObject({
    width: 750,
    height: 330,
  });
  layout(0, 0);
  expect(StyleSheet.flatten(screen.getByTestId('video-stage').props.style).height).toBe(330);
  expect(screen.getByTestId('video-program-surface')).toBe(surface);
  expect(surface.props.style.width).toBeLessThanOrEqual(750);
  expect(surface.props.style.height).toBeLessThanOrEqual(330);
  fireEvent.press(screen.getByLabelText('退出全屏'));
  expect(
    StyleSheet.flatten(screen.getByTestId('video-stage').props.style).aspectRatio,
  ).toBeGreaterThan(1);
});

it('全屏播放3秒收起控制、点击唤出；暂停/失败时不隐藏', async () => {
  const screen = await player();
  fireEvent.press(screen.getByLabelText('进入全屏'));
  expect(screen.getByTestId('video-persistent-progress')).toHaveTextContent('8/49');
  await act(async () => {
    await jest.advanceTimersByTimeAsync(3000);
  });
  expect(screen.queryByLabelText('退出全屏')).toBeNull();
  expect(screen.getByTestId('video-persistent-progress')).toHaveTextContent('8/49');
  expect(screen.getByTestId('video-persistent-progress').props.pointerEvents).toBe('none');
  fireEvent.press(screen.getByLabelText('显示或隐藏视频控制'));
  expect(screen.getByLabelText('退出全屏')).toBeTruthy();
  NativeModules.VideoProgramPlayer.getStatus.mockResolvedValue({
    playing: false,
    buffering: true,
    error: '系统中断',
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(4000);
  });
  expect(screen.getByLabelText('退出全屏')).toBeTruthy();
  expect(screen.getByLabelText('追平并继续')).toBeTruthy();
  expect(screen.getByText('系统中断')).toBeTruthy();
  expect(screen.getByTestId('video-persistent-progress')).toHaveTextContent('8/49');
});

it('常驻遍数持续按公共时间推进，不因暂停冻结，也不显示第N+1遍', async () => {
  const screen = await player();
  fireEvent.press(screen.getByLabelText('进入全屏'));
  act(() => useVideoState.setState({ session: { ...screen.session, intent: 'paused' } }));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(74_000);
  });
  expect(screen.getByTestId('video-persistent-progress')).toHaveTextContent('9/49');
  expect(screen.getByLabelText(/公共正文进度第9遍，共49遍，非本机完成量/)).toBeTruthy();
  jest.setSystemTime(Math.ceil(screen.session.occurrence.endEpochMs));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(500);
  });
  expect(screen.getByTestId('video-persistent-progress')).toHaveTextContent('已结束');
  expect(screen.queryByText('50/49')).toBeNull();
  fireEvent.press(screen.getByLabelText('退出全屏'));
  expect(screen.queryByTestId('video-persistent-progress')).toBeNull();
  expect(NativeModules.VideoProgramPlayer.load).not.toHaveBeenCalled();
});

it.each([
  [0, '片头'],
  [6_000, '礼敬'],
  [3_700_000, '片尾'],
])('全屏在非正文%sms显示阶段%s，不冒充正文完成次数', async (offset, text) => {
  const screen = await player();
  jest.setSystemTime(screen.session.occurrence.startEpochMs + offset);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(500);
  });
  fireEvent.press(screen.getByLabelText('进入全屏'));
  expect(screen.getByTestId('video-persistent-progress')).toHaveTextContent(text);
});

it('读屏开启时全屏控制保持显示', async () => {
  jest.mocked(AccessibilityInfo.isScreenReaderEnabled).mockResolvedValue(true);
  const screen = await player();
  fireEvent.press(screen.getByLabelText('进入全屏'));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(4000);
  });
  fireEvent.press(screen.getByLabelText('显示或隐藏视频控制'));
  expect(screen.getByLabelText('退出全屏')).toBeTruthy();
});

it('手机横屏自动全屏；切走标签后旋转不误触发；iPad宽窗展示流程侧栏', async () => {
  const screen = await player();
  act(() => viewport(844, 390));
  expect(screen.getByLabelText('退出全屏')).toBeTruthy();
  act(() => setVideoPlayerFocused(false));
  act(() => viewport(390, 844));
  act(() => viewport(844, 390));
  expect(useVideoPresentation.getState().fullscreen).toBe(false);
  act(() => setVideoPlayerFocused(true));
  expect(screen.getByLabelText('退出全屏')).toBeTruthy();
  act(() => viewport(1194, 834));
  expect(screen.getByText('本次播放流程')).toBeTruthy();
  expect(screen.queryByLabelText('退出全屏')).toBeNull();
  act(() => viewport(600, 834));
  expect(screen.queryByText('本次播放流程')).toBeNull();
  fireEvent.press(screen.getByText('查看流程'));
  expect(screen.getByText('本次播放流程')).toBeTruthy();
});

it('列表窗外不允许加入；当前播放只查看画面，不重载，编辑后仍显示本次窗口', async () => {
  const occurrence = activeOccurrence(defaultVideoTasks()[0], VIDEO_CATALOG, now)!;
  const session = { occurrence, intent: 'playing' as const };
  saveVideoSession(session);
  setMediaOwner('video');
  useVideoState.setState({ session });
  useVideoTasks.setState({
    tasks: defaultVideoTasks().map(task =>
      task.id === occurrence.task.id ? { ...task, hour: 22 } : task,
    ),
  });
  const parent = { navigate: jest.fn() };
  navigation.getParent.mockReturnValue(parent);
  const screen = render(<VideoTaskListScreen navigation={navigation as any} route={{} as any} />);
  expect(screen.getByLabelText('加入98遍视频任务')).toBeDisabled();
  expect(screen.getByLabelText('查看播放：49遍视频任务')).toBeEnabled();
  await act(async () => {
    fireEvent.press(screen.getByLabelText('查看播放：49遍视频任务'));
  });
  expect(parent.navigate).toHaveBeenCalledWith('Player');
  expect(NativeModules.VideoProgramPlayer.load).not.toHaveBeenCalled();
});
