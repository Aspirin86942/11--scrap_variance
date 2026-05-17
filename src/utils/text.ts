import type { WpsCellValue } from "../types/wps";

export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

export function appendUniqueJoinedText(currentText: string, nextText: string, delimiter = "、"): string {
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
