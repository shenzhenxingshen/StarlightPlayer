import { MMKV } from 'react-native-mmkv';
import { useStatsStore } from '@/store/statsStore';
import { incrementPlaybackCount } from '@/utils/storage';

describe('statsStore', () => {
  beforeEach(() => {
    (new MMKV() as any).clearAll();
    useStatsStore.setState({ stats: {} });
  });

  it('increment 写入存储并刷新状态', () => {
    useStatsStore.getState().increment('A01');
    expect(useStatsStore.getState().stats).toEqual({ A01: 1 });
  });

  it('refresh 重新读取外部更新', () => {
    incrementPlaybackCount('A02');
    useStatsStore.getState().refresh();
    expect(useStatsStore.getState().stats).toEqual({ A02: 1 });
  });
});
