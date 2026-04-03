import TrackPlayer, { Event, State } from 'react-native-track-player';
import { TRACKS } from '../constants/tracks';
import { calculateAlignedPosition, msToSeconds } from '../utils/syncUtils';
import { useStatsStore } from '../store/statsStore';
import { consumeAlignSeekExpected, setAlignSeekExpectedUntil, shouldSeekAlign, loadPlayerState, saveSessionCount, getSettings } from '../utils/storage';

// ─── 状态 ───
let currentTrackId: string | null = null;
let sessionCount = 0; // 当前歌曲已完成遍数

// 手动切歌标志：PlayerScreen skip 时设为 true，ActiveTrackChanged 消费后重置
export let manualSkip = false;
export function setManualSkip(v: boolean) { manualSkip = v; }

const increment = (id: string) => useStatsStore.getState().increment(id);

function completeCycle() {
  if (currentTrackId) {
    increment(currentTrackId);
    sessionCount++;
    saveSessionCount(sessionCount);
  }
}

async function onCycleComplete() {
  const ps = loadPlayerState();
  const pm = ps?.playMode || 'repeat-one';
  const { repeatCount } = getSettings();

  if (sessionCount < repeatCount) {
    // 未达遍数：单曲场景需手动循环（RepeatMode.Off 不会自动重播）
    if (pm === 'repeat-one' || pm === 'play-one') {
      await TrackPlayer.seekTo(0);
      await TrackPlayer.play();
    }
    return;
  }

  // 达到设定遍数
  sessionCount = 0;
  saveSessionCount(0);

  switch (pm) {
    case 'repeat-one':
      // 单曲循环：重置计数，继续
      await TrackPlayer.seekTo(0);
      await TrackPlayer.play();
      break;
    case 'play-one':
      // 单曲播放：暂停
      break;
    case 'repeat-all': {
      setManualSkip(true); // 标记为主动切歌，避免 ActiveTrackChanged 再次拦截
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
      // 对上一首计数
      const prevId = currentTrackId;
      currentTrackId = lastTrack.id; // 临时指向上一首以便 completeCycle 计数
      completeCycle();
      currentTrackId = prevId;

      const { repeatCount } = getSettings();
      if (sessionCount < repeatCount) {
        // 未达遍数：跳回上一首继续播
        const idx = await TrackPlayer.getActiveTrackIndex();
        if (idx != null && idx > 0) {
          setManualSkip(true); // 回跳不要再触发拦截
          await TrackPlayer.skipToPrevious();
          if (shouldSeekAlign(pm)) {
            const t = TRACKS.find(tr => tr.id === lastTrack.id);
            if (t?.durationMs) {
              setAlignSeekExpectedUntil(Date.now() + 3000);
              await TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(t.durationMs)));
            }
          } else {
            await TrackPlayer.seekTo(0);
          }
          await TrackPlayer.play();
          return; // 不重置 sessionCount，继续累计
        }
      }
      // 达到遍数，正常切歌，走下面的重置逻辑
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
        await TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(t.durationMs)));
      }
    }
  });

  // ─── 队列结束 ───
  // RepeatMode.Off 下：单曲播完 或 列表最后一首播完
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    completeCycle();
    await onCycleComplete();
  });
}
