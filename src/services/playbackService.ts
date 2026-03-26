import TrackPlayer, { Event } from 'react-native-track-player';
import { TRACKS } from '../constants/tracks';
import { calculateAlignedPosition, msToSeconds } from '../utils/syncUtils';
import { incrementPlaybackCount } from '../utils/storage';

let lastTrackId: string | null = null;
let lastTrackStarted = false;

export default async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => TrackPlayer.seekTo(position));

  // 记录当前播放的 track
  TrackPlayer.addEventListener(Event.PlaybackState, async (e) => {
    if (e.state === 'playing') {
      const idx = await TrackPlayer.getActiveTrackIndex();
      const queue = await TrackPlayer.getQueue();
      if (idx !== null && idx !== undefined && queue[idx]) {
        lastTrackId = queue[idx].id;
        lastTrackStarted = true;
      }
    }
  });

  // 切歌时：统计上一首 + 时间对齐新曲目
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async ({ track, lastTrack }) => {
    // 上一首播放完毕（自动切歌触发），统计 +1
    if (lastTrackStarted && lastTrack?.id) {
      incrementPlaybackCount(lastTrack.id);
      lastTrackStarted = false;
    }

    // 新曲目时间对齐
    if (track) {
      const t = TRACKS.find(tr => tr.id === track.id);
      if (t?.durationMs) {
        await TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(t.durationMs)));
      }
    }
  });

  // 队列播完（最后一首结束）
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    if (lastTrackStarted && lastTrackId) {
      incrementPlaybackCount(lastTrackId);
      lastTrackStarted = false;
    }
  });
}
