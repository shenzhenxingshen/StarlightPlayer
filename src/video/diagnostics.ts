import { NativeModules } from 'react-native';

/** Native events are bounded separately from JS logs; exporting must still work
 * on older builds and when the native bridge itself is unavailable. */
export async function getVideoDiagnosticLines(): Promise<string[]> {
  const player = NativeModules.VideoProgramPlayer;
  if (typeof player?.getDiagnostics !== 'function') return [];
  try {
    const lines: unknown = await player.getDiagnostics();
    return Array.isArray(lines)
      ? lines.filter((line): line is string => typeof line === 'string').slice(-300)
      : [];
  } catch (error) {
    return [`原生视频诊断读取失败: ${String(error)}`];
  }
}
