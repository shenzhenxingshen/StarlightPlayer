import TrackPlayer, { Event } from 'react-native-track-player';
import { TRACKS } from '../constants/tracks';
import { calculateAlignedPosition, msToSeconds } from '../utils/syncUtils';
import { incrementPlaybackCount } from '../utils/storage';

export default async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => TrackPlayer.seekTo(position));

  // 自动切歌时也执行时间对齐
  TrackPlayer.addEventListener(Event.PlaybackTrackChanged, async ({ nextTrack }) => {
    if (nextTrack === null || nextTrack === undefined) return;
    const queue = await TrackPlayer.getQueue();
    const track = TRACKS.find(t => t.id === queue[nextTrack]?.id);
    if (track?.durationMs) {
      await TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(track.durationMs)));
      incrementPlaybackCount(track.id);
    }
  });
}
