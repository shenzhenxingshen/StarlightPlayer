import TrackPlayer, { Event, State } from 'react-native-track-player';
import { TRACKS } from '../constants/tracks';
import { calculateAlignedPosition, msToSeconds } from '../utils/syncUtils';
import { useStatsStore } from '../store/statsStore';
import { setAlignSeekExpectedUntil, shouldSeekAlign, loadPlayerState, saveSessionCount, getSettings } from '../utils/storage';
import { loadTrack, getCurrentIndex, getNextIndex, isLastTrack } from '../utils/trackManager';

// ─── 状态 ───
let currentTrackId: string | null = null;
let sessionCount = 0;
let startedFromZero = false;

export function isStartedFromZero() { return startedFromZero; }

// 手动播放前调用：如果上一轮已结束，重置遍数开启新一轮
export function resetCycleIfCompleted() {
  const { repeatCount } = getSettings();
  if (sessionCount >= repeatCount) {
    sessionCount = 0;
    saveSessionCount(0);
    const ps = loadPlayerState();
    const pm = ps?.playMode || 'repeat-one';
    startedFromZero = !shouldSeekAlign(pm);
  }
}

const increment = (id: string) => useStatsStore.getState().increment(id);

async function seekAligned() {
  const ps = loadPlayerState();
  const pm = ps?.playMode || 'repeat-one';
  if (shouldSeekAlign(pm) && currentTrackId) {
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
  if (currentTrackId && startedFromZero) {
    increment(currentTrackId);
    sessionCount++;
    saveSessionCount(sessionCount);
  }
  startedFromZero = true;
}

// 切到指定索引的歌并播放
async function switchToTrack(idx: number) {
  await loadTrack(idx);
  // ActiveTrackChanged 会设置 currentTrackId, sessionCount, startedFromZero, seek
  await TrackPlayer.play();
}

export default async function PlaybackService() {
  // ─── 远程控制 ───
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    resetCycleIfCompleted();
    try {
      const ps = loadPlayerState();
      const pm = ps?.playMode || 'repeat-one';
      if (shouldSeekAlign(pm)) {
        const t = TRACKS.find(tr => tr.id === currentTrackId);
        if (t?.durationMs) {
          setAlignSeekExpectedUntil(Date.now() + 3000);
          await TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(t.durationMs)));
        }
      }
    } catch {}
    await TrackPlayer.play();
  });
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => switchToTrack(getNextIndex()));
  TrackPlayer.addEventListener(Event.RemotePrevious, () => switchToTrack((getCurrentIndex() - 1 + TRACKS.length) % TRACKS.length));
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
        const t = TRACKS.find(tr => tr.id === currentTrackId);
        if (t?.durationMs) {
          setAlignSeekExpectedUntil(Date.now() + 3000);
          await TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(t.durationMs)));
        }
      }
    } catch {}
    await TrackPlayer.play();
  });

  // ─── 换歌（初始化状态）───
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async ({ track }) => {
    if (track) {
      currentTrackId = track.id;
      sessionCount = 0;
      saveSessionCount(0);
      // 根据同步模式决定起始位置和 startedFromZero
      const ps = loadPlayerState();
      const pm = ps?.playMode || 'repeat-one';
      if (shouldSeekAlign(pm)) {
        const t = TRACKS.find(tr => tr.id === track.id);
        if (t?.durationMs) {
          setAlignSeekExpectedUntil(Date.now() + 3000);
          const pos = msToSeconds(calculateAlignedPosition(t.durationMs));
          await TrackPlayer.seekTo(pos);
          startedFromZero = pos <= 1.5;
        } else {
          startedFromZero = true;
        }
      } else {
        startedFromZero = true; // 非同步，从 0 开始
      }
    }
  });

  // ─── 队列结束（核心：每首歌播完都会触发）───
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    completeCycle();

    const ps = loadPlayerState();
    const pm = ps?.playMode || 'repeat-one';
    const { repeatCount } = getSettings();

    // 未达遍数：重播当前歌
    if (sessionCount < repeatCount) {
      const pos = await seekAligned();
      startedFromZero = true; // 重播算从头
      await TrackPlayer.play();
      return;
    }

    // 达到遍数
    switch (pm) {
      case 'repeat-one':
        // 单曲循环：重置计数继续
        sessionCount = 0;
        saveSessionCount(0);
        const pos2 = await seekAligned();
        startedFromZero = pos2 <= 1.5;
        await TrackPlayer.play();
        break;
      case 'play-one':
        // 单曲播放：停止，保留 sessionCount 让 UI 显示 N/N
        startedFromZero = false; // UI 显示已完成遍数而非"正在播第 N+1 遍"
        break;
      case 'repeat-all':
        // 列表循环：切下一首（最后一首后回到第一首）
        await switchToTrack(getNextIndex());
        break;
      case 'play-all':
        // 列表播放：切下一首，最后一首停止
        if (isLastTrack()) {
          // 停止，保留 sessionCount
          startedFromZero = false;
        } else {
          await switchToTrack(getNextIndex());
        }
        break;
    }
  });
}
