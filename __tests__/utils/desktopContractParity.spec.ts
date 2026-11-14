import {
  MODES,
  postCycleAction,
  validEnd,
  alignedPosition,
} from '../../packages/playback-core/src';
import { decidePostCycleAction, isValidQueueEndPosition } from '../../src/utils/playbackDecision';
import { calculateAlignedPosition } from '../../src/utils/syncUtils';

describe('desktop extraction stays aligned with the existing mobile contract', () => {
  it('exhausts four modes, N boundaries and playlist boundaries', () => {
    for (const mode of MODES)
      for (const n of [1, 7, 108, 5000000, Number.MAX_SAFE_INTEGER])
        for (const count of [0, n - 1, n])
          for (const last of [false, true])
            expect(postCycleAction(mode, count, n, last)).toBe(
              decidePostCycleAction(mode, count, n, last),
            );
  });
  it('keeps end-position tolerance unchanged', () => {
    for (const duration of [0, 60008, 70385])
      for (const delta of [-2001, -2000, 0, 5000, 5001, NaN, Infinity])
        expect(validEnd(duration + delta, duration)).toBe(
          isValidQueueEndPosition((duration + delta) / 1000, duration / 1000),
        );
  });
  it('aligns against local midnight, not UTC or the task start', () => {
    jest.useFakeTimers();
    try {
      for (const time of [
        '2026-11-15T00:00:00+08:00',
        '2026-11-15T05:30:00+08:00',
        '2026-11-15T23:59:59.999+08:00',
      ]) {
        const now = new Date(time);
        jest.setSystemTime(now);
        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        for (const duration of [60008, 70385])
          expect(alignedPosition(duration, { nowMs: +now, midnightMs: midnight })).toBe(
            calculateAlignedPosition(duration),
          );
      }
    } finally {
      jest.useRealTimers();
    }
  });
});
