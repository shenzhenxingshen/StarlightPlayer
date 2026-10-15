import {
  PLAYER_LAYOUT_LIMITS,
  classifyPlayerLayout,
  getPlayerLayout,
  PlayerLayoutTokens,
} from '@/utils/playerLayout';

describe('playerLayout · 响应式布局纯函数', () => {
  describe('屏幕分类', () => {
    it('高度大于宽度时为竖屏', () => {
      expect(classifyPlayerLayout(390, 844)).toBe('portrait');
      expect(classifyPlayerLayout(799.999, 800)).toBe('portrait');
    });

    it('等宽高与 3:4 边界均归入方屏', () => {
      expect(classifyPlayerLayout(800, 800)).toBe('square');
      expect(classifyPlayerLayout(400, 300)).toBe('square');
      expect(classifyPlayerLayout(1200, 900)).toBe('square');
    });

    it('低于 3:4 边界时为横屏', () => {
      expect(classifyPlayerLayout(400, 299.999)).toBe('landscape');
      expect(classifyPlayerLayout(844, 390)).toBe('landscape');
    });

    it.each([
      [0, 0],
      [390, 0],
      [0, 844],
      [-390, 844],
      [390, -844],
      [Number.NaN, 844],
      [390, Number.NaN],
      [Number.POSITIVE_INFINITY, 844],
      [390, Number.NEGATIVE_INFINITY],
    ])('无效尺寸 (%p, %p) 回退到竖屏手机基准', (width, height) => {
      expect(classifyPlayerLayout(width, height)).toBe('portrait');
      expect(getPlayerLayout(width, height)).toEqual(getPlayerLayout(390, 844));
    });

    it('极大的有限尺寸仍按比例正确分类', () => {
      expect(classifyPlayerLayout(1e300, 1e299)).toBe('landscape');
    });
  });

  describe('尺寸 token', () => {
    it.each([
      [390, 844, 'portrait', false],
      [1024, 768, 'square', true],
      [844, 390, 'landscape', true],
    ] as const)('%sx%s 生成 %s 布局', (width, height, mode, wide) => {
      const layout = getPlayerLayout(width, height);

      expect(layout.mode).toBe(mode);
      expect(layout.wide).toBe(wide);
      expect(layout.railHeight).toBeLessThanOrEqual(layout.railHeightMax);
      expect(layout.vinylSize).toBeLessThanOrEqual(layout.vinylSizeMax);
      expect(layout.playButtonSize).toBe(layout.standardPlayButtonSize);
    });

    it.each([
      [390, 844],
      [1024, 768],
      [844, 390],
    ])('关怀模式在 %p×%p 下选择更大的播放键和标题', (width, height) => {
      const standard = getPlayerLayout(width, height, false);
      const care = getPlayerLayout(width, height, true);

      expect(care.playButtonSize).toBe(care.carePlayButtonSize);
      expect(care.playButtonSize).toBeGreaterThan(standard.playButtonSize);
      expect(care.titleFontSize).toBeGreaterThan(standard.titleFontSize);
      expect(care.controlRowHeight).toBeGreaterThan(standard.controlRowHeight);
    });

    it('标准与关怀播放键都会被大屏上限约束', () => {
      const layout = getPlayerLayout(10000, 20000, true);

      expect(layout.standardPlayButtonSize).toBe(PLAYER_LAYOUT_LIMITS.standardPlayButtonSize[1]);
      expect(layout.carePlayButtonSize).toBe(PLAYER_LAYOUT_LIMITS.carePlayButtonSize[1]);
      expect(layout.playButtonSize).toBe(PLAYER_LAYOUT_LIMITS.carePlayButtonSize[1]);
      expect(layout.vinylSizeMax).toBe(PLAYER_LAYOUT_LIMITS.vinylSizeMax[1]);
      expect(layout.contentMaxWidth).toBe(560);
    });

    it.each([
      [1, 2],
      [2, 1],
      [320, 320],
      [390, 844],
      [1024, 768],
      [844, 390],
      [10000, 10000],
      [1e300, 1e299],
    ])('所有数值 token 在 %p×%p 下均为有限整数且位于声明范围', (width, height) => {
      const layout = getPlayerLayout(width, height);

      for (const [name, limits] of Object.entries(PLAYER_LAYOUT_LIMITS)) {
        const value = layout[name as keyof PlayerLayoutTokens];
        expect(typeof value).toBe('number');
        expect(Number.isFinite(value)).toBe(true);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(limits[0]);
        expect(value).toBeLessThanOrEqual(limits[1]);
      }
    });

    it('调用之间不共享可变状态', () => {
      const first = getPlayerLayout(390, 844);
      const second = getPlayerLayout(390, 844);

      expect(first).toEqual(second);
      expect(first).not.toBe(second);
    });
  });
});
