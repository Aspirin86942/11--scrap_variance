import { parseTableFromMatrix } from "../core/table-parser";
import type { ParsedTable } from "../types/scrap";
import type { WpsMatrix, WpsSheet } from "../types/wps";
import { hasAnyNonBlankRow, normalizeMatrix } from "../utils/matrix";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function readUsedRangeMatrix(sheet: WpsSheet): { matrix: WpsMatrix; usedRangeStartRow?: number } {
  try {
    const usedRange = sheet.UsedRange;
    if (!usedRange) {
      throw new Error("UsedRange 不存在");
    }

    const matrix = normalizeMatrix(usedRange.Value2);
    if (matrix.length === 0 || !hasAnyNonBlankRow(matrix)) {
      throw new Error("UsedRange 没有可读取的数据");
    }

    const usedRangeStartRow = Number.isFinite(usedRange.Row) ? usedRange.Row : undefined;
    if (usedRangeStartRow === undefined) {
      return { matrix };
    }
    return { matrix, usedRangeStartRow };
  } catch (error) {
    throw new Error(`读取工作表失败：${sheet.Name}；${errorMessage(error)}`);
  }
}

export function readSheetTable(
  sheet: WpsSheet,
  requiredHeaders: string[],
  minMatchCount: number,
  maxScanRows: number
): ParsedTable {
  const { matrix, usedRangeStartRow } = readUsedRangeMatrix(sheet);
  return parseTableFromMatrix(matrix, requiredHeaders, {
    minMatchCount,
    maxScanRows,
    usedRangeStartRow
  });
}
