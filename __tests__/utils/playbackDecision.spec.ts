import { State } from 'react-native-track-player';
import {
  decidePostCycleAction,
  isValidQueueEndPosition,
  shouldRestoreExpectedPlaying,
} from '@/utils/playbackDecision';

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

describe('playbackDecision · 启动播放意图恢复', () => {
  it.each([State.Playing, State.Buffering, State.Loading])(
    '已有原生队列且状态为 %s 时恢复持续播放意图',
    state => {
      expect(shouldRestoreExpectedPlaying(true, state)).toBe(true);
    },
  );

  it.each([State.Ready, State.Paused, State.Stopped, State.Ended, State.Error, State.None])(
    '已有原生队列但状态为 %s 时保持暂停意图',
    state => {
      expect(shouldRestoreExpectedPlaying(true, state)).toBe(false);
    },
  );

  it('冷启动重建队列的 Loading 只代表载入资源，不能自动恢复播放意图', () => {
    expect(shouldRestoreExpectedPlaying(false, State.Loading)).toBe(false);
  });
});
