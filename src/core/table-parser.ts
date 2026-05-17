import type { ParsedTable, RawRow } from "../types/scrap";
import type { WpsCellValue, WpsMatrix } from "../types/wps";
import { isBlankValue, normalizeText } from "../utils/text";
import { detectHeaderRow, type HeaderDetectionOptions } from "./header-detection";

function worksheetRowNumber(rowIndex: number, usedRangeStartRow: number | undefined): number | string {
  if (typeof usedRangeStartRow === "number" && Number.isFinite(usedRangeStartRow)) {
    return usedRangeStartRow + rowIndex;
  }
  return `相对 UsedRange 第 ${rowIndex + 1} 行`;
}

export function parseTableFromMatrix(
  matrix: WpsMatrix,
  requiredHeaders: string[],
  options: HeaderDetectionOptions
): ParsedTable {
  const headerResult = detectHeaderRow(matrix, requiredHeaders, options);
  if (!headerResult.ok) {
    throw new Error(headerResult.message);
  }

  const rows: RawRow[] = [];
  for (let rowIndex = headerResult.headerRowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const rawRow = matrix[rowIndex] ?? [];
    const row: RawRow = {
      _rowNumber: worksheetRowNumber(rowIndex, options.usedRangeStartRow)
    };
    let hasValue = false;

    for (let colIndex = 0; colIndex < headerResult.headers.length; colIndex += 1) {
      const header = normalizeText(headerResult.headers[colIndex]);
      if (!header) {
        continue;
      }
      const value = rawRow[colIndex] as WpsCellValue;
      row[header] = value;
      if (!isBlankValue(value)) {
        hasValue = true;
      }
    }

    if (hasValue) {
      rows.push(row);
    }
  }

  return {
    headers: headerResult.headers,
    rows,
    headerRowNumber: headerResult.headerRowNumber,
    columnIndex: headerResult.columnIndex,
    matrix
  };
}
