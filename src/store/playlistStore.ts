import { create } from 'zustand';
import { Track } from '../types';
import TrackPlayerService from '../services/trackPlayerService';
import { getLocalAudioUrl } from '../utils/getLocalAudioUrl';
import { msToSeconds } from '../utils/syncUtils';

interface PlaylistStore {
  tracks: Track[];
  currentIndex: number;
  addPlaylist: (tracks: Track[]) => Promise<void>;
  selectTrack: (index: number) => Promise<void>;
  getCurrentTrack: () => Track | null;
}

export const usePlaylistStore = create<PlaylistStore>((set, get) => ({
  tracks: [],
  currentIndex: 0,

  addPlaylist: async (tracks) => {
    // 转换为 RNTP 格式
    const trackList = tracks.map(track => ({
      id: track.id,
      url: getLocalAudioUrl(track.audioUrl),
      title: track.title,
      artist: track.subtitle || '共修音乐',
      artwork: track.imageUrl,
      duration: msToSeconds(track.durationMs || 0),
    }));

    await TrackPlayerService.reset();
    await TrackPlayerService.add(trackList);
    
    set({ tracks, currentIndex: 0 });
  },

  selectTrack: async (index) => {
    const { tracks } = get();
    if (index < 0 || index >= tracks.length) return;

    const track = tracks[index];
    await TrackPlayerService.skip(index);
    
    set({ currentIndex: index });
  },

  getCurrentTrack: () => {
    const { tracks, currentIndex } = get();
    return tracks[currentIndex] || null;
  },
}));