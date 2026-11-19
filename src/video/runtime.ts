import { AppState, DeviceEventEmitter, NativeModules } from 'react-native';
import TrackPlayer from 'react-native-track-player';
import { create } from 'zustand';
import {
  activeOccurrence,
  dueOccurrence,
  Occurrence,
  sessionTimeline,
  VideoSession,
} from '../../packages/program-core/src/tasks';
import { VIDEO_CATALOG } from './catalog';
import {
  loadVideoSession,
  loadVideoTasks,
  markVideoOccurrence,
  saveVideoSession,
  seenVideoOccurrences,
} from './persistence';
import { isVideoOwner, MEDIA_OWNER_CHANGED, setMediaOwner } from './ownership';
import { enqueuePlayerCommand } from '../utils/playerCommandQueue';
import { getSettings, saveCycleEligible, saveExpectedPlaying } from '../utils/storage';
import { buildPlayerOptions } from '../utils/playerOptions';
import { addLog } from '../utils/logger';

export const VIDEO_SESSION_CHANGED = 'StarlightVideoSessionChanged';
interface VideoState {
  session: VideoSession | null;
  error: string | null;
}
export const useVideoState = create<VideoState>(() => ({
  session: loadVideoSession(),
  error: null,
}));

function save(session: VideoSession | null): void {
  saveVideoSession(session);
  useVideoState.setState({ session, error: null });
  DeviceEventEmitter.emit(VIDEO_SESSION_CHANGED);
}

function nativePlayer() {
  if (!NativeModules.VideoProgramPlayer)
    throw new Error('此安装包尚未包含视频引擎，请重新构建安装');
  return NativeModules.VideoProgramPlayer;
}

async function loadNative(session: VideoSession): Promise<void> {
  const timeline = sessionTimeline(session, VIDEO_CATALOG);
  await nativePlayer().load({
    timescale: timeline.timescale,
    startEpochMs: session.occurrence.startEpochMs,
    spans: timeline.spans.map(s => ({
      file: s.asset,
      durationTicks: s.endTicks - s.startTicks,
    })),
  });
}

async function startInCommand(occurrence: Occurrence): Promise<void> {
  nativePlayer(); // Fail before changing the audio state.
  const session: VideoSession = { occurrence, intent: 'playing' };
  saveExpectedPlaying(false);
  saveCycleEligible(false);
  await TrackPlayer.pause();
  await TrackPlayer.updateOptions({
    capabilities: [],
    compactCapabilities: [],
    notificationCapabilities: [],
  });
  setMediaOwner('video');
  save(session);
  try {
    await loadNative(session);
    suppressEarlierVideoOccurrences(occurrence.startEpochMs);
    markVideoOccurrence(occurrence.key);
    addLog(
      'INFO',
      `VideoProgram joined ${occurrence.key} elapsed=${Date.now() - occurrence.startEpochMs}ms`,
    );
  } catch (error) {
    save({ ...session, intent: 'paused' });
    useVideoState.setState({ error: String(error) });
    throw error;
  }
}

/** Explicit taps may join disabled tasks, but never manufacture a new start time. */
export function joinVideoTask(taskId: string): Promise<void> {
  return enqueuePlayerCommand(`VideoProgram:join:${taskId}`, async () => {
    const current = loadVideoSession();
    const now = Date.now();
    const task = loadVideoTasks().find(t => t.id === taskId);
    // Edits/deletion never mutate an already active occurrence.
    const frozen =
      isVideoOwner() &&
      current?.occurrence.task.id === taskId &&
      now >= current.occurrence.startEpochMs &&
      now < current.occurrence.endEpochMs
        ? current.occurrence
        : null;
    const occurrence = frozen || (task && activeOccurrence(task, VIDEO_CATALOG, now));
    if (!occurrence)
      throw new Error('当前不在该任务的播放时段内，请在选定日期的启动时刻至流程结束之间加入。');
    await startInCommand(occurrence);
  });
}

export function pauseVideo(): Promise<void> {
  return enqueuePlayerCommand('VideoProgram:pause', async () => {
    if (!isVideoOwner()) return;
    await nativePlayer().pause();
    const session = loadVideoSession();
    if (session) save({ ...session, intent: 'paused' });
  });
}

export function resumeVideo(): Promise<void> {
  return enqueuePlayerCommand('VideoProgram:resume', async () => {
    if (!isVideoOwner()) return;
    const session = loadVideoSession();
    if (!session) throw new Error('没有可恢复的视频任务');
    if (Date.now() >= session.occurrence.endEpochMs) {
      await nativePlayer().stop();
      save({ ...session, intent: 'stopped' });
      return;
    }
    await startInCommand(session.occurrence);
  });
}

