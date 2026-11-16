import React from 'react';
import { Alert, Dimensions, NativeModules } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { MMKV } from 'react-native-mmkv';
import TaskListScreen from '@/screens/TaskListScreen';
import TaskEditScreen from '@/screens/TaskEditScreen';
import { useScheduledTaskStore } from '@/store/scheduledTaskStore';
import { loadScheduledTasks } from '@/utils/storage';
import { executeScheduledTask } from '@/services/scheduledTaskExecutor';

jest.mock('@/services/scheduledTaskExecutor', () => ({
  executeScheduledTask: jest.fn(async () => true),
}));

const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const route = (params?: { taskId?: string }) => ({ key: 'test', name: 'TaskEdit', params });
const wheelEvent = (value: number) => ({ nativeEvent: { contentOffset: { x: 0, y: value * 48 } } });
function selectWheel(screen: ReturnType<typeof render>, part: string, value: number) {
  const wheel = screen.getByTestId(`task-${part}-wheel`, { includeHiddenElements: true });
  fireEvent(wheel, 'scrollBeginDrag');
  fireEvent.scroll(wheel, wheelEvent(value));
  fireEvent(wheel, 'scrollEndDrag', wheelEvent(value));
  fireEvent(wheel, 'momentumScrollEnd', wheelEvent(value));
}

beforeEach(() => {
  Dimensions.set({
    window: { width: 390, height: 844, scale: 3, fontScale: 1 },
    screen: { width: 390, height: 844, scale: 3, fontScale: 1 },
  });
  (new MMKV() as any).clearAll();
  jest.clearAllMocks();
  useScheduledTaskStore.setState({ tasks: loadScheduledTasks() });
});

describe('任务列表', () => {
  it('按时间显示三条默认关闭任务并提供立即播放', async () => {
    const { getByText, getAllByText, getByLabelText } = render(
      <TaskListScreen navigation={navigation as any} route={{} as any} />,
    );
    await waitFor(() =>
      expect(NativeModules.ScheduledTaskManager.getSchedulingStatus).toHaveBeenCalled(),
    );
    expect(getByText('05:30:00')).toBeTruthy();
    expect(getByText('06:30:00')).toBeTruthy();
    expect(getByText('20:00:00')).toBeTruthy();
    expect(getByText('早自习')).toBeTruthy();
    expect(getByText('，49遍')).toBeTruthy();
    expect(getAllByText('单曲，同步')).toHaveLength(2);
    expect(() => getByText('大悲咒（共修版）')).toThrow();
    expect(getByLabelText('早自习已关闭').props.value).toBe(false);

    fireEvent.press(getByLabelText('立即播放任务早自习'));
    await waitFor(() =>
      expect(executeScheduledTask).toHaveBeenCalledWith({
        taskId: 'default-morning',
        source: 'manual',
      }),
    );
  });

  it('信息区进入修改页，增加按钮进入新建页', async () => {
    const { getByLabelText, getByText } = render(
      <TaskListScreen navigation={navigation as any} route={{} as any} />,
    );
    await waitFor(() =>
      expect(NativeModules.ScheduledTaskManager.getSchedulingStatus).toHaveBeenCalled(),
    );
    fireEvent.press(getByLabelText('修改任务早自习'));
    expect(navigation.navigate).toHaveBeenCalledWith('TaskEdit', { taskId: 'default-morning' });
    fireEvent.press(getByText('增加任务'));
    expect(navigation.navigate).toHaveBeenCalledWith('TaskEdit');
  });

  it('启用任务后持久化并请求系统权限', async () => {
    const manager = NativeModules.ScheduledTaskManager;
    const { getByLabelText } = render(
      <TaskListScreen navigation={navigation as any} route={{} as any} />,
    );
    await waitFor(() =>
      expect(NativeModules.ScheduledTaskManager.getSchedulingStatus).toHaveBeenCalled(),
    );
    await act(async () => fireEvent(getByLabelText('早自习已关闭'), 'valueChange', true));
    expect(loadScheduledTasks().find(task => task.id === 'default-morning')?.enabled).toBe(true);
    expect(manager.requestSchedulingPermission).toHaveBeenCalled();
  });

  it('Android启用任务后提供后台运行设置入口', async () => {
    const manager = NativeModules.ScheduledTaskManager;
    manager.getSchedulingStatus.mockResolvedValueOnce({
      platform: 'android',
      notificationPermission: 'authorized',
      exactAlarmPermission: 'authorized',
    });
    const tasks = loadScheduledTasks().map(task =>
      task.id === 'default-morning' ? { ...task, enabled: true } : task,
    );
    useScheduledTaskStore.getState().replaceAll(tasks);

    const { getByLabelText } = render(
      <TaskListScreen navigation={navigation as any} route={{} as any} />,
    );
    await waitFor(() => expect(getByLabelText('检查后台运行设置')).toBeTruthy());
    fireEvent.press(getByLabelText('检查后台运行设置'));
    await waitFor(() => expect(manager.openBackgroundSettings).toHaveBeenCalled());
  });

  it('同一时刻已有启用任务时阻止第二个任务启用', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tasks = loadScheduledTasks().map(task =>
      task.id === 'default-morning'
        ? { ...task, enabled: true }
        : task.id === 'default-opportunity'
          ? { ...task, hour: 5, minute: 30, second: 0 }
          : task,
    );
    useScheduledTaskStore.getState().replaceAll(tasks);
    const { getByLabelText } = render(
      <TaskListScreen navigation={navigation as any} route={{} as any} />,
    );
    await waitFor(() =>
      expect(NativeModules.ScheduledTaskManager.getSchedulingStatus).toHaveBeenCalled(),
    );

    await act(async () => fireEvent(getByLabelText('见缝插针已关闭'), 'valueChange', true));

    expect(alert).toHaveBeenCalledWith(
      '启动时刻冲突',
      expect.stringContaining('同一时刻只能启用一个任务'),
    );
    expect(loadScheduledTasks().find(task => task.id === 'default-opportunity')?.enabled).toBe(
      false,
    );
  });

  it('左滑删除按钮确认后删除任务', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find(button => button.style === 'destructive')?.onPress?.();
    });
    const { getByLabelText } = render(
      <TaskListScreen navigation={navigation as any} route={{} as any} />,
    );
    await waitFor(() =>
      expect(NativeModules.ScheduledTaskManager.getSchedulingStatus).toHaveBeenCalled(),
    );
    await act(async () => {
      fireEvent.press(getByLabelText('删除任务早自习'));
      await Promise.resolve();
    });
    expect(loadScheduledTasks().some(task => task.id === 'default-morning')).toBe(false);
  });
});

