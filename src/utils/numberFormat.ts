/**
 * 使用固定的英文千分位格式展示遍数，避免展示结果受系统语言影响。
 * 业务层已保证遍数是正安全整数，这里仍保留整数化处理以便独立复用。
 */
export function formatRepeatCount(value: number): string {
  return Math.trunc(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 移除千分位及粘贴内容中的非数字字符，恢复为可校验、可编辑的纯数字文本。 */
export function unformatRepeatCount(value: string): string {
  return value.replace(/\D/g, '');
}
