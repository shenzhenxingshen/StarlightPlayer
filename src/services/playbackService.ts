import TrackPlayer, { Event, State } from 'react-native-track-player';
import { TRACKS } from '../constants/tracks';
import { calculateAlignedPosition, msToSeconds } from '../utils/syncUtils';
import { useStatsStore } from '../store/statsStore';
import { consumeAlignSeekExpected, setAlignSeekExpectedUntil, shouldSeekAlign, loadPlayerState, saveSessionCount, getSettings } from '../utils/storage';

// ─── 参数 ───
const ZERO_EPS = 1.5;
const END_EPS = 1.5;
const ALIGN_EPS = 2.5;
const SYNC_PAUSE_MAX_SINGLE = 12;
const SYNC_PAUSE_MAX_TOTAL = 60;
const MAX_NORMAL_DELTA = 3; // progressInterval(1) + 容差

// ─── 状态机 ───
type CycleState = 'PRE_ZERO' | 'OFFICIAL_CYCLE' | 'SYNC_PAUSED' | 'ABORTED_WAIT_ZERO';

let state: CycleState = 'PRE_ZERO';
let currentTrackId: string | null = null;
let trackDuration = 0;
let lastPosition = -1;
let pauseStartAt = 0;
let totalPauseTime = 0;
let awaitResumeValidation = false;
let wasPlaying = false;
let sessionCount = 0; // 当前歌曲已完成遍数

const increment = (id: string) => useStatsStore.getState().increment(id);

function circularDiff(a: number, b: number, dur: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, dur - d);
}

function isNearZero(pos: number): boolean {
  return pos <= ZERO_EPS || (trackDuration > 0 && trackDuration - pos <= ZERO_EPS);
}

function isNearEnd(pos: number): boolean {
  return trackDuration > 0 && trackDuration - pos <= END_EPS;
}

function completeCycle() {
  if (state === 'OFFICIAL_CYCLE' && currentTrackId) {
    increment(currentTrackId);
    sessionCount++;
    saveSessionCount(sessionCount);
  }
}

async function onCycleComplete() {
  const ps = loadPlayerState();
  const pm = ps?.playMode || 'repeat-one';
  const { repeatCount } = getSettings();

  // 未达到设定遍数，继续循环（RNTP RepeatMode.Track 自动处理）
  if (sessionCount < repeatCount) return;

  // 达到设定遍数，根据模式决定下一步
  switch (pm) {
    case 'repeat-one':
      // 单曲循环：重置计数，继续循环
      sessionCount = 0;
      saveSessionCount(0);
      break;
    case 'play-one':
      // 单曲播放：暂停
      await TrackPlayer.pause();
      break;
    case 'repeat-all': {
      // 列表循环：切下一首
      sessionCount = 0;
      saveSessionCount(0);
      setAlignSeekExpectedUntil(Date.now() + 3000);
      await TrackPlayer.skipToNext().catch(() => {
        // 如果已是最后一首，skipToNext 会跳到第一首（Queue 行为）
        TrackPlayer.skip(0);
      });
      break;
    }
    case 'play-all': {
      // 列表播放：切下一首，最后一首暂停
      const idx = await TrackPlayer.getActiveTrackIndex();
      const queue = await TrackPlayer.getQueue();
      if (idx != null && idx >= queue.length - 1) {
        await TrackPlayer.pause();
      } else {
        sessionCount = 0;
        saveSessionCount(0);
        setAlignSeekExpectedUntil(Date.now() + 3000);
        await TrackPlayer.skipToNext().catch(() => {});
      }
      break;
    }
  }
}

function resetCycle(pos: number) {
  totalPauseTime = 0;
  awaitResumeValidation = false;
  lastPosition = pos;
  if (isNearZero(pos)) {
    state = 'OFFICIAL_CYCLE';
  } else {
    state = 'PRE_ZERO';
  }
}

function abortCycle() {
  state = 'ABORTED_WAIT_ZERO';
  totalPauseTime = 0;
  awaitResumeValidation = false;
}

