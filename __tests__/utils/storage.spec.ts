import {
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
});

describe('storage · SessionCount', () => {
  it('默认 0', () => {
    expect(loadSessionCount()).toBe(0);
  });

  it('保存后读取', () => {
    saveSessionCount(5);
    expect(loadSessionCount()).toBe(5);
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
});
