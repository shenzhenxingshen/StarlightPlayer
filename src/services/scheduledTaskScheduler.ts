import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { ScheduledTask } from '../types/scheduledTask';
import { addLog } from '../utils/logger';

interface NativeScheduledTaskManager {
  syncTasks(tasks: ScheduledTask[]): Promise<TaskSchedulingStatus>;
  consumePendingTrigger(): Promise<ScheduledTaskTrigger | null>;
  requestSchedulingPermission(): Promise<TaskSchedulingStatus>;
  getSchedulingStatus(): Promise<TaskSchedulingStatus>;
  openBackgroundSettings?(): Promise<TaskSchedulingStatus>;
  markAutomaticTaskStarted?(taskId: string, scheduledAt: number): void;
  addListener?(eventName: string): void;
  removeListeners?(count: number): void;
}

export interface TaskSchedulingStatus {
  platform: 'android' | 'ios' | 'unsupported';
  notificationPermission: 'authorized' | 'denied' | 'not-determined' | 'unsupported';
  exactAlarmPermission: 'authorized' | 'denied' | 'not-needed' | 'unsupported';
}

export interface ScheduledTaskTrigger {
  taskId: string;
  source: 'ios-foreground' | 'ios-background' | 'notification-tap';
  scheduledAt?: number;
}

const nativeManager = NativeModules.ScheduledTaskManager as NativeScheduledTaskManager | undefined;
let scheduleSyncTail: Promise<unknown> = Promise.resolve();

export const UNSUPPORTED_SCHEDULING_STATUS: TaskSchedulingStatus = {
  platform: 'unsupported',
  notificationPermission: 'unsupported',
  exactAlarmPermission: 'unsupported',
};

export function syncTaskSchedules(tasks: readonly ScheduledTask[]): Promise<TaskSchedulingStatus> {
  if (!nativeManager) return Promise.resolve(UNSUPPORTED_SCHEDULING_STATUS);
  const snapshot = [...tasks];
  const operation = scheduleSyncTail.then(
    () => nativeManager.syncTasks(snapshot),
    () => nativeManager.syncTasks(snapshot),
  );
  scheduleSyncTail = operation.catch(error => {
    addLog('ERROR', 'syncTaskSchedules failed', error);
  });
  return operation;
}

export async function getTaskSchedulingStatus(): Promise<TaskSchedulingStatus> {
  if (!nativeManager) return UNSUPPORTED_SCHEDULING_STATUS;
  return nativeManager.getSchedulingStatus();
}

export async function requestTaskSchedulingPermission(): Promise<TaskSchedulingStatus> {
  if (!nativeManager) return UNSUPPORTED_SCHEDULING_STATUS;
  return nativeManager.requestSchedulingPermission();
}

export async function openTaskBackgroundSettings(): Promise<TaskSchedulingStatus> {
  if (!nativeManager?.openBackgroundSettings) return getTaskSchedulingStatus();
  return nativeManager.openBackgroundSettings();
}

export function markAutomaticTaskStarted(trigger: ScheduledTaskTrigger): void {
  if (trigger.source !== 'ios-background' || trigger.scheduledAt == null) return;
  nativeManager?.markAutomaticTaskStarted?.(trigger.taskId, trigger.scheduledAt);
}

export async function consumePendingScheduledTask(): Promise<ScheduledTaskTrigger | null> {
  if (!nativeManager) return null;
  return nativeManager.consumePendingTrigger();
}

export function subscribeScheduledTaskTriggers(
  listener: (trigger: ScheduledTaskTrigger) => void,
): () => void {
  if (!nativeManager || Platform.OS !== 'ios') return () => {};
  const emitter = new NativeEventEmitter(NativeModules.ScheduledTaskManager);
  const subscription = emitter.addListener('ScheduledTaskDue', listener);
  return () => subscription.remove();
}
