import { create } from 'zustand';
import { getSettings, setSettings } from '../utils/storage';

interface SettingsStore {
  isCareMode: boolean;
  isSyncMode: boolean;
  repeatCount: number;
  toggleCareMode: () => void;
  toggleSyncMode: () => void;
  setRepeatCount: (n: number) => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...getSettings(),
  toggleCareMode: () => {
    const s = get();
    const next = !s.isCareMode;
    setSettings({ isCareMode: next, isSyncMode: s.isSyncMode, repeatCount: s.repeatCount });
    set({ isCareMode: next });
  },
  toggleSyncMode: () => {
    const s = get();
    const next = !s.isSyncMode;
    setSettings({ isCareMode: s.isCareMode, isSyncMode: next, repeatCount: s.repeatCount });
    set({ isSyncMode: next });
  },
  setRepeatCount: (n: number) => {
    const s = get();
    const val = Math.max(1, Math.round(n));
    setSettings({ isCareMode: s.isCareMode, isSyncMode: s.isSyncMode, repeatCount: val });
    set({ repeatCount: val });
  },
}));
