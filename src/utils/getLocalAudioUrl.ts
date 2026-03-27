import { Platform } from 'react-native';

export function getLocalAudioUrl(filename: string): string {
  if (Platform.OS === 'ios') {
    // RNTP iOS: RCTConvert 会把非 http 的字符串当本地文件处理
    // 需要传 bundle 内的完整路径
    const RNFS_BUNDLE = ''; // RCTConvert 会自动在 mainBundle 里查找
    return filename;
  }
  return `file:///android_asset/audio/${filename}`;
}
