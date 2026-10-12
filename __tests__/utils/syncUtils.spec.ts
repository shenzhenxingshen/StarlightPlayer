import { calculateAlignedPosition, msToSeconds, formatTime } from '@/utils/syncUtils';

describe('syncUtils', () => {
  describe('calculateAlignedPosition', () => {
    beforeAll(() => {
      jest.useFakeTimers();
    });
    afterAll(() => {
      jest.useRealTimers();
    });

    it('durationMs <= 0 时返回 0', () => {
      expect(calculateAlignedPosition(0)).toBe(0);
      expect(calculateAlignedPosition(-1)).toBe(0);
    });

    it('结果总在 [0, durationMs) 范围内', () => {
      jest.setSystemTime(new Date('2026-06-02T08:30:45.123'));
      const duration = 60_000;
      const pos = calculateAlignedPosition(duration);
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThan(duration);
    });

    it('同一时刻同一时长 → 同样的对齐位置（共修核心性质）', () => {
      jest.setSystemTime(new Date('2026-06-02T12:00:00.000'));
      const a = calculateAlignedPosition(180_000);
      const b = calculateAlignedPosition(180_000);
      expect(a).toBe(b);
    });

    it('当日 0:00 整点对齐位置为 0', () => {
      jest.setSystemTime(new Date('2026-06-02T00:00:00.000'));
      expect(calculateAlignedPosition(60_000)).toBe(0);
    });
  });

  describe('msToSeconds', () => {
    it('正确换算', () => {
      expect(msToSeconds(60_000)).toBe(60);
      expect(msToSeconds(1500)).toBe(1.5);
    });
  });

  describe('formatTime', () => {
    it('补零格式化', () => {
      expect(formatTime(5)).toBe('0:05');
      expect(formatTime(65)).toBe('1:05');
      expect(formatTime(0)).toBe('0:00');
    });
  });
});
