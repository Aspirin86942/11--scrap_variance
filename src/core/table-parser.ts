import type { ParsedTable, RawRow } from "../types/scrap";
import type { WpsCellValue, WpsMatrix } from "../types/wps";
import { isBlankValue, normalizeText } from "../utils/text";
import { detectHeaderRow, HeaderDetectionError, type HeaderDetectionOptions } from "./header-detection";

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
    // 表头无法可靠识别时不继续解析行数据，避免把普通说明行当成业务字段。
    throw new HeaderDetectionError(headerResult);
  }

  const rows: RawRow[] = [];
  // 从真实表头下一行开始转 RawRow，同时保留工作表行号给预验证和错误提示使用。
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
      // 全空行不进入业务层，避免格式污染或尾部空行影响行数和校验结果。
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
