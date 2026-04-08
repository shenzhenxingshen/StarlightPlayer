import TrackPlayer, { Event } from 'react-native-track-player';
import { TRACKS } from '../constants/tracks';
import { calculateAlignedPosition, msToSeconds } from '../utils/syncUtils';
import { useStatsStore } from '../store/statsStore';
import {
  setAlignSeekExpectedUntil, shouldSeekAlign, loadPlayerState,
  saveSessionCount, loadSessionCount, saveStartedFromZero, loadStartedFromZero, getSettings,
} from '../utils/storage';
import { loadTrack, getCurrentIndex, getNextIndex, isLastTrack } from '../utils/trackManager';

// currentTrackId 仅 Service 端使用，不需要跨运行时
let currentTrackId: string | null = null;

// UI 端读取用 loadStartedFromZero()
export function isStartedFromZero() { return loadStartedFromZero(); }

// 手动播放前调用：如果上一轮已结束，重置遍数开启新一轮。返回是否重置。
export function resetCycleIfCompleted(): boolean {
  const { repeatCount } = getSettings();
  if (loadSessionCount() >= repeatCount) {
    saveSessionCount(0);
    saveStartedFromZero(!shouldSeekAlign(''));
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
      return pos;
    }
  }
  await TrackPlayer.seekTo(0);
  return 0;
}

function completeCycle() {
  if (currentTrackId && loadStartedFromZero()) {
    increment(currentTrackId);
    const next = loadSessionCount() + 1;
    saveSessionCount(next);
  }
  saveStartedFromZero(true);
}

async function switchToTrack(idx: number) {
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
  TrackPlayer.addEventListener(Event.RemoteDuck, async ({ paused, permanent }) => {
    if (permanent) { await TrackPlayer.stop(); return; }
    if (paused) { await TrackPlayer.pause(); return; }
    try { await seekAlignedForResume(); } catch {}
    await TrackPlayer.play();
  });

  // ─── 换歌 ───
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async ({ track }) => {
    if (!track) return;
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
    completeCycle();

    const pm = loadPlayerState()?.playMode || 'repeat-one';
    const { repeatCount } = getSettings();
    const count = loadSessionCount();

    if (count < repeatCount) {
      const pos = await seekAligned();
      saveStartedFromZero(true);
      await TrackPlayer.play();
      return;
    }

    switch (pm) {
      case 'repeat-one':
        saveSessionCount(0);
        const pos = await seekAligned();
        saveStartedFromZero(pos <= 1.5);
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
