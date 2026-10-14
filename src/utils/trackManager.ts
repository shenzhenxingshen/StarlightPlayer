import TrackPlayer, { State } from 'react-native-track-player';
import { TRACKS } from '../constants/tracks';
import { Track } from '../types';
import { calculateAlignedPosition, msToSeconds } from './syncUtils';
import { getLocalAudioUrl } from './getLocalAudioUrl';
import { enqueuePlayerCommand } from './playerCommandQueue';
import { seekWithReasonInCommand } from './playbackCycle';
import {
  TrackChangeReason,
  beginPendingTrackChange,
  clearPlaybackPausedAt,
  clearPendingTrackChange,
  ensurePlaybackTask,
  getSettings,
  isPendingTrackChange,
  loadCurrentTrack,
  loadPlayerState,
  loadSessionCount,
  resetPlaybackTask,
  saveCurrentTrack,
  saveExpectedPlaying,
  saveSessionCount,
} from './storage';
import { addLog } from './logger';

function clampIndex(idx: number): number {
  return Math.max(0, Math.min(idx, TRACKS.length - 1));
}

function indexFromTrackId(trackId?: string | null): number {
  if (!trackId) return -1;
  return TRACKS.findIndex(track => track.id === trackId);
}

export function getCurrentIndex(): number {
  const current = loadCurrentTrack();
  if (current) {
    const byId = indexFromTrackId(current.id);
    if (byId >= 0) return byId;
    if (current.index >= 0 && current.index < TRACKS.length) return current.index;
  }
  return clampIndex(loadPlayerState()?.trackIndex ?? 0);
}

/** 仅供状态恢复和测试使用；正常换歌必须调用 loadTrack/loadTrackAndPlay。 */
export function setCurrentIndex(idx: number): void {
  const index = clampIndex(idx);
  saveCurrentTrack({ id: TRACKS[index].id, index });
}

export function getNextIndex(trackId?: string | null): number {
  const byId = indexFromTrackId(trackId);
  const current = byId >= 0 ? byId : getCurrentIndex();
  return (current + 1) % TRACKS.length;
}

export function getPrevIndex(trackId?: string | null): number {
  const byId = indexFromTrackId(trackId);
  const current = byId >= 0 ? byId : getCurrentIndex();
  return (current - 1 + TRACKS.length) % TRACKS.length;
}

export function isLastTrack(trackId?: string | null): boolean {
  const byId = indexFromTrackId(trackId);
  const current = byId >= 0 ? byId : getCurrentIndex();
  return current >= TRACKS.length - 1;
}

async function playWithRetryInCommand(context: string): Promise<void> {
  let lastError: unknown;
  saveExpectedPlaying(true);
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      if (attempt > 1) await TrackPlayer.retry();
      await TrackPlayer.play();
      await waitForPlaybackStartInCommand(context);
      clearPlaybackPausedAt();
      return;
    } catch (error) {
      lastError = error;
      addLog('ERROR', `${context}: play attempt ${attempt} failed`, error);
    }
  }
  throw lastError;
}

const PLAYBACK_START_TIMEOUT_MS = 3000;
const PLAYBACK_STATE_POLL_MS = 150;

function isPlaybackStartingOrRunning(state: State): boolean {
  return state === State.Playing || state === State.Buffering || state === State.Loading;
}

async function waitForPlaybackStartInCommand(context: string): Promise<void> {
  const deadline = Date.now() + PLAYBACK_START_TIMEOUT_MS;
  let lastState = (await TrackPlayer.getPlaybackState()).state;
  while (!isPlaybackStartingOrRunning(lastState) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, PLAYBACK_STATE_POLL_MS));
    lastState = (await TrackPlayer.getPlaybackState()).state;
  }
  if (!isPlaybackStartingOrRunning(lastState)) {
    throw new Error(`${context}: playback did not start, state=${lastState}`);
  }
}

/** 只允许在 enqueuePlayerCommand 的 operation 内调用。 */
export async function ensureCurrentTrackLoadedInCommand(context: string): Promise<Track> {
  const persisted = loadCurrentTrack();
  const active = await TrackPlayer.getActiveTrack();
  const activeId = active?.id == null ? null : String(active.id);
  const activeIndex = indexFromTrackId(activeId);

  if (!persisted && activeIndex >= 0) {
    saveCurrentTrack({ id: TRACKS[activeIndex].id, index: activeIndex });
    ensurePlaybackTask(TRACKS[activeIndex].id, loadSessionCount());
    return TRACKS[activeIndex];
  }

  const expectedIndex = persisted ? indexFromTrackId(persisted.id) : getCurrentIndex();
  const index = expectedIndex >= 0 ? expectedIndex : getCurrentIndex();
  const expected = TRACKS[index];
  if (activeId === expected.id) {
    ensurePlaybackTask(expected.id, loadSessionCount());
    return expected;
  }

  addLog(
    'WARN',
    `${context}: rebuilding queue, persisted=${expected.id} active=${activeId ?? 'none'}`,
  );
  const restored = await replaceTrackInCommand(index, 'restore');
  if (!restored) throw new Error(`${context}: queue rebuild became stale`);
  return restored;
}

