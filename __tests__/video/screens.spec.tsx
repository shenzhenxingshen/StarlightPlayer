import React from 'react';
import { Alert, NativeModules } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { MMKV } from 'react-native-mmkv';
import { defaultVideoTasks, activeOccurrence } from '../../packages/program-core/src/tasks';
import { VideoTaskEditScreen, VideoTaskListScreen } from '@/video/TaskScreens';
import VideoPlayer from '@/video/Player';
import { VIDEO_CATALOG } from '@/video/catalog';
import { loadVideoTasks } from '@/video/persistence';
import { useVideoTasks } from '@/video/taskStore';
import { useVideoState } from '@/video/runtime';

const navigation = { navigate: jest.fn(), goBack: jest.fn(), getParent: jest.fn() };
const now = new Date(2026, 10, 19, 5, 40).getTime();
beforeEach(() => {
  new MMKV().clearAll();
  jest.useFakeTimers();
  jest.setSystemTime(now);
  jest.clearAllMocks();
  useVideoTasks.setState({ tasks: defaultVideoTasks() });
  useVideoState.setState({ session: null, error: null });
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
  expect(screen.getByText(/当前片段第 8 遍/)).toBeTruthy();
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
  expect(screen.getByText('本次流程已结束')).toBeTruthy();
  expect(screen.queryByText('追平并继续')).toBeNull();
  screen.unmount();
});
