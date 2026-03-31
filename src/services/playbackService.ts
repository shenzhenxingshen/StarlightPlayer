import TrackPlayer, { Event, State } from 'react-native-track-player';
import { TRACKS } from '../constants/tracks';
import { calculateAlignedPosition, msToSeconds } from '../utils/syncUtils';
import { useStatsStore } from '../store/statsStore';

/**
 * 播放遍数统计规则：
 * 
 * 统计时机（满足"连续播放时长 ≥ 曲目时长 × 80%"时 +1）：
 *   1. PlaybackState → Stopped
 *   2. PlaybackTrackChanged（检查上一首）
 *   3. PlaybackQueueEnded（检查最后一首）
 *   4. 单曲循环：position 从接近结尾回到开头（循环一遍）
 * 
 * 不计入统计的时段：
 *   - Paused → Playing 之间的时长
 *   - seekTo 产生的跳变
 */

const COMPLETION_RATIO = 0.80;
const PROGRESS_INTERVAL = 5;
const MAX_NORMAL_DELTA = PROGRESS_INTERVAL + 2;

let currentTrackId: string | null = null;
let accumulatedTime = 0;
let trackDuration = 0;
let lastPosition = 0;
let wasPlaying = false;

const incrementCount = (id: string) => useStatsStore.getState().increment(id);

function checkAndCount(trackId: string | null) {
  if (!trackId || trackDuration <= 0) return;
  if (accumulatedTime >= trackDuration * COMPLETION_RATIO) {
    incrementCount(trackId);
  }
}

function resetStats() {
  accumulatedTime = 0;
  lastPosition = 0;
}

export default async function PlaybackService() {
  // 远程控制
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext().catch(() => {}));
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious().catch(() => {}));
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => TrackPlayer.seekTo(position));

  // 规则1: Stopped 时检查
  TrackPlayer.addEventListener(Event.PlaybackState, ({ state }) => {
    if (state === State.Stopped) {
      checkAndCount(currentTrackId);
      resetStats();
    }
    // 记录播放状态，用于 Paused→Playing 时重置 lastPosition
    if (state === State.Playing && !wasPlaying) {
      // 从非播放状态恢复，标记 lastPosition 需要跳过下一个 delta
      lastPosition = -1; // 哨兵值，下次 ProgressUpdated 时只记录不累加
    }
    wasPlaying = state === State.Playing;
  });

  // 规则2: 换歌时检查上一首
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async ({ track, lastTrack }) => {
    // 检查上一首
    if (lastTrack?.id) {
      const lastId = lastTrack.id;
      checkAndCount(lastId);
    }

    // 重置，准备新曲目
    resetStats();
    currentTrackId = track?.id || null;
    trackDuration = 0;

    // 时间对齐
    if (track) {
      const t = TRACKS.find(tr => tr.id === track.id);
      if (t?.durationMs) {
        trackDuration = t.durationMs / 1000;
        await TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(t.durationMs)));
      }
    }
  });

  // 规则3: 队列结束时检查最后一首
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
    checkAndCount(currentTrackId);
    resetStats();
  });

  // 进度更新：累计播放时长 + 规则4（单曲循环检测）
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, ({ position, duration }) => {
    if (!currentTrackId || !duration) return;
    trackDuration = duration;

    // 哨兵值：刚从暂停恢复，只记录位置不累加
    if (lastPosition < 0) {
      lastPosition = position;
      return;
    }

    const delta = position - lastPosition;

    // 规则4: 单曲循环检测 — position 大幅回退说明循环了一遍
    // 例如：lastPosition=58, position=3, delta=-55（曲目60秒）
    if (delta < -duration * 0.5) {
      // 循环了一遍，加上尾部剩余时间
      const tailTime = duration - lastPosition;
      if (tailTime > 0 && tailTime <= MAX_NORMAL_DELTA) {
        accumulatedTime += tailTime;
      }
      // 检查是否达标
      checkAndCount(currentTrackId);
      // 重置累计，开始新一遍
      accumulatedTime = 0;
      lastPosition = position;
      return;
    }

    // 正常播放增量
    if (delta > 0 && delta <= MAX_NORMAL_DELTA) {
      accumulatedTime += delta;
    }
    // seek 跳变（delta 过大或小幅回退）：不累加

    lastPosition = position;
  });
}
