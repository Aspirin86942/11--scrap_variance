import Decimal from "decimal.js-light";
import { normalizeText } from "./text";

const PLAIN_NUMERIC_PATTERN = /^[-+]?(?:\d+|\d*\.\d+)$/;
const COMMA_NUMERIC_PATTERN = /^[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;

// 金额和数量在核心聚合阶段用 Decimal 承载，避免多行累计时提前丢失小数精度。
export function zeroDecimal(): Decimal {
  return new Decimal(0);
}

export function parseDecimal(value: unknown, fieldName: string): Decimal {
  if (value === null || value === undefined) {
    return zeroDecimal();
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${fieldName}数值格式不正确：${String(value)}`);
    }
    return new Decimal(value);
  }

  const text = normalizeText(value);
  if (text === "") {
    return zeroDecimal();
  }

  // 只接受普通数字或标准千分位数字，混入单位或非法逗号时要尽早报给预验证。
  if (!PLAIN_NUMERIC_PATTERN.test(text) && !COMMA_NUMERIC_PATTERN.test(text)) {
    throw new Error(`${fieldName}数值格式不正确：${String(value)}`);
  }

  return new Decimal(text.replace(/,/g, ""));
}

export function addDecimal(left: Decimal, right: Decimal): Decimal {
  return left.plus(right);
}

export function subtractDecimal(left: Decimal, right: Decimal): Decimal {
  return left.minus(right);
}

export function decimalToDecimal2(value: Decimal): Decimal {
  // 内部汇总需要继续沿用对外展示的两位小数口径，但不应该再从展示行字符串反解析。
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function decimalToNumber2(value: Decimal): number {
  // 对外展示统一保留两位并四舍五入，避免不同输出路径各自定义金额/数量精度。
  return Number(decimalToDecimal2(value).toString());
}
