import { AppState, NativeModules } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import TrackPlayer, { State } from 'react-native-track-player';
import { defaultVideoTasks, VideoTask } from '../../packages/program-core/src/tasks';
import {
  joinVideoTask,
  leaveVideo,
  pauseVideo,
  resumeVideo,
  tickVideoTasks,
  useVideoState,
  startVideoLifecycle,
} from '@/video/runtime';
import {
  loadVideoSession,
  loadVideoTasks,
  saveVideoTasks,
  seenVideoOccurrences,
} from '@/video/persistence';
import { claimAudioInCommand, isVideoOwner } from '@/video/ownership';
import {
  loadCycleEligible,
  loadExpectedPlaying,
  loadSessionCount,
  saveCycleEligible,
  saveExpectedPlaying,
  saveSessionCount,
  saveScheduledTasks,
} from '@/utils/storage';
import { executeScheduledTask } from '@/services/scheduledTaskExecutor';
import { useVideoTasks } from '@/video/taskStore';
import { syncTaskSchedules } from '@/services/scheduledTaskScheduler';
import { DEFAULT_SCHEDULED_TASKS } from '@/constants/scheduledTasks';
import { enqueuePlayerCommand } from '@/utils/playerCommandQueue';

const storage = new MMKV();
const native = NativeModules.VideoProgramPlayer;
const now = new Date(2026, 10, 19, 5, 40).getTime();
const makeTask = (patch: Partial<VideoTask> = {}) => ({ ...defaultVideoTasks()[0], ...patch });
const activeState = AppState.currentState;

beforeEach(() => {
  storage.clearAll();
  jest.spyOn(Date, 'now').mockReturnValue(now);
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.clearAllMocks();
  native.load.mockResolvedValue(undefined);
  (TrackPlayer.getPlaybackState as jest.Mock).mockResolvedValue({ state: State.Playing });
  useVideoState.setState({ session: null, error: null });
  useVideoTasks.setState({ tasks: defaultVideoTasks() });
});
afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: activeState });
});

it('加入实际时段：暂停音频，撤回资格但不改累计，交给原生整套播放', async () => {
  saveExpectedPlaying(true);
  saveCycleEligible(true);
  saveSessionCount(123);
  await joinVideoTask('video-default-49');
  expect(TrackPlayer.pause).toHaveBeenCalledTimes(1);
  expect(isVideoOwner()).toBe(true);
  expect(loadExpectedPlaying()).toBe(false);
  expect(loadCycleEligible()).toBe(false);
  expect(loadSessionCount()).toBe(123);
  expect(native.load).toHaveBeenCalledWith(
    expect.objectContaining({
      timescale: 44100,
      startEpochMs: now - 10 * 60_000,
      spans: expect.any(Array),
    }),
  );
  expect(native.load.mock.calls[0][0].spans).toHaveLength(52);
});

it('暂停不改变启动时间；修改/删除后继续仍使用原始完整快照', async () => {
  await joinVideoTask('video-default-49');
  const original = native.load.mock.calls[0][0];
  await pauseVideo();
  expect(loadVideoSession()?.intent).toBe('paused');
  saveVideoTasks([]);
  jest.spyOn(Date, 'now').mockReturnValue(now + 60_000);
  await resumeVideo();
  expect(native.load).toHaveBeenLastCalledWith(original);
  await joinVideoTask('video-default-49'); // Deleted, but still active snapshot.
  expect(native.load).toHaveBeenLastCalledWith(original);
});

it('退出视频/主动切回音频，视频停止且原有音频控制恢复', async () => {
  await joinVideoTask('video-default-49');
  await leaveVideo();
  expect(isVideoOwner()).toBe(false);
  expect(loadVideoSession()?.intent).toBe('stopped');
  expect(native.stop).toHaveBeenCalled();
  await joinVideoTask('video-default-49');
  await claimAudioInCommand();
  expect(isVideoOwner()).toBe(false);
});

