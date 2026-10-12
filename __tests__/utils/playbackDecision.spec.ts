import { decidePostCycleAction, isValidQueueEndPosition } from '@/utils/playbackDecision';

describe('playbackDecision · 每首重复遍数优先级', () => {
  const modes = ['repeat-one', 'play-one', 'repeat-all', 'play-all'] as const;

  it.each(modes)('%s 在未达 N 遍前都只能重播当前曲', mode => {
    expect(decidePostCycleAction(mode, 6, 7, false)).toBe('restart-current');
  });

  it('repeat-one 达 N 遍后清零并继续当前曲', () => {
    expect(decidePostCycleAction('repeat-one', 7, 7, false)).toBe('restart-current-reset-count');
  });

  it('play-one 达 N 遍后停止', () => {
    expect(decidePostCycleAction('play-one', 7, 7, false)).toBe('stop');
  });

  it('repeat-all 达 N 遍后进入下一首', () => {
    expect(decidePostCycleAction('repeat-all', 7, 7, false)).toBe('next-track');
  });

  it('play-all 只在最后一首达 N 遍后停止', () => {
    expect(decidePostCycleAction('play-all', 7, 7, false)).toBe('next-track');
    expect(decidePostCycleAction('play-all', 7, 7, true)).toBe('stop');
  });
});

describe('playbackDecision · QueueEnded 位置校验', () => {
  it('只接受靠近实际时长的结束位置', () => {
    expect(isValidQueueEndPosition(69.2, 70.684)).toBe(true);
    expect(isValidQueueEndPosition(20, 70.684)).toBe(false);
    expect(isValidQueueEndPosition(80, 70.684)).toBe(false);
  });
});
