/**
 * Platform-free playback contract. No clock, storage, native engine or UI imports.
 * The mobile service is NOT migrated yet; parity tests guard the extraction.
 */
export const START_TOLERANCE_MS = 1500;
export const MODES = ['repeat-one', 'play-one', 'repeat-all', 'play-all'] as const;
export type Mode = (typeof MODES)[number];
export interface Track {
  id: string;
  code: string;
  title: string;
  audioUrl: string;
  durationMs: number;
}
export interface Config {
  trackId: string;
  repeatCount: number;
  mode: Mode;
  sync: boolean;
}
export interface Clock {
  nowMs: number;
  midnightMs: number;
  dayKey?: string;
}
export type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'complete' | 'error';
export interface State {
  version: 1;
  config: Config;
  status: Status;
  generation: number;
  sessionCount: number;
  completedCount: number;
  eligible: boolean;
  positionMs: number;
  pausedAtMs: number | null;
  error: string | null;
  dailyStats?: Record<string, Record<string, number>>;
}
export type Command =
  | { type: 'start'; config: Config }
  | { type: 'configure'; settings: Partial<Omit<Config, 'trackId'>> }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'stop' }
  | { type: 'seek'; positionMs: number };
export type Event =
  | Command
  | { type: 'loaded'; generation: number }
  | { type: 'started'; generation: number; positionMs: number; eligible: boolean }
  | { type: 'ended'; generation: number; reason: 'eof' | 'stop' | 'error'; positionMs: number }
  | { type: 'failed'; generation: number; message: string }
  | { type: 'discontinuity' };
export type Effect =
  | { type: 'load'; trackId: string; generation: number }
  | { type: 'seek-play'; positionMs: number; eligible: boolean; generation: number }
  | { type: 'seek'; positionMs: number; eligible: boolean; generation: number }
  | { type: 'pause' | 'resume' | 'stop' };
export interface Transition {
  state: State;
  effects: Effect[];
}

/** Include the in-progress cycle only when it currently qualifies for counting. */
export function displayedCount(state: Pick<State, 'completedCount' | 'eligible'>): number {
  return Math.min(Number.MAX_SAFE_INTEGER, state.completedCount + (state.eligible ? 1 : 0));
}

