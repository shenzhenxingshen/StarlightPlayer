import { MMKV } from 'react-native-mmkv';
import { DEFAULT_SCHEDULED_TASKS, sortScheduledTasks } from '../constants/scheduledTasks';
import { TRACKS } from '../constants/tracks';
import { ScheduledTask } from '../types/scheduledTask';

const storage = new MMKV();

const SETTINGS_KEY = 'settings';
const PLAYER_STATE_KEY = 'player_state';
const CURRENT_TRACK_KEY = 'current_track';
const PENDING_TRACK_CHANGE_KEY = 'pending_track_change';
const EXPECTED_PLAYING_KEY = 'expected_playing';
const TRACK_GENERATION_KEY = 'track_generation';
const PLAYBACK_PAUSED_AT_KEY = 'playback_paused_at';
const PLAYBACK_TASK_PROGRESS_KEY = 'playback_task_progress';
const SCHEDULED_TASKS_KEY = 'scheduled_tasks_v1';

const normalizeNonNegativeCount = (value: unknown, fallback = 0): number => {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : fallback;
};

export function normalizeRepeatCount(value: unknown): number {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 1 ? count : 1;
}

// --- Player State 持久化 ---
export type PlayMode = 'play-one' | 'repeat-one' | 'play-all' | 'repeat-all';

export interface PlayerState {
  trackIndex: number;
  playMode: PlayMode;
}

const PLAY_MODES: PlayMode[] = ['play-one', 'repeat-one', 'play-all', 'repeat-all'];

export function normalizePlayMode(value: unknown): PlayMode {
  return PLAY_MODES.includes(value as PlayMode) ? (value as PlayMode) : 'repeat-one';
}

export function savePlayerState(state: PlayerState): void {
  storage.set(PLAYER_STATE_KEY, JSON.stringify(state));
}

export function loadPlayerState(): PlayerState | null {
  try {
    const data = storage.getString(PLAYER_STATE_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data);
    return {
      trackIndex:
        Number.isInteger(parsed.trackIndex) && parsed.trackIndex >= 0 ? parsed.trackIndex : 0,
      playMode: normalizePlayMode(parsed.playMode),
    };
  } catch {
    return null;
  }
}

// --- Settings (isCareMode) ---
export function getSettings(): { isCareMode: boolean; isSyncMode: boolean; repeatCount: number } {
  try {
    const data = storage.getString(SETTINGS_KEY);
    if (!data) return { isCareMode: false, isSyncMode: true, repeatCount: 1 };
    const parsed = JSON.parse(data);
    return {
      isCareMode:
        typeof parsed.isCareMode === 'boolean'
          ? parsed.isCareMode
          : typeof parsed.isLargeTextMode === 'boolean'
            ? parsed.isLargeTextMode
            : false,
      isSyncMode: typeof parsed.isSyncMode === 'boolean' ? parsed.isSyncMode : true,
      repeatCount: normalizeRepeatCount(parsed.repeatCount),
    };
  } catch {
    return { isCareMode: false, isSyncMode: true, repeatCount: 1 };
  }
}

export function setSettings(settings: {
  isCareMode: boolean;
  isSyncMode: boolean;
  repeatCount: number;
}): void {
  storage.set(
    SETTINGS_KEY,
    JSON.stringify({ ...settings, repeatCount: normalizeRepeatCount(settings.repeatCount) }),
  );
}

// --- 每日定时任务 ---
function normalizeClockPart(value: unknown, maximum: number): number | null {
  const part = Number(value);
  return Number.isInteger(part) && part >= 0 && part <= maximum ? part : null;
}

export function normalizeScheduledTask(value: unknown): ScheduledTask | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<ScheduledTask>;
  const hour = normalizeClockPart(candidate.hour, 23);
  const minute = normalizeClockPart(candidate.minute, 59);
  const second = normalizeClockPart(candidate.second, 59);
  const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 30) : '';
  if (
    typeof candidate.id !== 'string' ||
    candidate.id.length === 0 ||
    name.length === 0 ||
    hour == null ||
    minute == null ||
    second == null ||
    !TRACKS.some(track => track.id === candidate.trackId)
  ) {
    return null;
  }
  return {
    id: candidate.id,
    name,
    hour,
    minute,
    second,
    trackId: candidate.trackId as string,
    repeatCount: normalizeRepeatCount(candidate.repeatCount),
    playMode: normalizePlayMode(candidate.playMode),
    isSyncMode: candidate.isSyncMode === true,
    enabled: candidate.enabled === true,
  };
}