export function leaveVideo(): Promise<void> {
  return enqueuePlayerCommand('VideoProgram:leave', async () => {
    await nativePlayer().stop();
    const session = loadVideoSession();
    if (session) save({ ...session, intent: 'stopped' });
    setMediaOwner('audio');
    await TrackPlayer.updateOptions(buildPlayerOptions(getSettings()));
  });
}

let ticking = false;
export async function tickVideoTasks(): Promise<void> {
  if (AppState.currentState !== 'active' || ticking) return;
  const existing = loadVideoSession();
  if (
    !(
      isVideoOwner() &&
      existing &&
      existing.intent !== 'stopped' &&
      Date.now() >= existing.occurrence.endEpochMs
    ) &&
    !dueOccurrence(loadVideoTasks(), VIDEO_CATALOG, Date.now(), seenVideoOccurrences())
  )
    return;
  ticking = true;
  try {
    await enqueuePlayerCommand('VideoProgram:clock', async () => {
      if (AppState.currentState !== 'active') return;
      const now = Date.now();
      const session = loadVideoSession();
      if (
        isVideoOwner() &&
        session &&
        now >= session.occurrence.endEpochMs &&
        session.intent !== 'stopped'
      ) {
        await nativePlayer().stop();
        save({ ...session, intent: 'stopped' });
      }
      const due = dueOccurrence(loadVideoTasks(), VIDEO_CATALOG, now, seenVideoOccurrences());
      if (!due) return;
      // An edited current task, or an older overlapping task, must not interrupt its snapshot.
      if (
        isVideoOwner() &&
        session &&
        now < session.occurrence.endEpochMs &&
        (due.task.id === session.occurrence.task.id ||
          due.startEpochMs <= session.occurrence.startEpochMs)
      ) {
        markVideoOccurrence(due.key);
        return;
      }
      // Mark before attempting so a broken asset cannot retry/interfere every second.
      // A short, newer task can end while an unseen older window is still open.
      // Consume the overlapping older windows too, rather than falling back later.
      suppressEarlierVideoOccurrences(due.startEpochMs);
      markVideoOccurrence(due.key);
      await startInCommand(due);
    });
  } catch (error) {
    useVideoState.setState({ error: String(error) });
    addLog('ERROR', 'VideoProgram automatic start failed', error);
  } finally {
    ticking = false;
  }
}

/** A newer audio/video task must not later fall back to an older, still-open
 * video window. Must run inside the shared player command lock. Audio callers
 * use this only after playback starts successfully.
 */
export function suppressEarlierVideoOccurrences(startEpochMs: number): void {
  for (const task of loadVideoTasks()) {
    const occurrence = task.enabled && activeOccurrence(task, VIDEO_CATALOG, Date.now());
    if (occurrence && occurrence.startEpochMs <= startEpochMs) markVideoOccurrence(occurrence.key);
  }
}

/** Foreground video only. The OS notification brings the user back to join the live window. */
export function startVideoLifecycle(): () => void {
  const foreground = async () => {
    if (AppState.currentState !== 'active') return;
    const session = loadVideoSession();
    // A removed/changed media revision must not strand the UI in video ownership.
    if (isVideoOwner() && !session) {
      await leaveVideo().catch(error =>
        addLog('ERROR', 'VideoProgram reset invalid session', error),
      );
    }
    if (isVideoOwner() && session?.intent === 'playing') {
      await resumeVideo().catch(error => useVideoState.setState({ error: String(error) }));
    }
    await tickVideoTasks();
  };
  void foreground();
  const timer = setInterval(() => {
    void tickVideoTasks();
  }, 1000);
  const subscription = AppState.addEventListener('change', state => {
    if (state === 'active') void foreground();
    else {
      // Preserve user intent, but native playback may not continue invisibly.
      enqueuePlayerCommand('VideoProgram:background', async () => {
        if (isVideoOwner()) await nativePlayer().pause();
      }).catch(error => addLog('ERROR', 'VideoProgram background pause failed', error));
    }
  });
  const ownership = DeviceEventEmitter.addListener(MEDIA_OWNER_CHANGED, () => {
    if (!isVideoOwner()) {
      const session = loadVideoSession();
      if (session && session.intent !== 'stopped') save({ ...session, intent: 'stopped' });
    }
  });
  return () => {
    clearInterval(timer);
    subscription.remove();
    ownership.remove();
  };
}
