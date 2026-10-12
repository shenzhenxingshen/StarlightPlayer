import TrackPlayer, { Event, State } from 'react-native-track-player';
import { TRACKS } from '../constants/tracks';
import { calculateAlignedPosition, msToSeconds } from '../utils/syncUtils';
import { useStatsStore } from '../store/statsStore';
import {
  clearPlaybackPausedAt,
  getSettings,
  loadCurrentTrack,
  loadCycleEligible,
  loadExpectedPlaying,
  loadPendingTrackChange,
  loadPlayerState,
  loadSessionCount,
  loadTrackGeneration,
  saveCurrentTrack,
  saveCycleEligible,
  saveExpectedPlaying,
  savePlaybackPausedAt,
  saveSessionCount,
} from '../utils/storage';
import {
  ensureCurrentTrackLoadedInCommand,
  ensurePlayableAndPlayInCommand,
  getNextIndex,
  getPrevIndex,
  isLastTrack,
  playWithRetryInCommand,
  replaceTrackInCommand,
} from '../utils/trackManager';
import { addLog } from '../utils/logger';
import { enqueuePlayerCommand } from '../utils/playerCommandQueue';
import { resetCycleIfCompleted, seekWithReasonInCommand } from '../utils/playbackCycle';
import { decidePostCycleAction, isValidQueueEndPosition } from '../utils/playbackDecision';

let serviceInitialized = false;
let queueEndedInFlight = false;
let lastQueueEndedKey = '';
let lastQueueEndedAt = 0;
let recoveryTimer: ReturnType<typeof setTimeout> | null = null;

export function isStartedFromZero() {
  return loadCycleEligible();
}
export { resetCycleIfCompleted };

const increment = (id: string) => useStatsStore.getState().increment(id);

function currentTrackId(): string | null {
  return loadCurrentTrack()?.id ?? null;
}

function completeCycle(trackId: string | null, endedNearDuration: boolean) {
  const eligible = loadCycleEligible() && endedNearDuration;
  if (trackId && eligible) {
    increment(trackId);
    const next = loadSessionCount() + 1;
    saveSessionCount(next);
    addLog('INFO', `completeCycle: ${trackId} counted, session=${next}`);
  } else {
    addLog(
      'INFO',
      `completeCycle: ${trackId} skipped(eligible=${loadCycleEligible()}, nearEnd=${endedNearDuration})`,
    );
  }
  saveCycleEligible(false);
}

async function restartCurrentCycleInCommand(
  reason: 'cycle-restart' | 'sync-resume',
): Promise<void> {
  const track = await ensureCurrentTrackLoadedInCommand(`restart:${reason}`);

  const duration = msToSeconds(track.durationMs || 0);
  if (reason === 'sync-resume' && !getSettings().isSyncMode) {
    await ensurePlayableAndPlayInCommand(`restart:${track.id}`);
    addLog('INFO', `restartCycle: ${track.id} sync resume cancelled because sync mode changed`);
    return;
  }
  const position =
    reason === 'sync-resume' && track.durationMs
      ? msToSeconds(calculateAlignedPosition(track.durationMs))
      : 0;
  await seekWithReasonInCommand(position, reason, duration);
  await ensurePlayableAndPlayInCommand(`restart:${track.id}`, { restartTerminal: false });
  addLog('INFO', `restartCycle: ${track.id} → ${position.toFixed(2)}s/${duration.toFixed(2)}s`);
}

async function runEventCommand(label: string, operation: () => Promise<void>): Promise<void> {
  try {
    await enqueuePlayerCommand(label, operation);
  } catch (error) {
    // 事件回调不向 RNTP 抛出 rejected Promise，避免二次全局崩溃。
    addLog('ERROR', `${label} event failed`, error);
    if (loadExpectedPlaying()) scheduleUnexpectedStopRecovery(`${label}-error`);
  }
}

async function retryQueueAction(label: string, operation: () => Promise<void>): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await operation();
      if (attempt > 1) addLog('INFO', `${label} recovered on attempt ${attempt}`);
      return;
    } catch (error) {
      lastError = error;
      addLog('ERROR', `${label} attempt ${attempt} failed`, error);
    }
  }
  throw lastError;
}

