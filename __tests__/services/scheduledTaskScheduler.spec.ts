import { NativeModules } from 'react-native';
import { DEFAULT_SCHEDULED_TASKS } from '@/constants/scheduledTasks';
import { loadVideoTasks } from '@/video/persistence';
import {
  openTaskBackgroundSettings,
  getTaskSchedulingStatus,
  syncTaskSchedules,
  TaskSchedulingStatus,
} from '@/services/scheduledTaskScheduler';

const status: TaskSchedulingStatus = {
  platform: 'ios',
  notificationPermission: 'authorized',
  exactAlarmPermission: 'not-needed',
};

describe('定时任务原生日程同步', () => {
  beforeEach(() => jest.clearAllMocks());
  it('快速连续保存时严格串行，最终提交最新快照', async () => {
    const syncTasks = NativeModules.ScheduledTaskManager.syncTasks as jest.Mock;
    let finishFirst: (() => void) | undefined;
    syncTasks
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finishFirst = () => resolve(status);
          }),
      )
      .mockResolvedValueOnce(status);

    const oldTasks = [{ ...DEFAULT_SCHEDULED_TASKS[0], enabled: false }];
    const newTasks = [{ ...DEFAULT_SCHEDULED_TASKS[0], enabled: true }];
    const first = syncTaskSchedules(oldTasks);
    const second = syncTaskSchedules(newTasks);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(syncTasks).toHaveBeenCalledTimes(1);
    expect(syncTasks).toHaveBeenNthCalledWith(1, [...oldTasks, ...loadVideoTasks()]);

    finishFirst?.();
    await expect(Promise.all([first, second])).resolves.toEqual([status, status]);
    expect(syncTasks).toHaveBeenNthCalledWith(2, [...newTasks, ...loadVideoTasks()]);
  });

  it('可从任务页进入Android应用后台设置', async () => {
    await expect(openTaskBackgroundSettings()).resolves.toMatchObject({ platform: 'android' });
    expect(NativeModules.ScheduledTaskManager.openBackgroundSettings).toHaveBeenCalled();
  });

  it('快照深拷贝星期数组，查询状态等待最后一次同步', async () => {
    const manager = NativeModules.ScheduledTaskManager;
    let finish: ((value: TaskSchedulingStatus) => void) | undefined;
    manager.syncTasks.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    const task = {
      ...DEFAULT_SCHEDULED_TASKS[0],
      weekdays: [...DEFAULT_SCHEDULED_TASKS[0].weekdays],
    };
    const sync = syncTaskSchedules([task]);
    task.weekdays.pop();
    const statusPromise = getTaskSchedulingStatus();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(manager.syncTasks.mock.calls[0][0][0].weekdays).toHaveLength(7);
    expect(manager.getSchedulingStatus).not.toHaveBeenCalled();
    finish?.(status);
    await sync;
    await statusPromise;
    expect(manager.getSchedulingStatus).toHaveBeenCalledTimes(1);
  });
});
