import Decimal from "decimal.js-light";
import { normalizeText } from "./text";

const PLAIN_NUMERIC_PATTERN = /^[-+]?(?:\d+|\d*\.\d+)$/;
const COMMA_NUMERIC_PATTERN = /^[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;

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

export function decimalToNumber2(value: Decimal): number {
  return Number(value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString());
}
