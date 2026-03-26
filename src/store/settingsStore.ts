import { create } from 'zustand';
import { getSettings, setSettings } from '../utils/storage';

interface SettingsStore {
  isLargeTextMode: boolean;
  toggleLargeTextMode: () => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  isLargeTextMode: getSettings().isLargeTextMode,
  toggleLargeTextMode: () =>
    set((state) => {
      const next = !state.isLargeTextMode;
      setSettings({ isLargeTextMode: next });
      return { isLargeTextMode: next };
    }),
}));
