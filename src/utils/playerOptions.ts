import { AppKilledPlaybackBehavior, Capability, UpdateOptions } from 'react-native-track-player';

export interface PlayerCapabilitySettings {
  isCareMode: boolean;
  isSyncMode: boolean;
}

export function buildPlayerOptions({
  isCareMode,
  isSyncMode,
}: PlayerCapabilitySettings): UpdateOptions {
  const capabilities = isCareMode
    ? [Capability.Play, Capability.Pause]
    : [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        ...(!isSyncMode ? [Capability.SeekTo] : []),
        Capability.Stop,
      ];
  const compactCapabilities = isCareMode
    ? [Capability.Play, Capability.Pause]
    : [Capability.Play, Capability.Pause, Capability.SkipToPrevious, Capability.SkipToNext];

  return {
    android: {
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
      alwaysPauseOnInterruption: false,
      stopForegroundGracePeriod: 30,
    },
    capabilities,
    notificationCapabilities: capabilities,
    compactCapabilities,
    progressUpdateEventInterval: 1,
  };
}
