import { MMKV } from 'react-native-mmkv';
import { useSettingsStore } from '@/store/settingsStore';
import { getSettings } from '@/utils/storage';

describe('settingsStore', () => {
  beforeEach(() => {
    (new MMKV() as any).clearAll();
    useSettingsStore.setState({ isCareMode: false, isSyncMode: true, repeatCount: 1 });
  });

  it('切换关怀和同步模式时同时持久化', () => {
    useSettingsStore.getState().toggleCareMode();
    useSettingsStore.getState().toggleSyncMode();
    expect(useSettingsStore.getState()).toMatchObject({ isCareMode: true, isSyncMode: false });
    expect(getSettings()).toMatchObject({ isCareMode: true, isSyncMode: false });
  });

  it('重复遍数会归一化并持久化', () => {
    useSettingsStore.getState().setRepeatCount(5_000_000);
    expect(useSettingsStore.getState().repeatCount).toBe(5_000_000);
    expect(getSettings().repeatCount).toBe(5_000_000);

    useSettingsStore.getState().setRepeatCount(0);
    expect(useSettingsStore.getState().repeatCount).toBe(1);
    expect(getSettings().repeatCount).toBe(1);
  });
});