it('过了终点只能结束，不能再开始，也不影响音频', async () => {
  await joinVideoTask('video-default-49');
  jest.spyOn(Date, 'now').mockReturnValue(Math.ceil(loadVideoSession()!.occurrence.endEpochMs));
  await resumeVideo();
  expect(loadVideoSession()?.intent).toBe('stopped');
  expect(native.load).toHaveBeenCalledTimes(1);
  await expect(joinVideoTask('video-default-49')).rejects.toThrow(/时段/);
});

it('自动启动去重、显式暂停后不被tick恢复，下一场可接替', async () => {
  saveVideoTasks([makeTask({ enabled: true })]);
  await Promise.all([tickVideoTasks(), tickVideoTasks(), tickVideoTasks()]);
  expect(native.load).toHaveBeenCalledTimes(1);
  expect(seenVideoOccurrences()).toHaveLength(1);
  await pauseVideo();
  await tickVideoTasks();
  expect(native.load).toHaveBeenCalledTimes(1);
  saveVideoTasks([
    makeTask({ enabled: true }),
    makeTask({ id: 'video-second', hour: 5, minute: 41, enabled: true }),
  ]);
  jest.spyOn(Date, 'now').mockReturnValue(now + 61_000);
  await tickVideoTasks();
  expect(loadVideoSession()?.occurrence.task.id).toBe('video-second');
});

it('编辑当前任务时刻不重置正在播放的实例', async () => {
  saveVideoTasks([makeTask({ enabled: true })]);
  await tickVideoTasks();
  const original = loadVideoSession()?.occurrence.startEpochMs;
  saveVideoTasks([makeTask({ minute: 39, enabled: true })]);
  await tickVideoTasks();
  expect(native.load).toHaveBeenCalledTimes(1);
  expect(loadVideoSession()?.occurrence.startEpochMs).toBe(original);
});

it.each([false, true])('较晚短任务结束后不回退到未加入的旧长任务（加载失败=%s）', async failed => {
  saveVideoTasks([
    makeTask({ enabled: true }),
    makeTask({
      id: 'video-shorter',
      enabled: true,
      minute: 39,
      second: 58,
      sequence: [{ assetId: 'intro49', repeat: 1 }],
    }),
  ]);
  if (failed) native.load.mockRejectedValueOnce(new Error('short asset failure'));
  await tickVideoTasks();
  expect(loadVideoSession()?.occurrence.task.id).toBe('video-shorter');
  expect(seenVideoOccurrences()).toHaveLength(2);
  jest.spyOn(Date, 'now').mockReturnValue(now + 4_000);
  await tickVideoTasks();
  expect(loadVideoSession()?.intent).toBe('stopped');
  expect(native.load).toHaveBeenCalledTimes(1);
});

it('加载失败保存暂停状态，自动重试不循环，手动可重试', async () => {
  saveVideoTasks([makeTask({ enabled: true })]);
  native.load.mockRejectedValueOnce(new Error('missing asset'));
  await tickVideoTasks();
  await tickVideoTasks();
  expect(loadVideoSession()?.intent).toBe('paused');
  expect(native.load).toHaveBeenCalledTimes(1);
  await resumeVideo();
  expect(loadVideoSession()?.intent).toBe('playing');
});

it('后台不启动视频，晚到通知仍按全流程时段加入而非15分钟音频窗口', async () => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
  await tickVideoTasks();
  expect(await executeScheduledTask({ taskId: 'video-default-49', source: 'ios-background' })).toBe(
    false,
  );
  expect(native.load).not.toHaveBeenCalled();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(Date, 'now').mockReturnValue(now + 20 * 60_000);
  await executeScheduledTask({
    taskId: 'video-default-49',
    source: 'notification-tap',
    scheduledAt: now - 10 * 60_000,
  });
  expect(native.load).toHaveBeenCalled();
});

it('旧版/损坏快照不恢复，损坏任务不覆盖原数据', () => {
  storage.set('video_tasks_v1', '{broken');
  expect(loadVideoTasks()).toEqual([]);
  expect(storage.getString('video_tasks_v1')).toBe('{broken');
  storage.set('video_session_v1', '{}');
  expect(loadVideoSession()).toBeNull();
});

