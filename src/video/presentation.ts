import { create } from 'zustand';
import { locateWallClock, Timeline } from '../../packages/program-core/src';
import {
  activeOccurrence,
  Catalog,
  occurrenceOnDate,
  VideoSession,
  VideoTask,
} from '../../packages/program-core/src/tasks';

// Transient view state only: fullscreen must never send a playback command.
export const useVideoPresentation = create<{ fullscreen: boolean; focused: boolean }>(() => ({
  fullscreen: false,
  focused: true,
}));
export const setVideoFullscreen = (fullscreen: boolean) =>
  useVideoPresentation.setState(state => ({ fullscreen: fullscreen && state.focused }));
export const setVideoPlayerFocused = (focused: boolean) =>
  useVideoPresentation.setState(state => ({
    focused,
    fullscreen: focused && state.fullscreen,
  }));

/** Fit the media first, then anchor the persistent counter to source pixels.
 * The bundled 856x482 body clips reserve x=100..212, y=324..404 for the
 * old counter; body subtitles begin at y=408. Never anchor to screen edges. */
export function fullscreenVideoLayout(width: number, height: number) {
  const scale = Math.min(width / 856, height / 482);
  const video = { width: 856 * scale, height: 482 * scale };
  const left = (width - video.width) / 2;
  const top = (height - video.height) / 2;
  return {
    video,
    badge: {
      left: left + 100 * scale,
      top: top + 324 * scale,
      width: 112 * scale,
      height: 80 * scale,
    },
    fontSize: Math.max(10, Math.min(32, 36 * scale)),
  };
}

export function durationText(seconds: number): string {
  const s = Math.floor(Math.max(0, seconds));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map(n => String(n).padStart(2, '0'))
    .join(':');
}

/** View-model of the public clock, NOT locally completed repetitions. */
export function programProgress(session: VideoSession, timeline: Timeline, now: number) {
  const position = locateWallClock(timeline, session.occurrence.startEpochMs, now);
  const elapsed = Math.max(0, Math.min(position.elapsedTicks, timeline.totalTicks));
  const active = position.status === 'active' ? position : null;
  // Repetition==1 is the first span of a user-configured sequence entry.
  const entries = timeline.spans
    .filter(s => s.repetition === 1)
    .map((s, index, all) => ({
      index,
      asset: s.asset,
      startTicks: s.startTicks,
      endTicks: all[index + 1]?.startTicks ?? timeline.totalTicks,
      repeat: (all[index + 1]?.index ?? timeline.spans.length) - s.index,
    }));
  const entry = active
    ? (entries.find(e => elapsed >= e.startTicks && elapsed < e.endTicks) ?? null)
    : null;
  return {
    position,
    entries,
    entry,
    currentCycle: active?.span.cycle ?? null,
    totalCycles: timeline.totalCycles,
    elapsedSeconds: elapsed / timeline.timescale,
    totalSeconds: timeline.totalTicks / timeline.timescale,
    fraction: elapsed / timeline.totalTicks,
    clipElapsedSeconds: (active?.offsetTicks ?? 0) / timeline.timescale,
    clipTotalSeconds: active
      ? (active.span.endTicks - active.span.startTicks) / timeline.timescale
      : 0,
    ended: position.status === 'ended',
  };
}

/** Manual joins honor weekdays/window even with scheduling disabled. Frozen running
 * snapshots win over edited times/sequences, just as runtime.joinVideoTask does. */
export function videoTaskWindow(
  task: VideoTask,
  catalog: Catalog,
  now: number,
  ownedSession: VideoSession | null,
) {
  const frozen =
    ownedSession?.occurrence.task.id === task.id &&
    now >= ownedSession.occurrence.startEpochMs &&
    now < ownedSession.occurrence.endEpochMs
      ? ownedSession.occurrence
      : null;
  const active = frozen || activeOccurrence(task, catalog, now);
  let next: ReturnType<typeof occurrenceOnDate> = null;
  // More than one week also covers a scheduled day skipped by a DST gap.
  for (let offset = 0; !next && offset <= 14; offset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    const candidate = occurrenceOnDate(task, catalog, date);
    if (candidate && candidate.startEpochMs > now) next = candidate;
  }
  return { active, next };
}

export function approximateEnd(task: VideoTask, totalSeconds: number): string {
  const seconds = task.hour * 3600 + task.minute * 60 + task.second + Math.ceil(totalSeconds);
  return `${seconds >= 86400 ? '次日 ' : ''}${durationText(seconds % 86400)}`;
}
