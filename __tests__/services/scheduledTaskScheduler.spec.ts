import { NativeModules } from 'react-native';
import { DEFAULT_SCHEDULED_TASKS } from '@/constants/scheduledTasks';
import {
  openTaskBackgroundSettings,
  syncTaskSchedules,
  TaskSchedulingStatus,
} from '@/services/scheduledTaskScheduler';

const status: TaskSchedulingStatus = {
  platform: 'ios',
  notificationPermission: 'authorized',
  exactAlarmPermission: 'not-needed',
};

describe('定时任务原生日程同步', () => {
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
    expect(syncTasks).toHaveBeenNthCalledWith(1, oldTasks);

    finishFirst?.();
    await expect(Promise.all([first, second])).resolves.toEqual([status, status]);
    expect(syncTasks).toHaveBeenNthCalledWith(2, newTasks);
  });

  it('可从任务页进入Android应用后台设置', async () => {
    await expect(openTaskBackgroundSettings()).resolves.toMatchObject({ platform: 'android' });
    expect(NativeModules.ScheduledTaskManager.openBackgroundSettings).toHaveBeenCalled();
  });
});