function integer(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}
export function validateConfig(raw: unknown, tracks: readonly Track[]): Config {
  const c = raw as Config;
  if (
    !c ||
    typeof c !== 'object' ||
    !tracks.some(t => t.id === c.trackId) ||
    !integer(c.repeatCount, 1) ||
    !MODES.includes(c.mode) ||
    typeof c.sync !== 'boolean'
  ) {
    throw new Error('Invalid playback configuration');
  }
  return { trackId: c.trackId, repeatCount: c.repeatCount, mode: c.mode, sync: c.sync };
}
export function alignedPosition(durationMs: number, clock: Clock): number {
  if (
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    !Number.isFinite(clock.nowMs) ||
    !Number.isFinite(clock.midnightMs) ||
    clock.nowMs < clock.midnightMs
  )
    throw new Error('Invalid clock or duration');
  return (clock.nowMs - clock.midnightMs) % durationMs;
}
export function nearStart(positionMs: number): boolean {
  return Number.isFinite(positionMs) && positionMs >= 0 && positionMs <= START_TOLERANCE_MS;
}
export function resumeEligible(
  previous: boolean,
  before: number,
  target: number,
  duration: number,
  pausedAt: number | null,
  now: number,
): boolean {
  const elapsed = pausedAt === null ? null : now - pausedAt;
  const distance = Math.abs(before - target);
  return (
    nearStart(target) ||
    (previous &&
      (elapsed === null || (elapsed >= 0 && elapsed <= 1500)) &&
      Math.min(distance, Math.abs(duration - distance)) <= 1500)
  );
}
export function postCycleAction(mode: Mode, count: number, repeat: number, last: boolean) {
  if (count < repeat) return 'restart-current';
  switch (mode) {
    case 'repeat-one':
      return 'restart-current-reset-count';
    case 'play-one':
      return 'stop';
    case 'repeat-all':
      return 'next-track';
    case 'play-all':
      return last ? 'stop' : 'next-track';
  }
}
export function validEnd(positionMs: number, durationMs: number): boolean {
  return (
    Number.isFinite(positionMs) &&
    Number.isFinite(durationMs) &&
    durationMs > 0 &&
    positionMs >= durationMs - 2000 &&
    positionMs <= durationMs + 5000
  );
}
export function initialState(config: Config): State {
  return {
    version: 1,
    config,
    status: 'idle',
    generation: 0,
    sessionCount: 0,
    completedCount: 0,
    eligible: false,
    positionMs: 0,
    pausedAtMs: null,
    error: null,
    dailyStats: {},
  };
}
/** Cold restore never autoplays, and never claims continuity across process death. */
export function restore(raw: unknown, tracks: readonly Track[]): State {
  const s = raw as State;
  if (
    !s ||
    s.version !== 1 ||
    !integer(s.generation, 0) ||
    !integer(s.sessionCount, 0) ||
    !integer(s.completedCount, 0) ||
    !Number.isFinite(s.positionMs) ||
    s.positionMs < 0 ||
    !['idle', 'loading', 'playing', 'paused', 'complete', 'error'].includes(s.status)
  ) {
    throw new Error('Invalid saved playback state; original file retained');
  }
  const config = validateConfig(s.config, tracks);
  const dailyStats = s.dailyStats ?? {};
  if (
    !dailyStats ||
    typeof dailyStats !== 'object' ||
    Array.isArray(dailyStats) ||
    Object.entries(dailyStats).some(
      ([day, counts]) =>
        !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
        !counts ||
        Array.isArray(counts) ||
        typeof counts !== 'object' ||
        Object.entries(counts).some(
          ([id, count]) => !tracks.some(t => t.id === id) || !integer(count, 0),
        ),
    )
  )
    throw new Error('Invalid saved statistics; original file retained');
  return {
    ...initialState(config),
    generation: s.generation,
    sessionCount: s.sessionCount,
    completedCount: s.completedCount,
    status: s.status === 'complete' ? 'complete' : 'idle',
    dailyStats,
  };
}
function increment(value: number): number {
  if (value >= Number.MAX_SAFE_INTEGER) throw new Error('Counter reached safe integer limit');
  return value + 1;
}
export function transition(
  input: State,
  event: Event,
  clock: Clock,
  tracks: readonly Track[],
): Transition {
  let s: State = { ...input, config: { ...input.config } };
  const effects: Effect[] = [];
  const result = () => ({ state: s, effects });
  if ('generation' in event && event.generation !== s.generation) return result();
  const track = () => {
    const t = tracks.find(t => t.id === s.config.trackId);
    if (!t) throw new Error('Unknown track');
    return t;
  };
  const load = () => {
    s.generation = increment(s.generation);
    s.status = 'loading';
    s.eligible = false;
    s.positionMs = 0;
    s.error = null;
    s.pausedAtMs = null;
    effects.push({ type: 'load', trackId: s.config.trackId, generation: s.generation });
  };
  switch (event.type) {
    case 'configure': {
      if (
        !event.settings ||
        typeof event.settings !== 'object' ||
        Object.keys(event.settings).some(key => !['mode', 'sync', 'repeatCount'].includes(key))
      ) {
        throw new Error('Invalid playback settings');
      }
      const wasSync = s.config.sync;
      s.config = validateConfig({ ...s.config, ...event.settings }, tracks);
      // As on mobile, changing settings is NOT selecting a new playback task.
      // A running cycle finishes before the new repeat target/mode is evaluated.
      if (!wasSync && s.config.sync && ['playing', 'paused'].includes(s.status)) {
        const target = alignedPosition(track().durationMs, clock);
        s.positionMs = target;
        s.eligible = nearStart(target);
        effects.push({
          type: 'seek',
          positionMs: target,
          eligible: s.eligible,
          generation: s.generation,
        });
      }
      break;
    }
    case 'start':
      s.config = validateConfig(event.config, tracks);
      s.sessionCount = 0;
      s.completedCount = 0;
      load();
      break;
    case 'play':
      if (s.status === 'playing' || s.status === 'loading') break;
      if (s.status === 'complete') {
        s.sessionCount = 0;
        s.completedCount = 0;
      }
      if (s.status === 'paused') {
        if (s.config.sync) {
          const target = alignedPosition(track().durationMs, clock);
          effects.push({
            type: 'seek-play',
            positionMs: target,
            generation: s.generation,
            eligible: resumeEligible(
              s.eligible,
              s.positionMs,
              target,
              track().durationMs,
              s.pausedAtMs,
              clock.nowMs,
            ),
          });
        } else {
          s.status = 'playing';
          effects.push({ type: 'resume' });
        }
      } else load();
      break;
    case 'pause':
      if (s.status === 'loading') {
        s.generation = increment(s.generation);
        s.status = 'idle';
        effects.push({ type: 'stop' });
      } else if (s.status === 'playing') {
        s.status = 'paused';
        s.pausedAtMs = clock.nowMs;
        effects.push({ type: 'pause' });
      }
      break;
    case 'stop':
      s.generation = increment(s.generation);
      if (s.status !== 'complete') s.status = 'idle';
      s.eligible = false;
      effects.push({ type: 'stop' });
      break;
    case 'discontinuity':
      // Wake/clock-change cannot claim an uninterrupted cycle. A new sync start
      // within 0..1500ms can qualify at readiness. Replace the native generation
      // so an EOF queued before sleep cannot finish the newly aligned cycle.
      s.eligible = false;
      if (s.status === 'playing' && s.config.sync) {
        load();
      }
      break;
    case 'loaded':
      if (s.status !== 'loading') break;
      {
        const target = s.config.sync ? alignedPosition(track().durationMs, clock) : 0;
        effects.push({
          type: 'seek-play',
          positionMs: target,
          eligible: nearStart(target),
          generation: s.generation,
        });
      }
      break;
    case 'started':
      if (!['loading', 'playing', 'paused'].includes(s.status)) break;
      s.positionMs = event.positionMs;
      s.eligible = event.eligible;
      s.status = 'playing';
      s.pausedAtMs = null;
      break;
    case 'seek':
      if (s.config.sync) throw new Error('Seeking is disabled in synchronized mode');
      if (
        !Number.isFinite(event.positionMs) ||
        event.positionMs < 0 ||
        event.positionMs > track().durationMs
      )
        throw new Error('Invalid seek position');
      if (!['paused', 'playing'].includes(s.status)) throw new Error('No active track');
      // The host commits this transition only after the engine command succeeds.
      s.positionMs = event.positionMs;
      s.eligible = nearStart(event.positionMs);
      effects.push({
        type: 'seek',
        positionMs: event.positionMs,
        eligible: s.eligible,
        generation: s.generation,
      });
      break;
    case 'ended':
      if (s.status === 'loading' && event.reason === 'error') {
        s.status = 'error';
        s.error = 'Engine failed to load the track';
        s.eligible = false;
        effects.push({ type: 'stop' });
        break;
      }
      if (!['playing', 'paused'].includes(s.status)) break;
      if (event.reason !== 'eof' || !validEnd(event.positionMs, track().durationMs)) {
        s.status = 'error';
        s.error = 'Unexpected engine end';
        s.eligible = false;
        effects.push({ type: 'stop' });
        break;
      }
      if (s.eligible) {
        s.sessionCount = increment(s.sessionCount);
        s.completedCount = increment(s.completedCount);
        const day = clock.dayKey ?? new Date(clock.nowMs).toISOString().slice(0, 10);
        const daily = s.dailyStats?.[day] ?? {};
        s.dailyStats = {
          ...s.dailyStats,
          [day]: {
            ...daily,
            [s.config.trackId]: Math.min(
              Number.MAX_SAFE_INTEGER,
              (daily[s.config.trackId] ?? 0) + 1,
            ),
          },
        };
      }
      s.eligible = false;
      {
        const wasPaused = s.status === 'paused';
        const index = tracks.findIndex(t => t.id === s.config.trackId);
        const action = postCycleAction(
          s.config.mode,
          s.sessionCount,
          s.config.repeatCount,
          index === tracks.length - 1,
        );
        if (action === 'stop') {
          s.status = 'complete';
          effects.push({ type: 'stop' });
        } else {
          if (action === 'restart-current-reset-count') s.sessionCount = 0;
          if (action === 'next-track') {
            s.config.trackId = tracks[(index + 1) % tracks.length].id;
            s.sessionCount = 0;
            s.completedCount = 0;
          }
          if (wasPaused) {
            // Native EOF can race a pause. Count it once, but do not restart
            // behind the user's back or leave a "paused" track that no longer exists.
            s.generation = increment(s.generation);
            s.status = 'idle';
            s.positionMs = 0;
            s.pausedAtMs = null;
            effects.push({ type: 'stop' });
          } else load();
        }
      }
      break;
    case 'failed':
      s.status = 'error';
      s.error = event.message.slice(0, 300);
      s.eligible = false;
      effects.push({ type: 'stop' });
      break;
    default:
      throw new Error('Unknown playback event');
  }
  return result();
}

export * from './tasks';
