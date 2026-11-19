/**
 * Platform-independent program clock.
 * No player, timers, storage, local-midnight modulo, or audio completion counter.
 * All media boundaries use integer ticks in one manifest timescale.
 */
export interface Segment {
  asset: string;
  role: 'intro' | 'salutation' | 'regular' | 'final' | 'outro';
  durationTicks: number;
  repeat: number;
}

export interface Definition {
  id: string;
  revision: string;
  timescale: number;
  segments: Segment[];
}

export interface Span {
  index: number;
  asset: string;
  role: Segment['role'];
  repetition: number;
  /** Program position, NOT locally completed repetitions. */
  cycle: number | null;
  startTicks: number;
  endTicks: number;
}

export interface Timeline {
  id: string;
  revision: string;
  timescale: number;
  totalTicks: number;
  totalCycles: number;
  spans: Span[];
}

export type Position =
  | { status: 'waiting'; elapsedTicks: number }
  | { status: 'ended'; elapsedTicks: number }
  | { status: 'active'; elapsedTicks: number; offsetTicks: number; span: Span };

function positiveInteger(value: number, name: string, maximum = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`Invalid ${name}`);
  }
}

export function compileProgram(definition: Definition): Timeline {
  if (!definition || !definition.id?.trim() || !definition.revision?.trim()) {
    throw new Error('Program id and revision are required');
  }
  positiveInteger(definition.timescale, 'timescale', 1_000_000_000);
  if (!Array.isArray(definition.segments) || !definition.segments.length) {
    throw new Error('Program must have segments');
  }
  const spans: Span[] = [];
  let cursor = 0;
  let cycle = 0;
  for (const segment of definition.segments) {
    if (!segment || typeof segment.asset !== 'string' || !segment.asset.trim()) {
      throw new Error('Asset is required');
    }
    if (!['intro', 'salutation', 'regular', 'final', 'outro'].includes(segment.role)) {
      throw new Error('Invalid segment role');
    }
    positiveInteger(segment.durationTicks, 'duration');
    positiveInteger(segment.repeat, 'repeat', 10_000);
    if (spans.length + segment.repeat > 10_000) throw new Error('Too many spans');
    const end = cursor + segment.durationTicks * segment.repeat;
    if (!Number.isSafeInteger(end)) throw new Error('Timeline overflow');
    for (let n = 1; n <= segment.repeat; n += 1) {
      const isCycle = segment.role === 'regular' || segment.role === 'final';
      if (isCycle) cycle += 1;
      spans.push({
        index: spans.length,
        asset: segment.asset,
        role: segment.role,
        repetition: n,
        cycle: isCycle ? cycle : null,
        startTicks: cursor,
        endTicks: cursor + segment.durationTicks,
      });
      cursor += segment.durationTicks;
    }
  }
  return {
    id: definition.id,
    revision: definition.revision,
    timescale: definition.timescale,
    totalTicks: cursor,
    totalCycles: cycle,
    spans,
  };
}

/** Half-open intervals: at an exact boundary the NEW span owns the position. */
export function locateTicks(timeline: Timeline, elapsedTicks: number): Position {
  if (!Number.isSafeInteger(elapsedTicks)) throw new Error('Invalid elapsed ticks');
  if (elapsedTicks < 0) return { status: 'waiting', elapsedTicks };
  if (elapsedTicks >= timeline.totalTicks) return { status: 'ended', elapsedTicks };
  let low = 0;
  let high = timeline.spans.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (elapsedTicks < timeline.spans[middle].endTicks) high = middle;
    else low = middle + 1;
  }
  const span = timeline.spans[low];
  return { status: 'active', elapsedTicks, offsetTicks: elapsedTicks - span.startTicks, span };
}

/** startEpochMs is an already-resolved occurrence, not "today's current timezone". */
export function locateWallClock(
  timeline: Timeline,
  startEpochMs: number,
  nowEpochMs: number,
): Position {
  if (!Number.isFinite(startEpochMs) || !Number.isFinite(nowEpochMs)) {
    throw new Error('Invalid wall clock');
  }
  return locateTicks(
    timeline,
    Math.floor(((nowEpochMs - startEpochMs) * timeline.timescale) / 1000),
  );
}

export type Intent = 'playing' | 'paused' | 'stopped';
export type Trigger = 'join' | 'resume' | 'tick';

/**
 * Polling must never override explicit pause/stop, and must NOT seek every cycle.
 * Native completion/errors and asynchronous command generations belong to adapters.
 */
export function decide(
  timeline: Timeline,
  startEpochMs: number,
  nowEpochMs: number,
  intent: Intent,
  trigger: Trigger,
): { command: 'seek-and-play' | 'pause' | 'stop' | 'wait' | 'none'; position: Position } {
  if (!['playing', 'paused', 'stopped'].includes(intent)) throw new Error('Invalid intent');
  if (!['join', 'resume', 'tick'].includes(trigger)) throw new Error('Invalid trigger');
  const position = locateWallClock(timeline, startEpochMs, nowEpochMs);
  if (intent === 'stopped' || position.status === 'ended') return { command: 'stop', position };
  if (intent === 'paused') return { command: 'pause', position };
  if (position.status === 'waiting') return { command: 'wait', position };
  return { command: trigger === 'tick' ? 'none' : 'seek-and-play', position };
}