it('音频和视频日程一起提交，禁止相同星期和时刻的两种任务同时启用', async () => {
  saveScheduledTasks([{ ...DEFAULT_SCHEDULED_TASKS[0], enabled: true }]);
  expect(() => useVideoTasks.getState().put(makeTask({ enabled: true }))).toThrow(/相同时刻/);
  useVideoTasks.getState().put(makeTask({ enabled: true, minute: 31 }));
  await syncTaskSchedules([{ ...DEFAULT_SCHEDULED_TASKS[0], enabled: true }]);
  expect(NativeModules.ScheduledTaskManager.syncTasks).toHaveBeenLastCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ id: 'video-default-49', enabled: true }),
      expect.objectContaining({ id: 'default-morning' }),
    ]),
  );
});

it('较晚音频任务接管后，旧视频窗口不会在前台tick重新抢播', async () => {
  saveVideoTasks([makeTask({ enabled: true })]);
  const task = { ...DEFAULT_SCHEDULED_TASKS[0], id: 'later-audio', minute: 35, enabled: true };
  saveScheduledTasks([task]);
  await executeScheduledTask({
    taskId: task.id,
    source: 'android-alarm',
    scheduledAt: now - 5 * 60_000,
  });
  await tickVideoTasks();
  expect(native.load).not.toHaveBeenCalled();
  expect(isVideoOwner()).toBe(false);
  expect(seenVideoOccurrences()).toHaveLength(1);
});

it('晚到的旧音频通知不抢占较晚视频流程，也不改音频配置', async () => {
  await joinVideoTask('video-default-49');
  const task = { ...DEFAULT_SCHEDULED_TASKS[0], id: 'older-audio', minute: 29, enabled: true };
  saveScheduledTasks([task]);
  expect(
    await executeScheduledTask({
      taskId: task.id,
      source: 'android-alarm',
      scheduledAt: now - 11 * 60_000,
    }),
  ).toBe(false);
  expect(isVideoOwner()).toBe(true);
  expect(TrackPlayer.play).not.toHaveBeenCalled();
});

it('冷启动恢复playing快照；进入后台暂停原生，回前台仍按同一开始时刻追平', async () => {
  await joinVideoTask('video-default-49');
  const config = native.load.mock.calls[0][0];
  const listeners: ((state: string) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    listeners.push(listener as (state: string) => void);
    return { remove: jest.fn() };
  });
  const stop = startVideoLifecycle();
  try {
    await enqueuePlayerCommand('test:drain', async () => {});
    expect(native.load).toHaveBeenLastCalledWith(config);
    expect(native.load).toHaveBeenCalledTimes(2);
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
    listeners[0]('background');
    await enqueuePlayerCommand('test:drain', async () => {});
    expect(native.pause).toHaveBeenCalled();
    expect(loadVideoSession()?.intent).toBe('playing');
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    jest.spyOn(Date, 'now').mockReturnValue(now + 30_000);
    listeners[0]('active');
    await enqueuePlayerCommand('test:drain', async () => {});
    expect(native.load).toHaveBeenLastCalledWith(config);
    expect(native.load).toHaveBeenCalledTimes(3);
  } finally {
    stop();
  }
});

it('用户暂停快照冷启动不自动继续；损坏快照可解除视频所有权', async () => {
  await joinVideoTask('video-default-49');
  await pauseVideo();
  const stop = startVideoLifecycle();
  try {
    await enqueuePlayerCommand('test:drain', async () => {});
    expect(native.load).toHaveBeenCalledTimes(1);
  } finally {
    stop();
  }
  storage.set('video_session_v1', '{}');
  const stopInvalid = startVideoLifecycle();
  try {
    await enqueuePlayerCommand('test:drain', async () => {});
    expect(isVideoOwner()).toBe(false);
  } finally {
    stopInvalid();
  }
});
