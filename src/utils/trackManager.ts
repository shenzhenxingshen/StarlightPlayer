import TrackPlayer from 'react-native-track-player';
import { TRACKS } from '../constants/tracks';
import { msToSeconds } from './syncUtils';
import { getLocalAudioUrl } from './getLocalAudioUrl';

// 逻辑列表索引（在 TRACKS 数组中的位置）
let currentIndex = 0;

export function getCurrentIndex(): number {
  return currentIndex;
}

export function setCurrentIndex(idx: number) {
  currentIndex = Math.max(0, Math.min(idx, TRACKS.length - 1));
}

export function getNextIndex(): number {
  return (currentIndex + 1) % TRACKS.length;
}

export function getPrevIndex(): number {
  return (currentIndex - 1 + TRACKS.length) % TRACKS.length;
}

export function isLastTrack(): boolean {
  return currentIndex >= TRACKS.length - 1;
}

// 替换队列为单首歌
export async function loadTrack(idx: number) {
  setCurrentIndex(idx);
  const t = TRACKS[currentIndex];
  await TrackPlayer.reset();
  await TrackPlayer.add({
    id: t.id,
    url: getLocalAudioUrl(t.audioUrl),
    title: t.title,
    artist: t.subtitle || '',
    artwork: require('../assets/images/vinyl-cover.png'),
    duration: msToSeconds(t.durationMs || 0),
  });
}
