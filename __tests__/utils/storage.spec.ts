import {
  normalizeRepeatCount,
  normalizePlayMode,
  savePlayerState,
  loadPlayerState,
  getSettings,
  setSettings,
  saveSessionCount,
  loadSessionCount,
  saveCycleEligible,
  loadCycleEligible,
  saveCurrentTrack,
  loadCurrentTrack,
  beginPendingTrackChange,
  clearPendingTrackChange,
  loadPendingTrackChange,
  saveExpectedPlaying,
  loadExpectedPlaying,
  ensurePlaybackTask,
  incrementTaskCompletedCount,
  loadPlaybackTaskProgress,
  loadTaskCompletedCount,
  resetPlaybackTask,
  savePlaybackTaskProgress,
  loadTrackGeneration,
  bumpTrackGeneration,
  discardPendingTrackChange,
  isPendingTrackChange,
  savePlaybackPausedAt,
  loadPlaybackPausedAt,
  clearPlaybackPausedAt,
  incrementPlaybackCount,
  getPlaybackStats,
} from '@/utils/storage';
import { MMKV } from 'react-native-mmkv';

beforeEach(() => {
  // 重置 fake mmkv（共享单例）
  (new MMKV() as any).clearAll();
});

describe('storage · PlayerState', () => {
  it('save 后能 load 出原值', () => {
    savePlayerState({ trackIndex: 3, playMode: 'repeat-all' });
    expect(loadPlayerState()).toEqual({ trackIndex: 3, playMode: 'repeat-all' });
  });

  it('未写入时 load 返回 null', () => {
    expect(loadPlayerState()).toBeNull();
  });

  it('损坏或越界的持久化值安全回退', () => {
    const raw = new MMKV() as any;
    raw.set('player_state', '{broken');
    expect(loadPlayerState()).toBeNull();

    raw.set('player_state', JSON.stringify({ trackIndex: -1, playMode: 'unknown' }));
    expect(loadPlayerState()).toEqual({ trackIndex: 0, playMode: 'repeat-one' });
    raw.set('player_state', JSON.stringify({ trackIndex: 1.5, playMode: 'play-one' }));
    expect(loadPlayerState()).toEqual({ trackIndex: 0, playMode: 'play-one' });
  });

  it('播放模式只接受四个枚举值', () => {
    expect(['play-one', 'repeat-one', 'play-all', 'repeat-all'].map(normalizePlayMode)).toEqual([
      'play-one',
      'repeat-one',
      'play-all',
      'repeat-all',
    ]);
    expect(normalizePlayMode(null)).toBe('repeat-one');
  });
});

describe('storage · Settings', () => {
  it('默认值', () => {
    expect(getSettings()).toEqual({ isCareMode: false, isSyncMode: true, repeatCount: 1 });
  });

  it('set 后能取回', () => {
    setSettings({ isCareMode: true, isSyncMode: false, repeatCount: 7 });
    expect(getSettings()).toEqual({ isCareMode: true, isSyncMode: false, repeatCount: 7 });
  });

  it('非法遍数回退为 1，但不再把大整数限幅到 9999', () => {
    setSettings({ isCareMode: false, isSyncMode: false, repeatCount: 0 });
    expect(getSettings().repeatCount).toBe(1);
    setSettings({ isCareMode: false, isSyncMode: false, repeatCount: 100000 });
    expect(getSettings().repeatCount).toBe(100000);
    setSettings({ isCareMode: false, isSyncMode: false, repeatCount: 5_000_000 });
    expect(getSettings().repeatCount).toBe(5_000_000);
  });

  it('非安全整数不能作为重复遍数', () => {
    setSettings({
      isCareMode: false,
      isSyncMode: false,
      repeatCount: Number.MAX_SAFE_INTEGER + 1,
    });
    expect(getSettings().repeatCount).toBe(1);
  });

  it('空值、负数、小数、无穷值均回退为 1', () => {
    expect(
      [null, '', -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY].map(normalizeRepeatCount),
    ).toEqual([1, 1, 1, 1, 1, 1]);
    expect(normalizeRepeatCount('5000000')).toBe(5_000_000);
  });

  it('兼容旧版大字模式字段，并修复缺失字段', () => {
    const raw = new MMKV() as any;
    raw.set('settings', JSON.stringify({ isLargeTextMode: true, repeatCount: -3 }));
    expect(getSettings()).toEqual({ isCareMode: true, isSyncMode: true, repeatCount: 1 });

    raw.set('settings', JSON.stringify({ isCareMode: 'yes', isLargeTextMode: 'yes' }));
    expect(getSettings().isCareMode).toBe(false);
  });

  it('设置 JSON 损坏时返回完整默认值', () => {
    (new MMKV() as any).set('settings', '{broken');
    expect(getSettings()).toEqual({ isCareMode: false, isSyncMode: true, repeatCount: 1 });
  });
});

