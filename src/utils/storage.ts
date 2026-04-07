import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();

const SETTINGS_KEY = 'settings';
const ALIGN_TOKEN_KEY = 'align_seek_token';
const PLAYER_STATE_KEY = 'player_state';

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

// --- Player State 持久化 ---
export interface PlayerState {
  trackIndex: number;
  playMode: string;
}

export function savePlayerState(state: PlayerState): void {
  storage.set(PLAYER_STATE_KEY, JSON.stringify(state));
}

export function loadPlayerState(): PlayerState | null {
  try {
    const data = storage.getString(PLAYER_STATE_KEY);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
}

// --- Settings (isCareMode) ---
export function getSettings(): { isCareMode: boolean; isSyncMode: boolean; repeatCount: number } {
  try {
    const data = storage.getString(SETTINGS_KEY);
    if (!data) return { isCareMode: false, isSyncMode: false, repeatCount: 1 };
    const parsed = JSON.parse(data);
    return {
      isCareMode: parsed.isCareMode ?? parsed.isLargeTextMode ?? false,
      isSyncMode: parsed.isSyncMode ?? false,
      repeatCount: parsed.repeatCount ?? 1,
    };
  } catch {
    return { isCareMode: false, isSyncMode: false, repeatCount: 1 };
  }
}

export function setSettings(settings: { isCareMode: boolean; isSyncMode: boolean; repeatCount: number }): void {
  storage.set(SETTINGS_KEY, JSON.stringify(settings));
}

// --- 同步判断（跨运行时可读） ---
export function shouldSeekAlign(playMode: string): boolean {
  return getSettings().isSyncMode;
}

// --- Session Count（跨运行时共享） ---
const SESSION_COUNT_KEY = 'session_count';

export function saveSessionCount(count: number): void {
  storage.set(SESSION_COUNT_KEY, count);
}

export function loadSessionCount(): number {
  try { return storage.getNumber(SESSION_COUNT_KEY) ?? 0; } catch { return 0; }
}

// --- Playback Stats ---
function todayKey(): string {
  const d = new Date();
  return `stats_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}

export function getPlaybackStats(): Record<string, number> {
  try {
    const data = storage.getString(todayKey());
    return data ? JSON.parse(data) : {};
  } catch { return {}; }
}

export function incrementPlaybackCount(trackId: string): void {
  const stats = getPlaybackStats();
  stats[trackId] = (stats[trackId] || 0) + 1;
  storage.set(todayKey(), JSON.stringify(stats));
}
