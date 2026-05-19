import { normalizeText } from "./text";

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function buildValidatedDateKey(year: number, month: number, day: number, rawValue: unknown): string {
  // 用 UTC 重新构造日期来校验 2026-02-31 这类溢出日期，避免 JS Date 自动进位后误判为合法。
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
  // Excel/WPS 会把日期暴露成字符串、数字或 Date 对象；统一成 key 后，后续比较才不会受显示格式影响。
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
    // Excel 序列号按 1899-12-30 为基准换算，这里只生成日期 key，不保留时间部分。
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
