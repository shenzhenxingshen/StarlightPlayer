import { create } from 'zustand';
import { getPlaybackStats, incrementPlaybackCount as persistCount } from '../utils/storage';

interface StatsStore {
  stats: Record<string, number>;
  refresh: () => void;
  increment: (trackId: string) => void;
}

export const useStatsStore = create<StatsStore>((set) => ({
  stats: getPlaybackStats(),
  refresh: () => set({ stats: getPlaybackStats() }),
  increment: (trackId: string) => {
    persistCount(trackId);
    set({ stats: getPlaybackStats() });
  },
}));
