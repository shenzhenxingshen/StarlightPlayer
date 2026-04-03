import TrackPlayer, { Event, State } from 'react-native-track-player';
import { TRACKS } from '../constants/tracks';
import { calculateAlignedPosition, msToSeconds } from '../utils/syncUtils';
import { useStatsStore } from '../store/statsStore';
import { consumeAlignSeekExpected, setAlignSeekExpectedUntil, shouldSeekAlign, loadPlayerState, saveSessionCount, getSettings } from '../utils/storage';

// ─── 状态 ───
let currentTrackId: string | null = null;
let sessionCount = 0; // 当前歌曲已完成遍数

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
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext().catch(() => {}));
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious().catch(() => {}));
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

  // ─── 换歌（列表场景的遍数计数触发点） ───
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async ({ track, lastTrack }) => {
    // 列表模式下，上一首播完自动切歌会触发此事件 → 计数
    const ps = loadPlayerState();
    const pm = ps?.playMode || 'repeat-one';
    if (lastTrack?.id && (pm === 'repeat-all' || pm === 'play-all')) {
      // 只有从 onCycleComplete 主动 skip 才会到这里，已在那里重置了 sessionCount
      // 这里不需要额外 completeCycle
    }

    // 重置状态
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

  // ─── 队列结束（单曲场景的遍数计数触发点） ───
  // RepeatMode.Off 下，单曲播完会触发 PlaybackQueueEnded
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    const ps = loadPlayerState();
    const pm = ps?.playMode || 'repeat-one';

    if (pm === 'repeat-one' || pm === 'play-one') {
      completeCycle();
      await onCycleComplete();
    } else {
      // 列表模式：最后一首播完
      completeCycle();
      await onCycleComplete();
    }
  });
}
