import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();

const SETTINGS_KEY = 'settings';
const ALIGN_TOKEN_KEY = 'align_seek_token';

// --- Align Seek Token (跨运行时共享) ---
export function setAlignSeekExpectedUntil(ts: number): void {
  storage.set(ALIGN_TOKEN_KEY, ts.toString());
}

export function consumeAlignSeekExpected(now: number): boolean {
  try {
    const val = storage.getString(ALIGN_TOKEN_KEY);
    if (val && now <= Number(val)) {
      storage.delete(ALIGN_TOKEN_KEY);
      return true;
    }
  } catch {}
  return false;
}

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