describe('storage · SessionCount', () => {
  it('默认 0', () => {
    expect(loadSessionCount()).toBe(0);
  });

  it('保存后读取', () => {
    saveSessionCount(5);
    expect(loadSessionCount()).toBe(5);
  });

  it('负数、小数和读取异常均回退为 0', () => {
    saveSessionCount(-1);
    expect(loadSessionCount()).toBe(0);
    saveSessionCount(1.5);
    expect(loadSessionCount()).toBe(0);

    const getNumber = jest.spyOn((MMKV as any).prototype, 'getNumber').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(loadSessionCount()).toBe(0);
    getNumber.mockRestore();
  });
});

describe('storage · CycleEligible', () => {
  it('默认 false', () => {
    expect(loadCycleEligible()).toBe(false);
  });

  it('可置 true 再置 false', () => {
    saveCycleEligible(true);
    expect(loadCycleEligible()).toBe(true);
    saveCycleEligible(false);
    expect(loadCycleEligible()).toBe(false);
  });

  it('兼容旧 started_from_zero，并在读取异常时保守返回 false', () => {
    const raw = new MMKV() as any;
    raw.set('started_from_zero', true);
    expect(loadCycleEligible()).toBe(true);

    const getBoolean = jest.spyOn((MMKV as any).prototype, 'getBoolean').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(loadCycleEligible()).toBe(false);
    getBoolean.mockRestore();
  });
});