describe('任务编辑', () => {
  it('可创建大重复遍数任务，且新任务默认关闭', () => {
    const screen = render(<TaskEditScreen navigation={navigation as any} route={route() as any} />);
    const { getByLabelText, getByText } = screen;
    fireEvent.changeText(getByLabelText('任务名称'), '新任务');
    selectWheel(screen, 'hour', 23);
    selectWheel(screen, 'minute', 59);
    selectWheel(screen, 'second', 58);
    fireEvent.changeText(getByLabelText('每首重复遍数'), '5000000');
    fireEvent.press(getByText('列表循环'));
    fireEvent(getByLabelText('同步模式'), 'valueChange', false);
    fireEvent.press(getByText('保存'));

    const created = loadScheduledTasks().find(task => task.name === '新任务');
    expect(created).toMatchObject({
      hour: 23,
      minute: 59,
      second: 58,
      repeatCount: 5_000_000,
      playMode: 'repeat-all',
      isSyncMode: false,
      enabled: false,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    });
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('阻止空名称和未选择重复日期', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByLabelText, getByText } = render(
      <TaskEditScreen navigation={navigation as any} route={route() as any} />,
    );
    fireEvent.press(getByText('保存'));
    expect(alert).toHaveBeenCalledWith('无法保存', '请输入任务名称');
    fireEvent.changeText(getByLabelText('任务名称'), '测试');
    for (const day of ['一', '二', '三', '四', '五', '六', '日']) {
      fireEvent.press(getByLabelText(`星期${day}`));
    }
    fireEvent.press(getByText('保存'));
    expect(alert).toHaveBeenCalledWith('无法保存', '请至少选择一个重复日期');
  });

  it('编辑并删除已有任务', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find(button => button.style === 'destructive')?.onPress?.();
    });
    const { getByLabelText, getByText } = render(
      <TaskEditScreen
        navigation={navigation as any}
        route={route({ taskId: 'default-morning' }) as any}
      />,
    );
    fireEvent.changeText(getByLabelText('任务名称'), '改名');
    fireEvent.press(getByText('保存'));
    expect(loadScheduledTasks().find(task => task.id === 'default-morning')?.name).toBe('改名');

    navigation.goBack.mockClear();
    const screen = render(
      <TaskEditScreen
        navigation={navigation as any}
        route={route({ taskId: 'default-evening' }) as any}
      />,
    );
    fireEvent.press(screen.getByText('删除任务'));
    expect(loadScheduledTasks().some(task => task.id === 'default-evening')).toBe(false);
    expect(alert).toHaveBeenCalled();
  });

  it('阻止已启用任务修改到另一个已启用任务的相同时刻', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tasks = loadScheduledTasks().map(task =>
      task.id === 'default-morning' || task.id === 'default-opportunity'
        ? { ...task, enabled: true }
        : task,
    );
    useScheduledTaskStore.getState().replaceAll(tasks);
    const screen = render(
      <TaskEditScreen
        navigation={navigation as any}
        route={route({ taskId: 'default-opportunity' }) as any}
      />,
    );
    selectWheel(screen, 'hour', 5);
    selectWheel(screen, 'minute', 30);
    fireEvent.press(screen.getByText('保存'));
    expect(alert).toHaveBeenCalledWith(
      '启动时刻冲突',
      expect.stringContaining('同一时刻只能启用一个任务'),
    );
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('工作日选择保存后再次打开仍保持，旧任务默认每天', () => {
    const screen = render(
      <TaskEditScreen
        navigation={navigation as any}
        route={route({ taskId: 'default-morning' }) as any}
      />,
    );
    expect(screen.getByLabelText('星期日').props.accessibilityState.checked).toBe(true);
    fireEvent.press(screen.getByLabelText('星期六'));
    fireEvent.press(screen.getByLabelText('星期日'));
    fireEvent.press(screen.getByText('保存'));
    expect(loadScheduledTasks()[0].weekdays).toEqual([1, 2, 3, 4, 5]);
    screen.unmount();
    const reopened = render(
      <TaskEditScreen
        navigation={navigation as any}
        route={route({ taskId: 'default-morning' }) as any}
      />,
    );
    expect(reopened.getByLabelText('星期日').props.accessibilityState.checked).toBe(false);
    expect(reopened.getByLabelText('星期一').props.accessibilityState.checked).toBe(true);
  });

  it('拨轮滚动期间禁止保存，停止后保存最终吸附值', () => {
    const screen = render(
      <TaskEditScreen
        navigation={navigation as any}
        route={route({ taskId: 'default-morning' }) as any}
      />,
    );
    const wheel = screen.getByTestId('task-second-wheel', { includeHiddenElements: true });
    fireEvent(wheel, 'scrollBeginDrag');
    fireEvent.scroll(wheel, wheelEvent(58.7));
    fireEvent.press(screen.getByText('保存'));
    expect(navigation.goBack).not.toHaveBeenCalled();
    fireEvent(wheel, 'scrollEndDrag', wheelEvent(58.7));
    fireEvent(wheel, 'momentumScrollEnd', wheelEvent(59));
    fireEvent.press(screen.getByText('保存'));
    expect(loadScheduledTasks()[0].second).toBe(59);
  });

  it('三列拨轮保持各自值，边界夹紧且支持读屏调整', () => {
    const screen = render(
      <TaskEditScreen
        navigation={navigation as any}
        route={route({ taskId: 'default-morning' }) as any}
      />,
    );
    selectWheel(screen, 'hour', -3);
    selectWheel(screen, 'minute', 80);
    selectWheel(screen, 'second', 60);
    fireEvent(screen.getByLabelText('启动时'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    fireEvent(screen.getByLabelText('启动分'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    fireEvent(screen.getByLabelText('启动秒'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(screen.getByLabelText('启动时').props.accessibilityValue.now).toBe(0);
    expect(screen.getByLabelText('启动分').props.accessibilityValue.now).toBe(59);
    expect(screen.getByLabelText('启动秒').props.accessibilityValue.now).toBe(58);
    fireEvent.press(screen.getByText('保存'));
    expect(loadScheduledTasks()[0]).toMatchObject({ hour: 0, minute: 59, second: 58 });
  });
});
