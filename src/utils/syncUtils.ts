/**
 * 计算时间对齐的播放位置
 * @param durationMs 音频时长（毫秒）
 * @returns 对齐后的播放位置（毫秒），保证距末尾至少 2 秒
 */
export function calculateAlignedPosition(durationMs: number): number {
  if (durationMs <= 0) return 0;
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const elapsedMs = now.getTime() - startOfDay.getTime();
  const pos = elapsedMs % durationMs;
  // 距末尾不足 2 秒时回绕到开头，避免 seek 触发 QueueEnded
  return pos > durationMs - 2000 ? 0 : pos;
}

/**
 * 格式化时间为 MM:SS
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 将毫秒转换为秒
 */
export function msToSeconds(ms: number): number {
  return ms / 1000;
}