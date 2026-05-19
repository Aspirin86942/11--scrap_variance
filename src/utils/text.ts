import type { WpsCellValue } from "../types/wps";

export function normalizeText(value: unknown): string {
  // WPS 空单元格可能是 null/undefined，统一成空字符串后，业务层就不用反复做空值分支。
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

export function appendUniqueJoinedText(currentText: string, nextText: string, delimiter = "、"): string {
  // 多张 ERP 单据合并展示时只需要去重后的文本串，不保留数组可以减少中间对象分配。
  const current = normalizeText(currentText);
  const next = normalizeText(nextText);

  if (!next) {
    return current;
  }
  if (!current) {
    return next;
  }
  if (
    current === next ||
    current.startsWith(`${next}${delimiter}`) ||
    current.endsWith(`${delimiter}${next}`) ||
    current.includes(`${delimiter}${next}${delimiter}`)
  ) {
    return current;
  }

  return `${current}${delimiter}${next}`;
}

export function isBlankValue(value: WpsCellValue | unknown): boolean {
  return value === null || value === undefined || normalizeText(value) === "";
}
