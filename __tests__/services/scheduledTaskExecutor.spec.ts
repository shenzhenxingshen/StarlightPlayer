import TrackPlayer, { RepeatMode } from 'react-native-track-player';
import { MMKV } from 'react-native-mmkv';
import { DEFAULT_SCHEDULED_TASKS } from '@/constants/scheduledTasks';
import { executeScheduledTask, AUTOMATIC_TASK_WINDOW_MS } from '@/services/scheduledTaskExecutor';
import { useSettingsStore } from '@/store/settingsStore';
import { loadPlayerState, saveScheduledTasks, setSettings } from '@/utils/storage';
import { playWithRetryInCommand, replaceTrackInCommand } from '@/utils/trackManager';

jest.mock('@/utils/trackManager', () => ({
  replaceTrackInCommand: jest.fn(async () => ({})),
  playWithRetryInCommand: jest.fn(async () => {}),
}));
jest.mock('@/utils/playerCommandQueue', () => ({
  enqueuePlayerCommand: jest.fn((_label: string, operation: () => Promise<unknown>) => operation()),
}));
jest.mock('@/utils/playerOptions', () => ({ buildPlayerOptions: jest.fn(value => value) }));

const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer>;
const mockedReplaceTrack = replaceTrackInCommand as jest.MockedFunction<
  typeof replaceTrackInCommand
>;
const mockedPlayWithRetry = playWithRetryInCommand as jest.MockedFunction<
  typeof playWithRetryInCommand
>;

beforeEach(() => {
  (new MMKV() as any).clearAll();
  jest.clearAllMocks();
  mockedTrackPlayer.setupPlayer.mockResolvedValue();
  mockedTrackPlayer.setRepeatMode.mockResolvedValue(RepeatMode.Off);
  mockedTrackPlayer.updateOptions.mockResolvedValue();
  mockedReplaceTrack.mockResolvedValue({} as never);
  mockedPlayWithRetry.mockResolvedValue();
  useSettingsStore.setState({ isCareMode: true, isSyncMode: false, repeatCount: 1 });
  setSettings({ isCareMode: true, isSyncMode: false, repeatCount: 1 });
});

describe('定时任务执行器', () => {
  it('播放按钮忽略启用状态，原子应用四项配置并开始A05', async () => {
    const task = DEFAULT_SCHEDULED_TASKS[1];
    saveScheduledTasks([task]);

    await expect(executeScheduledTask({ taskId: task.id, source: 'manual' })).resolves.toBe(true);

    expect(useSettingsStore.getState()).toMatchObject({
      isCareMode: true,
      isSyncMode: true,
      repeatCount: 500,
    });
    expect(loadPlayerState()).toEqual({ trackIndex: 4, playMode: 'repeat-one' });
    expect(mockedTrackPlayer.setupPlayer).toHaveBeenCalledTimes(1);
    expect(mockedTrackPlayer.setRepeatMode).toHaveBeenCalledWith(RepeatMode.Off);
    expect(mockedReplaceTrack).toHaveBeenCalledWith(4, 'user');
    expect(mockedPlayWithRetry).toHaveBeenCalledWith(`ScheduledTask:${task.id}`);
  });

  it('自动触发不执行已关闭任务，但手动仍可执行', async () => {
    const task = DEFAULT_SCHEDULED_TASKS[0];
    saveScheduledTasks([task]);
    await expect(executeScheduledTask({ taskId: task.id, source: 'android-alarm' })).resolves.toBe(
      false,
    );
    expect(mockedReplaceTrack).not.toHaveBeenCalled();
  });

  it('Android超过播放窗口直接跳过，不进行补播', async () => {
    const task = { ...DEFAULT_SCHEDULED_TASKS[0], enabled: true };
    saveScheduledTasks([task]);
    const now = 10_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    await expect(
      executeScheduledTask({
        taskId: task.id,
        source: 'android-alarm',
        scheduledAt: now - AUTOMATIC_TASK_WINDOW_MS - 1,
      }),
    ).resolves.toBe(false);
    expect(mockedReplaceTrack).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('iOS用户在有效窗口内点击通知会执行', async () => {
    const task = { ...DEFAULT_SCHEDULED_TASKS[2], enabled: true };
    saveScheduledTasks([task]);
    const now = 10_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    await expect(
      executeScheduledTask({
        taskId: task.id,
        source: 'notification-tap',
        scheduledAt: now - 30_000,
      }),
    ).resolves.toBe(true);
    expect(mockedReplaceTrack).toHaveBeenCalled();
  });

  it('iOS通知点击超过播放窗口不补播，但立即播放仍可用', async () => {
    const task = { ...DEFAULT_SCHEDULED_TASKS[2], enabled: true };
    saveScheduledTasks([task]);
    const now = 10_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    await expect(
      executeScheduledTask({
        taskId: task.id,
        source: 'notification-tap',
        scheduledAt: now - AUTOMATIC_TASK_WINDOW_MS - 1,
      }),
    ).resolves.toBe(false);
    await expect(
      executeScheduledTask({ taskId: task.id, source: 'manual', scheduledAt: 0 }),
    ).resolves.toBe(true);
    expect(mockedReplaceTrack).toHaveBeenCalledTimes(1);
  });

  it('不存在的任务安全忽略', async () => {
    saveScheduledTasks([]);
    await expect(executeScheduledTask({ taskId: 'missing', source: 'manual' })).resolves.toBe(
      false,
    );
  });

  it('已初始化播放器错误可复用原生实例', async () => {
    const task = DEFAULT_SCHEDULED_TASKS[0];
    saveScheduledTasks([task]);
    mockedTrackPlayer.setupPlayer.mockRejectedValueOnce({ code: 'player_already_initialized' });
    await expect(executeScheduledTask({ taskId: task.id, source: 'manual' })).resolves.toBe(true);
  });

  it('队列替换失效时不继续播放并向调用方报告失败', async () => {
    const task = DEFAULT_SCHEDULED_TASKS[0];
    saveScheduledTasks([task]);
    mockedReplaceTrack.mockResolvedValueOnce(null);
    await expect(executeScheduledTask({ taskId: task.id, source: 'manual' })).rejects.toThrow(
      'queue replacement became stale',
    );
    expect(mockedPlayWithRetry).not.toHaveBeenCalled();
  });

  it('并发到达的任务严格串行，后到任务最终替换前一个', async () => {
    const first = { ...DEFAULT_SCHEDULED_TASKS[0], id: 'first', trackId: 'a04' };
    const second = { ...DEFAULT_SCHEDULED_TASKS[1], id: 'second', trackId: 'a05' };
    saveScheduledTasks([first, second]);
    let finishFirst: (() => void) | undefined;
    mockedReplaceTrack
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finishFirst = () => resolve({} as never);
          }),
      )
      .mockResolvedValueOnce({} as never);

    const firstExecution = executeScheduledTask({ taskId: first.id, source: 'manual' });
    const secondExecution = executeScheduledTask({ taskId: second.id, source: 'manual' });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockedReplaceTrack).toHaveBeenCalledTimes(1);
    expect(mockedReplaceTrack).toHaveBeenNthCalledWith(1, 3, 'user');

    finishFirst?.();
    await expect(Promise.all([firstExecution, secondExecution])).resolves.toEqual([true, true]);
    expect(mockedReplaceTrack).toHaveBeenNthCalledWith(2, 4, 'user');
    expect(loadPlayerState()).toEqual({ trackIndex: 4, playMode: second.playMode });
  });
});
