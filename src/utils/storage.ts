import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();

export const storageKeys = {
  PLAYBACK_STATS: 'playback_stats',
  SETTINGS: 'settings',
};

export function getPlaybackStats(): Record<string, number> {
  try {
    const data = storage.getString(storageKeys.PLAYBACK_STATS);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export function setPlaybackStats(stats: Record<string, number>): void {
  storage.set(storageKeys.PLAYBACK_STATS, JSON.stringify(stats));
}

export function incrementPlaybackCount(trackId: string): void {
  const stats = getPlaybackStats();
  stats[trackId] = (stats[trackId] || 0) + 1;
  setPlaybackStats(stats);
}

export function getSettings(): { isLargeTextMode: boolean } {
  try {
    const data = storage.getString(storageKeys.SETTINGS);
    return data ? JSON.parse(data) : { isLargeTextMode: false };
  } catch {
    return { isLargeTextMode: false };
  }
}

export function setSettings(settings: { isLargeTextMode: boolean }): void {
  storage.set(storageKeys.SETTINGS, JSON.stringify(settings));
}

export function isLargeTextMode(): boolean {
  return getSettings().isLargeTextMode;
}

export function toggleLargeTextMode(): void {
  const settings = getSettings();
  settings.isLargeTextMode = !settings.isLargeTextMode;
  setSettings(settings);
}