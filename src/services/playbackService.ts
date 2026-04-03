import TrackPlayer, { Event, State } from 'react-native-track-player';
import { TRACKS } from '../constants/tracks';
import { calculateAlignedPosition, msToSeconds } from '../utils/syncUtils';
import { useStatsStore } from '../store/statsStore';
import { consumeAlignSeekExpected, setAlignSeekExpectedUntil, shouldSeekAlign, loadPlayerState, saveSessionCount, getSettings } from '../utils/storage';

// ─── 状态 ───
let currentTrackId: string | null = null;
let sessionCount = 0;
let startedFromZero = false;

// 手动切歌标志
export let manualSkip = false;
export function setManualSkip(v: boolean) { manualSkip = v; }
export function isStartedFromZero() { return startedFromZero; }

// 回跳重播标志：列表模式未达遍数时回跳，保留 sessionCount 不重置
let replayingTrackId: string | null = null;

const increment = (id: string) => useStatsStore.getState().increment(id);

async function seekForReplay() {
  const ps = loadPlayerState();
  const pm = ps?.playMode || 'repeat-one';
  if (shouldSeekAlign(pm) && currentTrackId) {
    const t = TRACKS.find(tr => tr.id === currentTrackId);
    if (t?.durationMs) {
      setAlignSeekExpectedUntil(Date.now() + 3000);
      await TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(t.durationMs)));
    }
  } else {
    await TrackPlayer.seekTo(0);
  }
  startedFromZero = true;
}

function completeCycle() {
  if (currentTrackId && startedFromZero) {
    increment(currentTrackId);
    sessionCount++;
    saveSessionCount(sessionCount);
  }
  startedFromZero = true;
}

async function onCycleComplete() {
  const ps = loadPlayerState();
  const pm = ps?.playMode || 'repeat-one';
  const { repeatCount } = getSettings();

  if (sessionCount < repeatCount) {
    // 未达遍数
    if (pm === 'repeat-one' || pm === 'play-one') {
      await seekForReplay();
      await TrackPlayer.play();
    }
    // repeat-all / play-all：由 ActiveTrackChanged 拦截处理，这里不需要做
    return;
  }

  // 达到设定遍数
  sessionCount = 0;
  saveSessionCount(0);

  switch (pm) {
    case 'repeat-one':
      await seekForReplay();
      await TrackPlayer.play();
      break;
    case 'play-one':
      break;
    case 'repeat-all': {
      setManualSkip(true);
      setAlignSeekExpectedUntil(Date.now() + 3000);
      await TrackPlayer.skipToNext().catch(() => { TrackPlayer.skip(0); });
      break;
    }
    case 'play-all': {
      const idx = await TrackPlayer.getActiveTrackIndex();
      const queue = await TrackPlayer.getQueue();
      if (idx != null && idx >= queue.length - 1) {
        await TrackPlayer.pause();
      } else {
        setManualSkip(true);
        setAlignSeekExpectedUntil(Date.now() + 3000);
        await TrackPlayer.skipToNext().catch(() => {});
      }
      break;
    }
  }
}

