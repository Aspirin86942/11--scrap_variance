import { normalizeText } from "./text";

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function buildValidatedDateKey(year: number, month: number, day: number, rawValue: unknown): string {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`日期格式不正确：${String(rawValue)}`);
  }

  return formatDateKey(year, month, day);
}

export function normalizeDateKey(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (Object.prototype.toString.call(value) === "[object Date]") {
    const date = value as Date;
    if (Number.isNaN(date.getTime())) {
      throw new Error(`日期格式不正确：${String(value)}`);
    }
    return formatDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`日期格式不正确：${String(value)}`);
    }
    const excelDate = new Date((value - 25569) * 86400 * 1000);
    if (Number.isNaN(excelDate.getTime())) {
      throw new Error(`日期格式不正确：${String(value)}`);
    }
    return formatDateKey(
      excelDate.getUTCFullYear(),
      excelDate.getUTCMonth() + 1,
      excelDate.getUTCDate()
    );
  }

  const text = normalizeText(value);
  if (text === "") {
    return "";
  }

  const match = text.match(/^(\d{4})([\/.-])(\d{1,2})\2(\d{1,2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (!match) {
    throw new Error(`日期格式不正确：${String(value)}`);
  }

  return buildValidatedDateKey(Number(match[1]), Number(match[3]), Number(match[4]), value);
}