export function saveScheduledTasks(tasks: readonly ScheduledTask[]): ScheduledTask[] {
  const unique = new Map<string, ScheduledTask>();
  tasks.forEach(task => {
    const normalized = normalizeScheduledTask(task);
    if (normalized) unique.set(normalized.id, normalized);
  });
  const saved = sortScheduledTasks([...unique.values()]);
  storage.set(SCHEDULED_TASKS_KEY, JSON.stringify(saved));
  return saved;
}

export function loadScheduledTasks(): ScheduledTask[] {
  try {
    const data = storage.getString(SCHEDULED_TASKS_KEY);
    if (data == null) return saveScheduledTasks(DEFAULT_SCHEDULED_TASKS);
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return saveScheduledTasks(DEFAULT_SCHEDULED_TASKS);
    return sortScheduledTasks(
      parsed.map(normalizeScheduledTask).filter((task): task is ScheduledTask => task != null),
    );
  } catch {
    return saveScheduledTasks(DEFAULT_SCHEDULED_TASKS);
  }
}

export function loadScheduledTask(taskId: string): ScheduledTask | null {
  return loadScheduledTasks().find(task => task.id === taskId) ?? null;
}

// --- Session Count（跨运行时共享） ---
const SESSION_COUNT_KEY = 'session_count';
const CYCLE_ELIGIBLE_KEY = 'cycle_eligible';
const LEGACY_STARTED_FROM_ZERO_KEY = 'started_from_zero';

export function saveSessionCount(count: number): void {
  storage.set(SESSION_COUNT_KEY, normalizeNonNegativeCount(count));
}

export function loadSessionCount(): number {
  try {
    const count = storage.getNumber(SESSION_COUNT_KEY);
    return normalizeNonNegativeCount(count);
  } catch {
    return 0;
  }
}

// --- 当前播放任务累计遍数 ---
// session_count 只负责“完成 N 遍后执行播放模式”；这里负责跨重启展示累计遍数。
export interface PlaybackTaskProgress {
  trackId: string;
  completedCount: number;
}

export function savePlaybackTaskProgress(progress: PlaybackTaskProgress): void {
  storage.set(
    PLAYBACK_TASK_PROGRESS_KEY,
    JSON.stringify({
      trackId: progress.trackId,
      completedCount: normalizeNonNegativeCount(progress.completedCount),
    }),
  );
}

export function loadPlaybackTaskProgress(): PlaybackTaskProgress | null {
  try {
    const data = storage.getString(PLAYBACK_TASK_PROGRESS_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data);
    if (typeof parsed.trackId !== 'string' || parsed.trackId.length === 0) return null;
    return {
      trackId: parsed.trackId,
      completedCount: normalizeNonNegativeCount(parsed.completedCount),
    };
  } catch {
    return null;
  }
}

export function loadTaskCompletedCount(trackId: string | null | undefined): number {
  if (!trackId) return 0;
  const progress = loadPlaybackTaskProgress();
  return progress?.trackId === trackId ? progress.completedCount : 0;
}

/**
 * 恢复同一播放任务；首次升级到该数据结构时以已有 session_count 作为初始累计值。
 * 如果已经存在其他曲目的任务记录，则视为新任务并从 0 开始，防止串曲。
 */
export function ensurePlaybackTask(
  trackId: string,
  legacyCompletedCount: number = loadSessionCount(),
): PlaybackTaskProgress {
  const current = loadPlaybackTaskProgress();
  if (current?.trackId === trackId) return current;
  const next = {
    trackId,
    completedCount: current == null ? normalizeNonNegativeCount(legacyCompletedCount) : 0,
  };
  savePlaybackTaskProgress(next);
  return next;
}

export function resetPlaybackTask(trackId: string): void {
  savePlaybackTaskProgress({ trackId, completedCount: 0 });
}

export function incrementTaskCompletedCount(
  trackId: string,
  legacyCompletedCount: number = loadSessionCount(),
): number {
  const task = ensurePlaybackTask(trackId, legacyCompletedCount);
  const completedCount = Math.min(Number.MAX_SAFE_INTEGER, task.completedCount + 1);
  savePlaybackTaskProgress({ trackId, completedCount });
  return completedCount;
}

export function saveCycleEligible(value: boolean): void {
  storage.set(CYCLE_ELIGIBLE_KEY, value);
}

export function loadCycleEligible(): boolean {
  try {
    const current = storage.getBoolean(CYCLE_ELIGIBLE_KEY);
    if (current != null) return current;
    return storage.getBoolean(LEGACY_STARTED_FROM_ZERO_KEY) ?? false;
  } catch {
    return false;
  }
}

// 兼容旧代码/旧数据；新代码统一使用 cycleEligible 语义。
export const saveStartedFromZero = saveCycleEligible;
export const loadStartedFromZero = loadCycleEligible;

// --- 当前曲目（跨运行时权威状态） ---
export interface CurrentTrackState {
  id: string;
  index: number;
}

