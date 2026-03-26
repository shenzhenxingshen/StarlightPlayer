import { create } from 'zustand';
import { PlayerState, Track } from '../types';
import TrackPlayerService from '../services/trackPlayerService';
import { State as TrackState } from 'react-native-track-player';
import { calculateAlignedPosition, msToSeconds } from '../utils/syncUtils';
import { incrementPlaybackCount } from '../utils/storage';

interface PlayerStore extends PlayerState {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  skipToNext: () => Promise<void>;
  skipToPrevious: () => Promise<void>;
  setCurrentTrack: (track: Track) => Promise<void>;
  initialize: () => Promise<void>;
  updateState: (state: PlayerState) => void;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  state: 'idle',
  currentTrack: null,
  position: 0,
  duration: 0,

  initialize: async () => {
    await TrackPlayerService.setup();
    
    TrackPlayerService.setupEventHandlers({
      onPlaybackStateChange: (trackState) => {
        set({ state: trackState === 'playing' ? 'playing' : trackState === 'paused' ? 'paused' : 'idle' });
      },
      onPlaybackProgressUpdate: (position) => {
        set({ position });
      },
      onTrackChange: async () => {
        const position = await TrackPlayerService.getPosition();
        const duration = await TrackPlayerService.getDuration();
        const track = await TrackPlayerService.getCurrentTrack();
        set({ 
          currentTrack: track || null,
          position,
          duration 
        });
      },
    });
  },

  setCurrentTrack: async (track) => {
    set({ currentTrack: track, duration: msToSeconds(track.durationMs || 0) });
  },

  play: async () => {
    const { currentTrack } = get();
    if (!currentTrack || !currentTrack.durationMs) {
      await TrackPlayerService.play();
      set({ state: 'playing' });
      return;
    }

    // 计算对齐位置（核心同步逻辑）
    const alignedPositionMs = calculateAlignedPosition(currentTrack.durationMs);
    const alignedPositionSec = msToSeconds(alignedPositionMs);

    // 跳转到对齐位置
    await TrackPlayerService.seekTo(alignedPositionSec);
    
    // 开始播放
    await TrackPlayerService.play();
    
    // 记录播放统计
    incrementPlaybackCount(currentTrack.id);
    
    set({ 
      state: 'playing',
      position: alignedPositionSec 
    });
  },

  pause: async () => {
    await TrackPlayerService.pause();
    set({ state: 'paused' });
  },

  stop: async () => {
    await TrackPlayerService.stop();
    set({ state: 'stopped', position: 0 });
  },

  seekTo: async (position) => {
    await TrackPlayerService.seekTo(position);
    set({ position });
  },

  skipToNext: async () => {
    const { currentTrack } = get();
    if (!currentTrack) return;
    
    await TrackPlayerService.skipToNext();
    const position = await TrackPlayerService.getPosition();
    const duration = await TrackPlayerService.getDuration();
    const track = await TrackPlayerService.getCurrentTrack();
    
    // 新曲目也需要对齐
    if (track && track.durationMs) {
      const alignedPositionMs = calculateAlignedPosition(track.durationMs);
      const alignedPositionSec = msToSeconds(alignedPositionMs);
      await TrackPlayerService.seekTo(alignedPositionSec);
      incrementPlaybackCount(track.id);
      set({ 
        currentTrack: track,
        position: alignedPositionSec,
        duration: msToSeconds(track.durationMs)
      });
    } else {
      set({ 
        currentTrack: track || null,
        position,
        duration 
      });
    }
  },

  skipToPrevious: async () => {
    const { currentTrack } = get();
    if (!currentTrack) return;
    
    await TrackPlayerService.skipToPrevious();
    const position = await TrackPlayerService.getPosition();
    const duration = await TrackPlayerService.getDuration();
    const track = await TrackPlayerService.getCurrentTrack();
    
    // 新曲目也需要对齐
    if (track && track.durationMs) {
      const alignedPositionMs = calculateAlignedPosition(track.durationMs);
      const alignedPositionSec = msToSeconds(alignedPositionMs);
      await TrackPlayerService.seekTo(alignedPositionSec);
      incrementPlaybackCount(track.id);
      set({ 
        currentTrack: track,
        position: alignedPositionSec,
        duration: msToSeconds(track.durationMs)
      });
    } else {
      set({ 
        currentTrack: track || null,
        position,
        duration 
      });
    }
  },

  updateState: (newState) => set(newState),
}));