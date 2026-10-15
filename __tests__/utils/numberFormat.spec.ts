import { formatRepeatCount, unformatRepeatCount } from '@/utils/numberFormat';

describe('numberFormat · 遍数千分位', () => {
  it.each([
    [1, '1'],
    [108, '108'],
    [1_000, '1,000'],
    [10_000, '10,000'],
    [5_000_000, '5,000,000'],
    [Number.MAX_SAFE_INTEGER, '9,007,199,254,740,991'],
  ])('将 %s 格式化为 %s', (value, expected) => {
    expect(formatRepeatCount(value)).toBe(expected);
  });

  it('移除输入框中的千分位和意外的非数字字符', () => {
    expect(unformatRepeatCount('5,000,000')).toBe('5000000');
    expect(unformatRepeatCount(' 5,000,000\t遍')).toBe('5000000');
  });
});