export default async function PlaybackService() {
  // ─── 远程控制 ───
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    try {
      const ps = loadPlayerState();
      const pm = ps?.playMode || 'repeat-one';
      if (shouldSeekAlign(pm)) {
        const idx = await TrackPlayer.getActiveTrackIndex();
        const queue = await TrackPlayer.getQueue();
        if (idx != null && queue[idx]) {
          const t = TRACKS.find(tr => tr.id === queue[idx].id);
          if (t?.durationMs) {
            setAlignSeekExpectedUntil(Date.now() + 3000);
            await TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(t.durationMs)));
          }
        }
      }
    } catch {}
    await TrackPlayer.play();
  });
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => { setManualSkip(true); TrackPlayer.skipToNext().catch(() => {}); });
  TrackPlayer.addEventListener(Event.RemotePrevious, () => { setManualSkip(true); TrackPlayer.skipToPrevious().catch(() => {}); });
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => TrackPlayer.seekTo(position));

  // ─── 来电恢复（RemoteDuck）───
  TrackPlayer.addEventListener(Event.RemoteDuck, async ({ paused, permanent }) => {
    if (permanent) { await TrackPlayer.stop(); return; }
    if (paused) { await TrackPlayer.pause(); return; }
    try {
      const ps = loadPlayerState();
      const pm = ps?.playMode || 'repeat-one';
      if (shouldSeekAlign(pm)) {
        const idx = await TrackPlayer.getActiveTrackIndex();
        const queue = await TrackPlayer.getQueue();
        if (idx != null && queue[idx]) {
          const t = TRACKS.find(tr => tr.id === queue[idx].id);
          if (t?.durationMs) {
            setAlignSeekExpectedUntil(Date.now() + 3000);
            await TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(t.durationMs)));
          }
        }
      }
    } catch {}
    await TrackPlayer.play();
  });

  // ─── 换歌 ───
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async ({ track, lastTrack }) => {
    const ps = loadPlayerState();
    const pm = ps?.playMode || 'repeat-one';

    // 回跳重播：skipToPrevious 回到同一首，保留 sessionCount
    if (replayingTrackId && track?.id === replayingTrackId) {
      const savedCount = sessionCount;
      replayingTrackId = null;
      manualSkip = false;
      currentTrackId = track.id;
      sessionCount = savedCount; // 恢复，不重置
      saveSessionCount(sessionCount);

      if (shouldSeekAlign(pm)) {
        const t = TRACKS.find(tr => tr.id === track.id);
        if (t?.durationMs) {
          setAlignSeekExpectedUntil(Date.now() + 3000);
          await TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(t.durationMs)));
        }
      } else {
        await TrackPlayer.seekTo(0);
      }
      startedFromZero = true;
      await TrackPlayer.play();
      return;
    }

    // 列表模式下，非手动切歌 = 播完自动切歌 → 计数 + 遍数拦截
    if (lastTrack?.id && (pm === 'repeat-all' || pm === 'play-all') && !manualSkip) {
      // 对上一首计数
      const prevId = currentTrackId;
      currentTrackId = lastTrack.id;
      completeCycle();
      currentTrackId = prevId;

      const { repeatCount } = getSettings();
      if (sessionCount < repeatCount) {
        // 未达遍数：回跳到上一首
        replayingTrackId = lastTrack.id;
        setManualSkip(true);
        await TrackPlayer.skipToPrevious();
        return; // 回跳后的 ActiveTrackChanged 会走上面的 replayingTrackId 分支
      }
      // 达到遍数，正常切歌
      sessionCount = 0;
      saveSessionCount(0);
    }

    // 重置状态
    replayingTrackId = null;
    manualSkip = false;
    currentTrackId = track?.id || null;
    sessionCount = 0;
    saveSessionCount(0);

    if (track) {
      const t = TRACKS.find(tr => tr.id === track.id);
      if (t?.durationMs && shouldSeekAlign(pm)) {
        setAlignSeekExpectedUntil(Date.now() + 3000);
        const pos = msToSeconds(calculateAlignedPosition(t.durationMs));
        await TrackPlayer.seekTo(pos);
        startedFromZero = pos <= 1.5;
      } else {
        startedFromZero = true;
      }
    }
  });

  // ─── 队列结束 ───
  // 单曲播完 或 列表最后一首播完
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    completeCycle();

    const ps = loadPlayerState();
    const pm = ps?.playMode || 'repeat-one';
    const { repeatCount } = getSettings();

    // 列表最后一首未达遍数：seekTo(0) 重播当前歌
    if ((pm === 'repeat-all' || pm === 'play-all') && sessionCount < repeatCount) {
      await seekForReplay();
      await TrackPlayer.play();
      return;
    }

    await onCycleComplete();
  });
}
