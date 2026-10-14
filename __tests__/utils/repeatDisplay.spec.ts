import { getRepeatDisplayVisibility } from '@/utils/repeatDisplay';

describe('repeatDisplay · 遍数显示规则', () => {
  it.each(['play-one', 'repeat-one', 'play-all', 'repeat-all'] as const)(
    '重复遍数大于 1 时，%s 同时显示当前遍数和总遍数',
    playMode => {
      expect(getRepeatDisplayVisibility(108, playMode, false)).toEqual({
        showCurrentRepeat: true,
        showTotalRepeat: true,
      });
    },
  );

  it('重复遍数等于 1 且为单曲循环时，只显示当前遍数', () => {
    expect(getRepeatDisplayVisibility(1, 'repeat-one', false)).toEqual({
      showCurrentRepeat: true,
      showTotalRepeat: false,
    });
  });

  it.each(['play-one', 'play-all', 'repeat-all'] as const)(
    '重复遍数等于 1 且为 %s 时，两项都不显示',
    playMode => {
      expect(getRepeatDisplayVisibility(1, playMode, false)).toEqual({
        showCurrentRepeat: false,
        showTotalRepeat: false,
      });
    },
  );

  it('关怀模式继续隐藏遍数信息', () => {
    expect(getRepeatDisplayVisibility(108, 'repeat-one', true)).toEqual({
      showCurrentRepeat: false,
      showTotalRepeat: false,
    });
  });
});