const LAST_TRACK_ID_KEY = 'last_track_id';

export function saveCurrentTrack(state: CurrentTrackState): void {
  storage.set(CURRENT_TRACK_KEY, JSON.stringify(state));
  storage.set(LAST_TRACK_ID_KEY, state.id); // 兼容已安装版本
  const playerState = loadPlayerState();
  savePlayerState({
    trackIndex: state.index,
    playMode: playerState?.playMode ?? 'repeat-one',
  });
}

export function loadCurrentTrack(): CurrentTrackState | null {
  try {
    const data = storage.getString(CURRENT_TRACK_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (typeof parsed.id === 'string' && parsed.id.length > 0 && Number.isInteger(parsed.index)) {
        return { id: parsed.id, index: parsed.index };
      }
    }
    const legacyId = storage.getString(LAST_TRACK_ID_KEY);
    return legacyId ? { id: legacyId, index: -1 } : null;
  } catch {
    return null;
  }
}

export type TrackChangeReason = 'restore' | 'user' | 'auto-next' | 'remote';

export interface PendingTrackChange {
  token: string;
  trackId: string;
  index: number;
  reason: TrackChangeReason;
  generation: number;
}

export function loadTrackGeneration(): number {
  try {
    const generation = storage.getNumber(TRACK_GENERATION_KEY);
    return Number.isInteger(generation) && generation != null && generation >= 0 ? generation : 0;
  } catch {
    return 0;
  }
}

export function bumpTrackGeneration(): number {
  const generation = loadTrackGeneration() + 1;
  storage.set(TRACK_GENERATION_KEY, generation);
  return generation;
}

export function beginPendingTrackChange(
  trackId: string,
  index: number,
  reason: TrackChangeReason,
): PendingTrackChange {
  const pending = {
    token: `${Date.now()}-${Math.random()}`,
    trackId,
    index,
    reason,
    generation: bumpTrackGeneration(),
  };
  storage.set(PENDING_TRACK_CHANGE_KEY, JSON.stringify(pending));
  return pending;
}

export function loadPendingTrackChange(): PendingTrackChange | null {
  try {
    const data = storage.getString(PENDING_TRACK_CHANGE_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data);
    if (
      typeof parsed.token !== 'string' ||
      typeof parsed.trackId !== 'string' ||
      !Number.isInteger(parsed.index) ||
      !['restore', 'user', 'auto-next', 'remote'].includes(parsed.reason) ||
      !Number.isInteger(parsed.generation) ||
      parsed.generation < 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isPendingTrackChange(token: string): boolean {
  return loadPendingTrackChange()?.token === token;
}

export function clearPendingTrackChange(token: string): void {
  if (isPendingTrackChange(token)) storage.delete(PENDING_TRACK_CHANGE_KEY);
}

export function discardPendingTrackChange(): void {
  storage.delete(PENDING_TRACK_CHANGE_KEY);
}

export function saveExpectedPlaying(value: boolean): void {
  storage.set(EXPECTED_PLAYING_KEY, value);
}

export function loadExpectedPlaying(): boolean {
  try {
    return storage.getBoolean(EXPECTED_PLAYING_KEY) ?? false;
  } catch {
    return false;
  }
}

export function savePlaybackPausedAt(timestampMs: number = Date.now()): void {
  if (Number.isFinite(timestampMs) && timestampMs >= 0) {
    storage.set(PLAYBACK_PAUSED_AT_KEY, timestampMs);
  }
}

export function loadPlaybackPausedAt(): number | null {
  try {
    const timestamp = storage.getNumber(PLAYBACK_PAUSED_AT_KEY);
    return Number.isFinite(timestamp) && timestamp != null && timestamp >= 0 ? timestamp : null;
  } catch {
    return null;
  }
}

export function clearPlaybackPausedAt(): void {
  storage.delete(PLAYBACK_PAUSED_AT_KEY);
}

// --- Playback Stats ---
function todayKey(): string {
  const d = new Date();
  return `stats_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}

function getPlaybackStatsForKey(key: string): Record<string, number> {
  try {
    const data = storage.getString(key);
    if (!data) return {};
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([trackId, count]) =>
          trackId.length > 0 && Number.isInteger(count) && (count as number) >= 0,
      ),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

export function getPlaybackStats(): Record<string, number> {
  return getPlaybackStatsForKey(todayKey());
}

export function incrementPlaybackCount(trackId: string): void {
  // 只计算一次日期，避免恰好跨午夜时从旧日读取、向新日写入。
  const key = todayKey();
  const stats = getPlaybackStatsForKey(key);
  stats[trackId] = (stats[trackId] || 0) + 1;
  storage.set(key, JSON.stringify(stats));
}