export default async function PlaybackService() {
  // ─── 远程控制 ───
  // 远程播放时根据同步设置决定是否对齐
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
    // 恢复播放：根据同步设置决定是否对齐
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

  // ─── 播放状态变化 ───
  TrackPlayer.addEventListener(Event.PlaybackState, ({ state: playState }) => {
    if (playState === State.Paused && wasPlaying) {
      if (state === 'OFFICIAL_CYCLE') {
        state = 'SYNC_PAUSED';
        pauseStartAt = Date.now();
      } else if (state === 'SYNC_PAUSED') {
        // 已在暂停中再次暂停（不翻状态，只更新时间戳）
        pauseStartAt = Date.now();
      }
    }

    if (playState === State.Playing && !wasPlaying) {
      if (state === 'SYNC_PAUSED') {
        const pauseDur = (Date.now() - pauseStartAt) / 1000;
        totalPauseTime += pauseDur;
        if (pauseDur > SYNC_PAUSE_MAX_SINGLE || totalPauseTime > SYNC_PAUSE_MAX_TOTAL) {
          abortCycle();
        } else {
          awaitResumeValidation = true;
          // 暂时回到 OFFICIAL，等 progress 校验
          state = 'OFFICIAL_CYCLE';
        }
      }
      // 从非播放恢复，标记哨兵避免首个 delta 误判
      lastPosition = -1;
    }

    if (playState === State.Stopped) {
      completeCycle();
      state = 'PRE_ZERO';
      currentTrackId = null;
      trackDuration = 0;
      lastPosition = -1;
      totalPauseTime = 0;
      awaitResumeValidation = false;
    }

    wasPlaying = playState === State.Playing;
  });

  // ─── 换歌 ───
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async ({ track, lastTrack }) => {
    // 结算上一首
    if (lastTrack?.id && isNearEnd(lastPosition)) {
      completeCycle();
    }

    // 重置
    currentTrackId = track?.id || null;
    trackDuration = 0;
    totalPauseTime = 0;
    awaitResumeValidation = false;
    lastPosition = -1;
    sessionCount = 0;
    saveSessionCount(0);

    if (track) {
      const t = TRACKS.find(tr => tr.id === track.id);
      if (t?.durationMs) {
        trackDuration = t.durationMs / 1000;
        const ps = loadPlayerState();
        const pm = ps?.playMode || 'repeat-one';
        if (shouldSeekAlign(pm)) {
          const alignedSec = msToSeconds(calculateAlignedPosition(t.durationMs));
          state = alignedSec <= ZERO_EPS ? 'OFFICIAL_CYCLE' : 'PRE_ZERO';
          lastPosition = alignedSec;
          await TrackPlayer.seekTo(alignedSec);
        } else {
          state = 'OFFICIAL_CYCLE'; // 从 0 开始，直接进入官方周期
          lastPosition = 0;
        }
      } else {
        state = 'PRE_ZERO';
      }
    }
  });

  // ─── 队列结束 ───
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
    if (isNearEnd(lastPosition)) {
      completeCycle();
    }
    state = 'PRE_ZERO';
    totalPauseTime = 0;
    awaitResumeValidation = false;
  });

  // ─── 进度更新（核心） ───
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, async ({ position, duration }) => {
    if (!currentTrackId || !duration) return;
    trackDuration = duration;

    // 哨兵：刚恢复播放，只记录位置
    if (lastPosition < 0) {
      lastPosition = position;
      return;
    }

    const delta = position - lastPosition;

    // ── 恢复后首个 progress：同步暂停校验 ──
    if (awaitResumeValidation) {
      awaitResumeValidation = false;
      if (state === 'OFFICIAL_CYCLE') {
        const t = TRACKS.find(tr => tr.id === currentTrackId);
        if (t?.durationMs) {
          const alignedNow = msToSeconds(calculateAlignedPosition(t.durationMs));
          const diff = circularDiff(position, alignedNow, duration);
          if (diff > ALIGN_EPS) {
            abortCycle();
            lastPosition = position;
            return;
          }
        }
      }
      lastPosition = position;
      return;
    }

    // ── 回绕检测（尾→头） ──
    if (delta < -duration * 0.5) {
      const reachedEnd = isNearEnd(lastPosition);

      if (state === 'OFFICIAL_CYCLE' && reachedEnd) {
        completeCycle();
        await onCycleComplete();
      }

      // 回绕后根据同步设置决定是否对齐
      const ps = loadPlayerState();
      const pm = ps?.playMode || 'repeat-one';
      if (shouldSeekAlign(pm) && currentTrackId) {
        const t = TRACKS.find(tr => tr.id === currentTrackId);
        if (t?.durationMs) {
          setAlignSeekExpectedUntil(Date.now() + 3000);
          TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(t.durationMs)));
        }
      }

      resetCycle(position);
      return;
    }

    // ── 跳变检测 ──
    if (Math.abs(delta) > MAX_NORMAL_DELTA) {
      // 检查 align token 白名单
      if (consumeAlignSeekExpected(Date.now())) {
        lastPosition = position;
        return;
      }
      // 非法跳变
      if (state === 'OFFICIAL_CYCLE' || state === 'SYNC_PAUSED') {
        abortCycle();
      }
      lastPosition = position;
      return;
    }

    // ── PRE_ZERO / ABORTED：检测是否回到 0 ──
    if ((state === 'PRE_ZERO' || state === 'ABORTED_WAIT_ZERO') && isNearZero(position)) {
      resetCycle(position);
    }

    lastPosition = position;
  });
}
