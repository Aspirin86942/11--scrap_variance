import type { WpsCellValue } from "../types/wps";

export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

export function isBlankValue(value: WpsCellValue | unknown): boolean {
  return value === null || value === undefined || normalizeText(value) === "";
}
