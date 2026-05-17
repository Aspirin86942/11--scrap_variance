import type { WpsCellValue, WpsMatrix } from "../types/wps";
import { isBlankValue } from "./text";

function isArray(value: unknown): value is unknown[] {
  return Object.prototype.toString.call(value) === "[object Array]";
}

function isNumericKey(key: string): boolean {
  return /^\d+$/.test(key);
}

function sortedNumericKeys(value: Record<string, unknown>): number[] {
  return Object.keys(value)
    .filter(isNumericKey)
    .map(Number)
    .sort((left, right) => left - right);
}

function numericObjectToArray(value: Record<string, unknown>): WpsCellValue[] | null {
  const keys = sortedNumericKeys(value);
  if (keys.length === 0) {
    return null;
  }

  const offset = keys[0] === 0 ? 0 : 1;
  const result: WpsCellValue[] = [];
  for (const key of keys) {
    result[key - offset] = value[String(key)] as WpsCellValue;
  }
  return result;
}

function numericObjectToMatrix(value: Record<string, unknown>): WpsMatrix | null {
  const rowKeys = sortedNumericKeys(value);
  if (rowKeys.length === 0) {
    return null;
  }

  const firstRow = value[String(rowKeys[0])];
  if (
    firstRow &&
    typeof firstRow === "object" &&
    (isArray(firstRow) || sortedNumericKeys(firstRow as Record<string, unknown>).length > 0)
  ) {
    return rowKeys.map((key) => {
      const rowValue = value[String(key)];
      if (isArray(rowValue)) {
        return rowValue as WpsCellValue[];
      }
      return numericObjectToArray(rowValue as Record<string, unknown>) ?? [rowValue as WpsCellValue];
    });
  }

  const row = numericObjectToArray(value);
  return row ? [row] : null;
}

export function normalizeMatrix(values: unknown): WpsMatrix {
  if (isArray(values)) {
    if (values.length === 0) {
      return [];
    }
    if (values.every(isArray)) {
      return values as WpsMatrix;
    }
    if (values.some(isArray)) {
      return values.map((row): WpsCellValue[] => (isArray(row) ? (row as WpsCellValue[]) : [row as WpsCellValue]));
    }
    return [values as WpsCellValue[]];
  }

  if (values && typeof values === "object") {
    const objectMatrix = numericObjectToMatrix(values as Record<string, unknown>);
    if (objectMatrix) {
      return objectMatrix;
    }
  }

  return [[values as WpsCellValue]];
}

export function hasAnyNonBlankRow(matrix: WpsMatrix): boolean {
  return matrix.some((row) => row.some((cell) => !isBlankValue(cell)));
}
