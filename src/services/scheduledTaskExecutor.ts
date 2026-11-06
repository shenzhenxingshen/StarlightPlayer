import { DeviceEventEmitter } from 'react-native';
import TrackPlayer, { RepeatMode } from 'react-native-track-player';
import { TRACKS } from '../constants/tracks';
import { useSettingsStore } from '../store/settingsStore';
import { buildPlayerOptions } from '../utils/playerOptions';
import { enqueuePlayerCommand } from '../utils/playerCommandQueue';
import { addLog } from '../utils/logger';
import {
  getSettings,
  loadScheduledTask,
  saveExpectedPlaying,
  savePlayerState,
  setSettings,
} from '../utils/storage';
import { playWithRetryInCommand, replaceTrackInCommand } from '../utils/trackManager';

export type ScheduledTaskExecutionSource =
  | 'manual'
  | 'ios-foreground'
  | 'notification-tap'
  | 'android-alarm';

export interface ScheduledTaskExecutionPayload {
  taskId: string;
  source: ScheduledTaskExecutionSource;
  scheduledAt?: number;
}

// 系统触发明显延迟时视为已经错过，不在稍后补播；只有任务列表的“立即播放”不受此限制。
export const AUTOMATIC_TASK_WINDOW_MS = 60_000;

function isAlreadyInitialized(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string };
  return (
    candidate?.code === 'player_already_initialized' ||
    candidate?.message?.includes('already been initialized') === true
  );
}

async function ensurePlayerInitialized(): Promise<void> {
  try {
    await TrackPlayer.setupPlayer({ minBuffer: 5, maxBuffer: 50, autoHandleInterruptions: false });
  } catch (error) {
    if (!isAlreadyInitialized(error)) throw error;
  }
  await TrackPlayer.setRepeatMode(RepeatMode.Off);
}

async function executeScheduledTaskInSequence(
  payload: ScheduledTaskExecutionPayload,
): Promise<boolean> {
  const task = loadScheduledTask(payload.taskId);
  if (!task) {
    addLog('WARN', `ScheduledTask missing: ${payload.taskId}`);
    return false;
  }
  if (payload.source !== 'manual' && !task.enabled) {
    addLog('INFO', `ScheduledTask disabled, ignored: ${task.id}`);
    return false;
  }
  const automaticDelay = payload.scheduledAt == null ? null : Date.now() - payload.scheduledAt;
  if (
    payload.source !== 'manual' &&
    automaticDelay != null &&
    automaticDelay > AUTOMATIC_TASK_WINDOW_MS
  ) {
    addLog(
      'WARN',
      `ScheduledTask missed window: ${task.id} source=${payload.source} delay=${automaticDelay}ms`,
    );
    return false;
  }

  const trackIndex = TRACKS.findIndex(track => track.id === task.trackId);
  if (trackIndex < 0) {
    addLog('ERROR', `ScheduledTask unknown track: ${task.trackId}`);
    return false;
  }

  const currentSettings = getSettings();
  const nextSettings = {
    isCareMode: currentSettings.isCareMode,
    isSyncMode: task.isSyncMode,
    repeatCount: task.repeatCount,
  };
  setSettings(nextSettings);
  useSettingsStore.setState(nextSettings);
  savePlayerState({ trackIndex, playMode: task.playMode });
  DeviceEventEmitter.emit('StarlightPlayModeChanged', task.playMode);

  try {
    await enqueuePlayerCommand(`ScheduledTask:start:${task.id}`, async () => {
      await ensurePlayerInitialized();
      await TrackPlayer.updateOptions(buildPlayerOptions(nextSettings));
      const track = await replaceTrackInCommand(trackIndex, 'user');
      if (!track) throw new Error(`ScheduledTask queue replacement became stale: ${task.id}`);
      await playWithRetryInCommand(`ScheduledTask:${task.id}`);
    });
    addLog(
      'INFO',
      `ScheduledTask started: ${task.id} source=${payload.source} track=${task.trackId} repeat=${task.repeatCount} mode=${task.playMode} sync=${task.isSyncMode}`,
    );
    return true;
  } catch (error) {
    saveExpectedPlaying(false);
    addLog('ERROR', `ScheduledTask start failed: ${task.id}`, error);
    throw error;
  }
}

let taskExecutionTail: Promise<unknown> = Promise.resolve();

export function executeScheduledTask(payload: ScheduledTaskExecutionPayload): Promise<boolean> {
  const operation = taskExecutionTail.then(
    () => executeScheduledTaskInSequence(payload),
    () => executeScheduledTaskInSequence(payload),
  );
  taskExecutionTail = operation.catch(() => {});
  return operation;
}

export async function runScheduledTaskHeadless(
  payload: ScheduledTaskExecutionPayload,
): Promise<void> {
  await executeScheduledTask({ ...payload, source: 'android-alarm' });
}