describe('storage · 当前播放任务累计遍数', () => {
  it('首次升级时用现有 session_count 初始化同一曲目的累计数', () => {
    saveSessionCount(12);

    expect(ensurePlaybackTask('a05')).toEqual({ trackId: 'a05', completedCount: 12 });
    expect(loadTaskCompletedCount('a05')).toBe(12);
  });

  it('有效完成一遍后立即持久化，重新读取仍保留', () => {
    resetPlaybackTask('a05');

    expect(incrementTaskCompletedCount('a05')).toBe(1);
    expect(incrementTaskCompletedCount('a05')).toBe(2);
    expect(loadPlaybackTaskProgress()).toEqual({ trackId: 'a05', completedCount: 2 });
  });

  it('恢复同一曲目保留累计数，切换到其他曲目从 0 开始', () => {
    resetPlaybackTask('a05');
    incrementTaskCompletedCount('a05');

    expect(ensurePlaybackTask('a05').completedCount).toBe(1);
    expect(ensurePlaybackTask('a06')).toEqual({ trackId: 'a06', completedCount: 0 });
    expect(loadTaskCompletedCount('a05')).toBe(0);
    expect(loadTaskCompletedCount('a06')).toBe(0);
  });

  it('手动重选当前曲目时可显式清零', () => {
    resetPlaybackTask('a05');
    incrementTaskCompletedCount('a05');

    resetPlaybackTask('a05');

    expect(loadTaskCompletedCount('a05')).toBe(0);
  });

  it('损坏任务记录不泄漏到界面计数', () => {
    const raw = new MMKV() as any;
    raw.set('playback_task_progress', '{broken');
    expect(loadPlaybackTaskProgress()).toBeNull();
    raw.set('playback_task_progress', JSON.stringify({ trackId: '', completedCount: 5 }));
    expect(loadPlaybackTaskProgress()).toBeNull();
    raw.set('playback_task_progress', JSON.stringify({ trackId: 'a05', completedCount: -1 }));
    expect(loadPlaybackTaskProgress()).toEqual({ trackId: 'a05', completedCount: 0 });
    expect(loadTaskCompletedCount(null)).toBe(0);
  });

  it('累计遍数在最大安全整数处饱和，不发生精度回绕', () => {
    savePlaybackTaskProgress({ trackId: 'a05', completedCount: Number.MAX_SAFE_INTEGER });
    expect(incrementTaskCompletedCount('a05')).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('storage · 跨 runtime 播放状态', () => {
  it('保存当前曲目和索引', () => {
    saveCurrentTrack({ id: 'a05', index: 4 });
    expect(loadCurrentTrack()).toEqual({ id: 'a05', index: 4 });
  });

  it('换曲 token 只能清理自己的操作', () => {
    const first = beginPendingTrackChange('a01', 0, 'user');
    const second = beginPendingTrackChange('a02', 1, 'remote');
    clearPendingTrackChange(first.token);
    expect(loadPendingTrackChange()).toEqual(second);
    clearPendingTrackChange(second.token);
    expect(loadPendingTrackChange()).toBeNull();
  });

  it('保存是否期望持续播放', () => {
    expect(loadExpectedPlaying()).toBe(false);
    saveExpectedPlaying(true);
    expect(loadExpectedPlaying()).toBe(true);
  });

  it('兼容旧 last_track_id，并拒绝损坏的当前曲目 JSON', () => {
    const raw = new MMKV() as any;
    raw.set('last_track_id', 'a03');
    expect(loadCurrentTrack()).toEqual({ id: 'a03', index: -1 });

    raw.set('current_track', JSON.stringify({ id: '', index: 2 }));
    expect(loadCurrentTrack()).toEqual({ id: 'a03', index: -1 });
    raw.set('current_track', '{broken');
    expect(loadCurrentTrack()).toBeNull();
  });

  it('generation 对非法值回退并可单调递增', () => {
    const raw = new MMKV() as any;
    raw.set('track_generation', -1);
    expect(loadTrackGeneration()).toBe(0);
    expect(bumpTrackGeneration()).toBe(1);
    expect(loadTrackGeneration()).toBe(1);

    const getNumber = jest.spyOn((MMKV as any).prototype, 'getNumber').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(loadTrackGeneration()).toBe(0);
    getNumber.mockRestore();
  });

  it('非法换曲 token 被拒绝，discard 可无条件清理', () => {
    const raw = new MMKV() as any;
    const invalid = [
      { token: 1, trackId: 'a01', index: 0, reason: 'user', generation: 1 },
      { token: 't', trackId: 1, index: 0, reason: 'user', generation: 1 },
      { token: 't', trackId: 'a01', index: 0.5, reason: 'user', generation: 1 },
      { token: 't', trackId: 'a01', index: 0, reason: 'bad', generation: 1 },
      { token: 't', trackId: 'a01', index: 0, reason: 'user', generation: -1 },
    ];
    for (const value of invalid) {
      raw.set('pending_track_change', JSON.stringify(value));
      expect(loadPendingTrackChange()).toBeNull();
    }
    raw.set('pending_track_change', '{broken');
    expect(loadPendingTrackChange()).toBeNull();

    const pending = beginPendingTrackChange('a01', 0, 'auto-next');
    expect(isPendingTrackChange(pending.token)).toBe(true);
    expect(isPendingTrackChange('other')).toBe(false);
    discardPendingTrackChange();
    expect(loadPendingTrackChange()).toBeNull();
  });

  it('暂停时间只接受有限非负数，并可清除', () => {
    savePlaybackPausedAt(-1);
    expect(loadPlaybackPausedAt()).toBeNull();
    savePlaybackPausedAt(Number.NaN);
    expect(loadPlaybackPausedAt()).toBeNull();
    savePlaybackPausedAt(1234);
    expect(loadPlaybackPausedAt()).toBe(1234);
    clearPlaybackPausedAt();
    expect(loadPlaybackPausedAt()).toBeNull();

    const raw = new MMKV() as any;
    raw.set('playback_paused_at', Number.POSITIVE_INFINITY);
    expect(loadPlaybackPausedAt()).toBeNull();
    const getNumber = jest.spyOn((MMKV as any).prototype, 'getNumber').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(loadPlaybackPausedAt()).toBeNull();
    getNumber.mockRestore();
  });

  it('布尔播放意图读取失败时保守返回 false', () => {
    const getBoolean = jest.spyOn((MMKV as any).prototype, 'getBoolean').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(loadExpectedPlaying()).toBe(false);
    getBoolean.mockRestore();
  });
});

describe('storage · 播放统计', () => {
  it('过滤损坏统计并稳定累计合法曲目', () => {
    const now = new Date();
    const key = `stats_${now.getFullYear()}_${now.getMonth() + 1}_${now.getDate()}`;
    const raw = new MMKV() as any;
    raw.set(key, JSON.stringify({ a01: 2, a02: -1, a03: 1.5, '': 9 }));
    expect(getPlaybackStats()).toEqual({ a01: 2 });

    incrementPlaybackCount('a01');
    incrementPlaybackCount('a04');
    expect(getPlaybackStats()).toEqual({ a01: 3, a04: 1 });
  });

  it('非对象、数组和读取异常均返回空统计', () => {
    const now = new Date();
    const key = `stats_${now.getFullYear()}_${now.getMonth() + 1}_${now.getDate()}`;
    const raw = new MMKV() as any;
    for (const value of ['null', '[]', '{broken']) {
      raw.set(key, value);
      expect(getPlaybackStats()).toEqual({});
    }

    const getString = jest.spyOn((MMKV as any).prototype, 'getString').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(getPlaybackStats()).toEqual({});
    getString.mockRestore();
  });
});
