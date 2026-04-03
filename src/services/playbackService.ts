import TrackPlayer, { Event, State } from 'react-native-track-player';
import { TRACKS } from '../constants/tracks';
import { calculateAlignedPosition, msToSeconds } from '../utils/syncUtils';
import { useStatsStore } from '../store/statsStore';
import { consumeAlignSeekExpected, setAlignSeekExpectedUntil, shouldSeekAlign, loadPlayerState, saveSessionCount, getSettings } from '../utils/storage';

// ─── 状态 ───
let currentTrackId: string | null = null;
let sessionCount = 0;
let startedFromZero = false; // 本遍是否从头开始播放

// 手动切歌标志：PlayerScreen skip 时设为 true，ActiveTrackChanged 消费后重置
export let manualSkip = false;
export function setManualSkip(v: boolean) { manualSkip = v; }

const increment = (id: string) => useStatsStore.getState().increment(id);

// 同步模式下 seek 到对齐位置，否则 seekTo(0)
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
  startedFromZero = true; // 重播是系统主动发起的新一遍，无论对齐位置都算从头
}

function completeCycle() {
  if (currentTrackId && startedFromZero) {
    increment(currentTrackId);
    sessionCount++;
    saveSessionCount(sessionCount);
  }
  // 无论是否计数，下一遍默认从头开始（会被 seekForReplay 覆盖）
  startedFromZero = true;
}

async function onCycleComplete() {
  const ps = loadPlayerState();
  const pm = ps?.playMode || 'repeat-one';
  const { repeatCount } = getSettings();

  if (sessionCount < repeatCount) {
    if (pm === 'repeat-one' || pm === 'play-one') {
      await seekForReplay();
      await TrackPlayer.play();
    }
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

    // 列表模式下，非手动切歌 = 播完自动切歌 → 需要计数 + 遍数拦截
    if (lastTrack?.id && (pm === 'repeat-all' || pm === 'play-all') && !manualSkip) {
      const prevId = currentTrackId;
      currentTrackId = lastTrack.id;
      completeCycle();
      currentTrackId = prevId;

      const { repeatCount } = getSettings();
      if (sessionCount < repeatCount) {
        // 未达遍数：跳回上一首继续播
        const idx = await TrackPlayer.getActiveTrackIndex();
        if (idx != null && idx > 0) {
          setManualSkip(true);
          await TrackPlayer.skipToPrevious();
          if (shouldSeekAlign(pm)) {
            const t = TRACKS.find(tr => tr.id === lastTrack.id);
            if (t?.durationMs) {
              setAlignSeekExpectedUntil(Date.now() + 3000);
              const pos = msToSeconds(calculateAlignedPosition(t.durationMs));
              await TrackPlayer.seekTo(pos);
              startedFromZero = pos <= 1.5;
            }
          } else {
            await TrackPlayer.seekTo(0);
            startedFromZero = true;
          }
          await TrackPlayer.play();
          return;
        }
      }
    }

    // 重置状态
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
        startedFromZero = true; // 非同步模式，从 0 开始
      }
    }
  });

  // ─── 队列结束 ───
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    completeCycle();
    await onCycleComplete();
  });
}