async function switchToTrackInCommand(idx: number, reason: 'auto-next' | 'remote') {
  const track = await replaceTrackInCommand(idx, reason);
  if (!track) return;
  await playWithRetryInCommand(`switchToTrack:${track.id}`);
}

function isPlaybackStartingOrRunning(state: State): boolean {
  return state === State.Playing || state === State.Buffering || state === State.Loading;
}

function scheduleUnexpectedStopRecovery(source: string, attempt = 1) {
  if (recoveryTimer) return;
  const delay = [1500, 3000, 6000][Math.min(attempt - 1, 2)];
  recoveryTimer = setTimeout(async () => {
    recoveryTimer = null;
    if (!loadExpectedPlaying()) return;
    let recovered = false;
    try {
      await enqueuePlayerCommand(`watchdog:${source}:${attempt}`, async () => {
        const state = (await TrackPlayer.getPlaybackState()).state;
        const activeTrack = await TrackPlayer.getActiveTrack();
        if (isPlaybackStartingOrRunning(state) && activeTrack) {
          recovered = true;
          return;
        }
        addLog(
          'WARN',
          `Playback watchdog recovery: source=${source} attempt=${attempt} state=${state} active=${String(activeTrack?.id ?? 'none')}`,
        );
        await ensurePlayableAndPlayInCommand(`watchdog:${source}:${attempt}`);
        recovered = true;
      });
    } catch (error) {
      addLog('ERROR', `watchdog:${source} attempt ${attempt} failed`, error);
    }

    if (!recovered && loadExpectedPlaying()) {
      if (attempt < 3) {
        scheduleUnexpectedStopRecovery(source, attempt + 1);
      } else {
        saveExpectedPlaying(false);
        addLog('ERROR', `Playback watchdog exhausted: source=${source}`);
      }
    }
  }, delay);
}

async function reconcileActiveTrackInCommand(track: { id: string }, observedGeneration: number) {
  if (observedGeneration !== loadTrackGeneration()) {
    addLog('WARN', `ActiveTrackChanged stale generation ignored: ${track.id}`);
    return;
  }
  const nativeTrack = await TrackPlayer.getActiveTrack();
  if (String(nativeTrack?.id ?? '') !== track.id) {
    addLog(
      'WARN',
      `ActiveTrackChanged stale native track ignored: event=${track.id} native=${String(nativeTrack?.id ?? 'none')}`,
    );
    return;
  }
  const index = TRACKS.findIndex(item => item.id === track.id);
  if (index < 0) {
    addLog('ERROR', `ActiveTrackChanged unknown track: ${track.id}`);
    return;
  }

  const previous = loadCurrentTrack();
  const pending = loadPendingTrackChange();

  if (pending?.trackId === track.id && pending.generation === observedGeneration) {
    saveCurrentTrack({ id: track.id, index });
    addLog('INFO', `ActiveTrackChanged expected: ${track.id} reason=${pending.reason}`);
    return;
  }
  if (previous?.id === track.id) {
    addLog('INFO', `ActiveTrackChanged restored: ${track.id}`);
    return;
  }

  addLog('WARN', `ActiveTrackChanged unexpected: ${previous?.id ?? 'none'}→${track.id}`);
  saveCurrentTrack({ id: track.id, index });
  saveSessionCount(0);
  const metadata = TRACKS[index];
  const position =
    getSettings().isSyncMode && metadata.durationMs
      ? msToSeconds(calculateAlignedPosition(metadata.durationMs))
      : 0;
  await seekWithReasonInCommand(position, 'track-start', msToSeconds(metadata.durationMs || 0));
}

