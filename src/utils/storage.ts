import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();

const SETTINGS_KEY = 'settings';

function todayKey(): string {
  const d = new Date();
  return `stats_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}

export function getPlaybackStats(): Record<string, number> {
  try {
    const data = storage.getString(todayKey());
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export function incrementPlaybackCount(trackId: string): void {
  const stats = getPlaybackStats();
  stats[trackId] = (stats[trackId] || 0) + 1;
  storage.set(todayKey(), JSON.stringify(stats));
}

export function getSettings(): { isLargeTextMode: boolean } {
  try {
    const data = storage.getString(SETTINGS_KEY);
    return data ? JSON.parse(data) : { isLargeTextMode: false };
  } catch {
    return { isLargeTextMode: false };
  }
}

export function setSettings(settings: { isLargeTextMode: boolean }): void {
  storage.set(SETTINGS_KEY, JSON.stringify(settings));
}

export function isLargeTextMode(): boolean {
  return getSettings().isLargeTextMode;
}

export function toggleLargeTextMode(): void {
  const settings = getSettings();
  settings.isLargeTextMode = !settings.isLargeTextMode;
  setSettings(settings);
}
