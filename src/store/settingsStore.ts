import { create } from 'zustand';
import { getSettings, setSettings } from '../utils/storage';

interface SettingsStore {
  isCareMode: boolean;
  toggleCareMode: () => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  isCareMode: getSettings().isCareMode,
  toggleCareMode: () =>
    set((state) => {
      const next = !state.isCareMode;
      setSettings({ isCareMode: next });
      return { isCareMode: next };
    }),
}));
