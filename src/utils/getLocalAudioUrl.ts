/**
 * 获取本地音频文件的完整路径
 * @param filename 音频文件名
 * @returns 完整的资源路径
 */
export function getLocalAudioUrl(filename: string): string {
  return `audio://${filename}`;
}