export default async function PlaybackService() {
  if (serviceInitialized) return;
  serviceInitialized = true;

  // ─── 远程控制 ───
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    addLog('INFO', 'RemotePlay');
    await runEventCommand('RemotePlay', async () => {
      const didReset = resetCycleIfCompleted();
      const track = await ensureCurrentTrackLoadedInCommand('RemotePlay');
      const syncMode = getSettings().isSyncMode;
      if (syncMode && track.durationMs) {
        await seekWithReasonInCommand(
          msToSeconds(calculateAlignedPosition(track.durationMs)),
          'sync-resume',
          msToSeconds(track.durationMs),
        );
      } else {
        if (didReset) {
          await seekWithReasonInCommand(0, 'cycle-restart', msToSeconds(track.durationMs || 0));
        }
      }
      await ensurePlayableAndPlayInCommand('RemotePlay', { restartTerminal: !syncMode });
    });
  });
  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    addLog('INFO', 'RemotePause');
    await runEventCommand('RemotePause', async () => {
      saveExpectedPlaying(false);
      savePlaybackPausedAt();
      await TrackPlayer.pause();
    });
  });
  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    addLog('INFO', 'RemoteNext');
    await runEventCommand('RemoteNext', () =>
      switchToTrackInCommand(getNextIndex(currentTrackId()), 'remote'),
    );
  });
  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    addLog('INFO', 'RemotePrevious');
    await runEventCommand('RemotePrevious', () =>
      switchToTrackInCommand(getPrevIndex(currentTrackId()), 'remote'),
    );
  });
  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    addLog('INFO', 'RemoteStop');
    await runEventCommand('RemoteStop', async () => {
      saveExpectedPlaying(false);
      saveCycleEligible(false);
      clearPlaybackPausedAt();
      await TrackPlayer.stop();
    });
  });
  TrackPlayer.addEventListener(Event.RemoteSeek, async ({ position }) => {
    addLog('INFO', `RemoteSeek: ${position.toFixed(2)}s sync=${getSettings().isSyncMode}`);
    await runEventCommand('RemoteSeek', async () => {
      const id = currentTrackId();
      const track = TRACKS.find(item => item.id === id);
      if (getSettings().isSyncMode && track?.durationMs) {
        const aligned = msToSeconds(calculateAlignedPosition(track.durationMs));
        await seekWithReasonInCommand(aligned, 'sync-resume', msToSeconds(track.durationMs));
        return;
      }
      await seekWithReasonInCommand(position, 'remote-seek', msToSeconds(track?.durationMs || 0));
    });
  });

  // ─── 来电恢复 ───
  let shouldResumeAfterDuck = false;
  TrackPlayer.addEventListener(Event.RemoteDuck, async ({ paused, permanent }) => {
    addLog(
      'INFO',
      `RemoteDuck: paused=${paused} permanent=${permanent} resume=${shouldResumeAfterDuck}`,
    );
    if (permanent) {
      shouldResumeAfterDuck = false;
      await runEventCommand('RemoteDuck:permanent', async () => {
        saveExpectedPlaying(false);
        saveCycleEligible(false);
        clearPlaybackPausedAt();
        await TrackPlayer.stop();
      });
      return;
    }
    if (paused) {
      await runEventCommand('RemoteDuck:pause', async () => {
        const wasExpectedPlaying = loadExpectedPlaying();
        shouldResumeAfterDuck = wasExpectedPlaying;
        if (wasExpectedPlaying) savePlaybackPausedAt();
        await TrackPlayer.pause();
      });
      return;
    }
    if (!shouldResumeAfterDuck || !loadExpectedPlaying()) {
      shouldResumeAfterDuck = false;
      return;
    }
    shouldResumeAfterDuck = false;
    await runEventCommand('RemoteDuck:resume', async () => {
      if (getSettings().isSyncMode) await restartCurrentCycleInCommand('sync-resume');
      else await ensurePlayableAndPlayInCommand('RemoteDuck:resume');
    });
  });

  // ─── 换歌 ───
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async ({ track }) => {
    if (!track) return;
    const observedGeneration = loadTrackGeneration();
    await runEventCommand(`ActiveTrackChanged:${String(track.id)}`, () =>
      reconcileActiveTrackInCommand({ id: String(track.id) }, observedGeneration),
    );
  });

  // ─── 队列结束 ───
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async ({ position }) => {
    const id = currentTrackId();
    const generation = loadTrackGeneration();
    const key = `${id ?? 'none'}:${generation}`;
    const now = Date.now();
    const sinceLastQueueEnd = now - lastQueueEndedAt;
    if (
      queueEndedInFlight ||
      (key === lastQueueEndedKey && sinceLastQueueEnd >= 0 && sinceLastQueueEnd < 5000)
    ) {
      addLog('WARN', `QueueEnded duplicate ignored: ${key}`);
      return;
    }
    queueEndedInFlight = true;
    lastQueueEndedKey = key;
    lastQueueEndedAt = now;

    try {
      await enqueuePlayerCommand(`QueueEnded:${key}`, async () => {
        if (generation !== loadTrackGeneration() || id !== currentTrackId()) {
          addLog(
            'WARN',
            `QueueEnded stale generation ignored: event=${key} current=${currentTrackId() ?? 'none'}:${loadTrackGeneration()}`,
          );
          return;
        }
        const nativeTrack = await TrackPlayer.getActiveTrack();
        const nativeTrackId = nativeTrack?.id == null ? null : String(nativeTrack.id);
        const nativeGeneration = Number(nativeTrack?.starlightGeneration);
        if (Number.isInteger(nativeGeneration) && nativeGeneration !== generation) {
          addLog(
            'WARN',
            `QueueEnded stale native generation ignored: event=${generation} native=${nativeGeneration}`,
          );
          return;
        }
        if (id && nativeTrackId && nativeTrackId !== id) {
          addLog('WARN', `QueueEnded stale event ignored: persisted=${id} native=${nativeTrackId}`);
          return;
        }

        const sourceId = id ?? nativeTrackId;
        const sourceIndex = TRACKS.findIndex(item => item.id === sourceId);
        if (!sourceId || sourceIndex < 0) {
          addLog(
            'ERROR',
            `QueueEnded cannot resolve active track: persisted=${id} native=${nativeTrackId}`,
          );
          return;
        }
        if (!id) saveCurrentTrack({ id: sourceId, index: sourceIndex });

        const pm = loadPlayerState()?.playMode || 'repeat-one';
        const { repeatCount } = getSettings();
        const track = TRACKS[sourceIndex];
        const duration = msToSeconds(track?.durationMs || 0);
        const nativePosition = (await TrackPlayer.getProgress()).position;
        const eventNearDuration = isValidQueueEndPosition(position, duration);
        const nativeNearDuration = isValidQueueEndPosition(nativePosition, duration);
        const endedNearDuration = eventNearDuration && nativeNearDuration;
        addLog(
          'INFO',
          `QueueEnded: track=${sourceId} event=${position.toFixed(2)} native=${nativePosition.toFixed(2)}/${duration.toFixed(2)} nearEnd=${endedNearDuration} mode=${pm} session=${loadSessionCount()} repeat=${repeatCount}`,
        );

        completeCycle(sourceId, endedNearDuration);
        const count = loadSessionCount();
        const action = decidePostCycleAction(pm, count, repeatCount, isLastTrack(sourceId));

        // completeCycle 只在重试外执行一次，保证重启/换曲失败时不会重复计数。
        await retryQueueAction(`QueueEnded action ${action}`, async () => {
          switch (action) {
            case 'restart-current':
              await restartCurrentCycleInCommand('cycle-restart');
              break;
            case 'restart-current-reset-count':
              saveSessionCount(0);
              await restartCurrentCycleInCommand('cycle-restart');
              break;
            case 'stop':
              saveExpectedPlaying(false);
              saveCycleEligible(false);
              break;
            case 'next-track':
              await switchToTrackInCommand(getNextIndex(sourceId), 'auto-next');
              break;
          }
        });
      });
    } catch (error) {
      addLog('ERROR', `QueueEnded handler failed: ${key}`, error);
      scheduleUnexpectedStopRecovery('queue-ended-error');
    } finally {
      queueEndedInFlight = false;
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackError, ({ code, message }) => {
    addLog('ERROR', `PlaybackError: ${code} ${message}`);
    if (loadExpectedPlaying()) scheduleUnexpectedStopRecovery('playback-error');
  });

  TrackPlayer.addEventListener(Event.PlayerError, ({ code, message }) => {
    addLog('ERROR', `PlayerError: ${code} ${message}`);
    if (loadExpectedPlaying()) scheduleUnexpectedStopRecovery('player-error');
  });

  TrackPlayer.addEventListener(Event.PlaybackState, ({ state }) => {
    addLog('INFO', `PlaybackState: ${state} expected=${loadExpectedPlaying()}`);
    if (
      loadExpectedPlaying() &&
      (state === State.Ended ||
        state === State.Error ||
        state === State.Stopped ||
        state === State.None)
    ) {
      scheduleUnexpectedStopRecovery(`state-${state}`);
    }
  });
}