export async function ensurePlayableAndPlayInCommand(
  context: string,
  options: { restartTerminal?: boolean; alignToClock?: boolean } = {},
): Promise<void> {
  const restartTerminal = options.restartTerminal ?? true;
  const alignToClock = options.alignToClock ?? false;
  let track = await ensureCurrentTrackLoadedInCommand(context);
  let state = (await TrackPlayer.getPlaybackState()).state;

  if (state === State.Error || state === State.None) {
    const restored = await replaceTrackInCommand(indexFromTrackId(track.id), 'restore');
    if (!restored) throw new Error(`${context}: error-state rebuild became stale`);
    track = restored;
    state = (await TrackPlayer.getPlaybackState()).state;
  }

  if (alignToClock && track.durationMs) {
    await seekWithReasonInCommand(
      msToSeconds(calculateAlignedPosition(track.durationMs)),
      'sync-recovery',
      msToSeconds(track.durationMs),
    );
  } else if (
    restartTerminal &&
    (state === State.Ended || state === State.Stopped || state === State.Error)
  ) {
    await seekWithReasonInCommand(0, 'cycle-restart', msToSeconds(track.durationMs || 0));
  }

  await playWithRetryInCommand(context);
}

/** 只允许在 enqueuePlayerCommand 的 operation 内调用，避免嵌套队列。 */
export async function replaceTrackInCommand(
  idx: number,
  reason: TrackChangeReason,
): Promise<Track | null> {
  const index = clampIndex(idx);
  const track = TRACKS[index];
  const pending = beginPendingTrackChange(track.id, index, reason);
  addLog('INFO', `replaceTrack: idx=${index} track=${track.id} reason=${reason}`);

  try {
    await TrackPlayer.reset();
    if (!isPendingTrackChange(pending.token)) {
      addLog('WARN', `replaceTrack stale after reset: ${track.id}`);
      return null;
    }

    await TrackPlayer.add({
      id: track.id,
      starlightGeneration: pending.generation,
      url: getLocalAudioUrl(track.audioUrl),
      title: track.title,
      artist: track.subtitle || '',
      artwork: require('../assets/images/vinyl-cover.png'),
      duration: msToSeconds(track.durationMs || 0),
    });

    if (!isPendingTrackChange(pending.token)) {
      addLog('WARN', `replaceTrack stale after add: ${track.id}`);
      return null;
    }

    saveCurrentTrack({ id: track.id, index });

    if (reason !== 'restore') {
      saveSessionCount(0);
      resetPlaybackTask(track.id);
      const position =
        getSettings().isSyncMode && track.durationMs
          ? msToSeconds(calculateAlignedPosition(track.durationMs))
          : 0;
      await seekWithReasonInCommand(position, 'track-start', msToSeconds(track.durationMs || 0));
    } else {
      // 只有本地队列丢失时才会走到这里；新队列从 0 开始，
      // 保留已完成遍数，但当前这一遍可重新获得计数资格。
      ensurePlaybackTask(track.id, loadSessionCount());
      await seekWithReasonInCommand(0, 'track-start', msToSeconds(track.durationMs || 0));
    }

    return track;
  } finally {
    clearPendingTrackChange(pending.token);
  }
}

export function loadTrack(idx: number, reason: TrackChangeReason = 'user'): Promise<Track | null> {
  return enqueuePlayerCommand(`loadTrack(${idx}, ${reason})`, () =>
    replaceTrackInCommand(idx, reason),
  );
}

export function loadTrackAndPlay(
  idx: number,
  reason: TrackChangeReason = 'user',
): Promise<Track | null> {
  return enqueuePlayerCommand(`loadTrackAndPlay(${idx}, ${reason})`, async () => {
    const track = await replaceTrackInCommand(idx, reason);
    if (!track) return null;
    await playWithRetryInCommand(`loadTrackAndPlay:${track.id}`);
    return track;
  });
}

export function loadNextTrackAndPlay(reason: TrackChangeReason = 'user'): Promise<Track | null> {
  return enqueuePlayerCommand(`loadNextTrackAndPlay(${reason})`, async () => {
    const track = await replaceTrackInCommand(getNextIndex(), reason);
    if (!track) return null;
    await playWithRetryInCommand(`loadNextTrackAndPlay:${track.id}`);
    return track;
  });
}

export function loadPreviousTrackAndPlay(
  reason: TrackChangeReason = 'user',
): Promise<Track | null> {
  return enqueuePlayerCommand(`loadPreviousTrackAndPlay(${reason})`, async () => {
    const track = await replaceTrackInCommand(getPrevIndex(), reason);
    if (!track) return null;
    await playWithRetryInCommand(`loadPreviousTrackAndPlay:${track.id}`);
    return track;
  });
}

export { playWithRetryInCommand };
