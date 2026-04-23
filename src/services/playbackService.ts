import TrackPlayer, { Event, State } from 'react-native-track-player';
import { TRACKS } from '../constants/tracks';
import { calculateAlignedPosition, msToSeconds } from '../utils/syncUtils';
import { useStatsStore } from '../store/statsStore';
import {
  setAlignSeekExpectedUntil, shouldSeekAlign, loadPlayerState,
  saveSessionCount, loadSessionCount, saveStartedFromZero, loadStartedFromZero, getSettings,
} from '../utils/storage';
import { loadTrack, getCurrentIndex, getNextIndex, isLastTrack } from '../utils/trackManager';
import { addLog } from '../utils/logger';

// currentTrackId 仅 Service 端使用，不需要跨运行时
let currentTrackId: string | null = null;

// UI 端读取用 loadStartedFromZero()
export function isStartedFromZero() { return loadStartedFromZero(); }

// 手动播放前调用：如果上一轮已结束，重置遍数开启新一轮。返回是否重置。
export function resetCycleIfCompleted(): boolean {
  const { repeatCount } = getSettings();
  const count = loadSessionCount();
  if (count >= repeatCount) {
    saveSessionCount(0);
    saveStartedFromZero(!shouldSeekAlign(''));
    addLog('INFO', `resetCycle: ${count}>=${repeatCount} → reset`);
    return true;
  }
  return false;
}

const increment = (id: string) => useStatsStore.getState().increment(id);

async function seekAligned() {
  if (shouldSeekAlign('') && currentTrackId) {
    const t = TRACKS.find(tr => tr.id === currentTrackId);
    if (t?.durationMs) {
      setAlignSeekExpectedUntil(Date.now() + 3000);
      const pos = msToSeconds(calculateAlignedPosition(t.durationMs));
      await TrackPlayer.seekTo(pos);
      addLog('INFO', `seekAligned: ${currentTrackId} → ${pos.toFixed(1)}s/${msToSeconds(t.durationMs).toFixed(1)}s`);
      return pos;
    }
  }
  await TrackPlayer.seekTo(0);
  return 0;
}

function completeCycle() {
  const sfz = loadStartedFromZero();
  if (currentTrackId && sfz) {
    increment(currentTrackId);
    const next = loadSessionCount() + 1;
    saveSessionCount(next);
    addLog('INFO', `completeCycle: ${currentTrackId} counted, session=${next}`);
  } else {
    addLog('INFO', `completeCycle: ${currentTrackId} skipped(sfz=${sfz})`);
  }
  saveStartedFromZero(true);
}

async function switchToTrack(idx: number) {
  addLog('INFO', `switchToTrack: idx=${getCurrentIndex()}→${idx}, track=${TRACKS[idx]?.id}`);
  await loadTrack(idx);
  await TrackPlayer.play();
}

async function seekAlignedForResume() {
  if (shouldSeekAlign('')) {
    const t = TRACKS.find(tr => tr.id === currentTrackId);
    if (t?.durationMs) {
      setAlignSeekExpectedUntil(Date.now() + 3000);
      await TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(t.durationMs)));
    }
  }
}

export default async function PlaybackService() {
  // ─── 远程控制 ───
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    addLog('INFO', 'RemotePlay');
    const didReset = resetCycleIfCompleted();
    if (shouldSeekAlign('')) {
      try { await seekAlignedForResume(); } catch {}
    } else if (didReset) {
      await TrackPlayer.seekTo(0);
    }
    await TrackPlayer.play();
  });
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => switchToTrack(getNextIndex()));
  TrackPlayer.addEventListener(Event.RemotePrevious, () => switchToTrack((getCurrentIndex() - 1 + TRACKS.length) % TRACKS.length));
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => TrackPlayer.seekTo(position));

  // ─── 来电恢复 ───
  let wasPausedBeforeDuck = false;
  TrackPlayer.addEventListener(Event.RemoteDuck, async ({ paused, permanent }) => {
    addLog('INFO', `RemoteDuck: paused=${paused} permanent=${permanent} wasPaused=${wasPausedBeforeDuck}`);
    if (permanent) { await TrackPlayer.stop(); return; }
    if (paused) {
      const s = await TrackPlayer.getPlaybackState();
      wasPausedBeforeDuck = s.state !== State.Playing;
      await TrackPlayer.pause();
      return;
    }
    if (wasPausedBeforeDuck) return;
    try { await seekAlignedForResume(); } catch {}
    await TrackPlayer.play();
  });

  // ─── 换歌 ───
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async ({ track }) => {
    if (!track) return;
    addLog('INFO', `ActiveTrackChanged: ${track.id}, sync=${shouldSeekAlign('')}`);
    currentTrackId = track.id;
    saveSessionCount(0);
    if (shouldSeekAlign('')) {
      const t = TRACKS.find(tr => tr.id === track.id);
      if (t?.durationMs) {
        setAlignSeekExpectedUntil(Date.now() + 3000);
        const pos = msToSeconds(calculateAlignedPosition(t.durationMs));
        await TrackPlayer.seekTo(pos);
        saveStartedFromZero(pos <= 1.5);
      } else {
        saveStartedFromZero(true);
      }
    } else {
      saveStartedFromZero(true);
    }
  });

  // ─── 队列结束 ───
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    const pm = loadPlayerState()?.playMode || 'repeat-one';
    const { repeatCount } = getSettings();
    addLog('INFO', `QueueEnded: track=${currentTrackId} mode=${pm} session=${loadSessionCount()} repeat=${repeatCount}`);
    completeCycle();

    const count = loadSessionCount();

    if (count < repeatCount) {
      await TrackPlayer.seekTo(0);
      saveStartedFromZero(true);
      await TrackPlayer.play();
      return;
    }

    switch (pm) {
      case 'repeat-one':
        saveSessionCount(0);
        await TrackPlayer.seekTo(0);
        saveStartedFromZero(true);
        await TrackPlayer.play();
        break;
      case 'play-one':
        saveStartedFromZero(false);
        break;
      case 'repeat-all':
        await switchToTrack(getNextIndex());
        break;
      case 'play-all':
        if (isLastTrack()) {
          saveStartedFromZero(false);
        } else {
          await switchToTrack(getNextIndex());
        }
        break;
    }
  });
}
