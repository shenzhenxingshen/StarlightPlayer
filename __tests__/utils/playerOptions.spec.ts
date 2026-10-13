import { AppKilledPlaybackBehavior, Capability } from 'react-native-track-player';
import { buildPlayerOptions } from '@/utils/playerOptions';

describe('playerOptions · 平台能力', () => {
  it('普通非同步模式开放完整控制与 seek', () => {
    const options = buildPlayerOptions({ isCareMode: false, isSyncMode: false });

    expect(options.capabilities).toEqual([
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SeekTo,
      Capability.Stop,
    ]);
    expect(options.notificationCapabilities).toEqual(options.capabilities);
  });

  it('同步模式不向锁屏和通知栏公布 seek', () => {
    const options = buildPlayerOptions({ isCareMode: false, isSyncMode: true });

    expect(options.capabilities).not.toContain(Capability.SeekTo);
    expect(options.capabilities).toContain(Capability.SkipToNext);
  });

  it('关怀模式只保留播放和暂停', () => {
    const options = buildPlayerOptions({ isCareMode: true, isSyncMode: false });

    expect(options.capabilities).toEqual([Capability.Play, Capability.Pause]);
    expect(options.compactCapabilities).toEqual([Capability.Play, Capability.Pause]);
  });

  it('Android 明确配置划掉 App 后继续播放和前台宽限', () => {
    const options = buildPlayerOptions({ isCareMode: false, isSyncMode: false });

    expect(options.android).toEqual({
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
      alwaysPauseOnInterruption: false,
      stopForegroundGracePeriod: 30,
    });
    expect(options.progressUpdateEventInterval).toBe(1);
  });
});
