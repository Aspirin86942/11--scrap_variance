import { HeaderDetectionError, detectHeaderRow } from "../core/header-detection";
import { parseTableFromMatrix } from "../core/table-parser";
import type { ParsedTable } from "../types/scrap";
import type { WpsMatrix, WpsRange, WpsSheet } from "../types/wps";
import { hasAnyNonBlankRow, normalizeMatrix } from "../utils/matrix";
import { rangeAddress } from "./write-results";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type SheetReadStrategy = "grouped_ranges" | "used_range_fallback";

export interface SheetReadDiagnostics {
  strategy: SheetReadStrategy;
  usedRangeAddress: string;
  usedRangeRows: number;
  usedRangeCols: number;
  readRangeDescription: string;
  readRows: number;
  readCols: number;
  groupCount?: number;
  fallbackReason?: string;
}

export interface OptimizedMatrixReadResult {
  matrix: WpsMatrix;
  usedRangeStartRow?: number;
  diagnostics: SheetReadDiagnostics;
}

export interface ParsedTableWithDiagnostics {
  table: ParsedTable;
  diagnostics: SheetReadDiagnostics;
}

interface RangeDimensions {
  startRow: number;
  startCol: number;
  rowCount: number;
  colCount: number;
  address: string;
}

interface ColumnGroup {
  startCol: number;
  endCol: number;
}

interface RequiredColumn {
  header: string;
  absoluteCol: number;
}

interface GroupedReadPlan {
  startRow: number;
  rowCount: number;
  groups: ColumnGroup[];
  requiredColumns: RequiredColumn[];
  usedRange: RangeDimensions;
  description: string;
}

function rangeCount(collection: { Count?: number } | undefined): number | undefined {
  return typeof collection?.Count === "number" && Number.isFinite(collection.Count) ? collection.Count : undefined;
}

function readRangeValue(range: WpsRange): unknown {
  const value2 = range.Value2;
  if (value2 !== undefined) {
    return value2;
  }
  return range.Value;
}

function matrixWidth(matrix: WpsMatrix): number {
  return matrix.reduce((width, row) => Math.max(width, row.length), 0);
}

function describeGroups(groups: ColumnGroup[], startRow: number, rowCount: number): string {
  return groups.map((group) => rangeAddress(startRow, group.startCol, rowCount, group.endCol - group.startCol + 1)).join(",");
}

function readUsedRangeDimensions(usedRange: WpsRange): RangeDimensions | null {
  const startRow = typeof usedRange.Row === "number" && Number.isFinite(usedRange.Row) ? usedRange.Row : 1;
  const startCol = typeof usedRange.Column === "number" && Number.isFinite(usedRange.Column) ? usedRange.Column : 1;
  const rowCount = rangeCount(usedRange.Rows);
  const colCount = rangeCount(usedRange.Columns);
  if (!rowCount || !colCount) {
    return null;
  }
  return {
    startRow,
    startCol,
    rowCount,
    colCount,
    address:
      typeof usedRange.Address === "string" && usedRange.Address
        ? usedRange.Address
        : rangeAddress(startRow, startCol, rowCount, colCount)
  };
}

function contiguousGroups(columns: number[]): ColumnGroup[] {
  const sorted = [...columns].sort((left, right) => left - right);
  const groups: ColumnGroup[] = [];
  for (const column of sorted) {
    const last = groups[groups.length - 1];
    if (last && column === last.endCol + 1) {
      last.endCol = column;
    } else {
      groups.push({ startCol: column, endCol: column });
    }
  }
  return groups;
}

function groupKey(group: ColumnGroup): string {
  return `${group.startCol}:${group.endCol}`;
}

function requiredColumnsFromHeader(
  requiredHeaders: string[],
  columnIndex: Record<string, number>,
  usedRangeStartCol: number
): RequiredColumn[] {
  return requiredHeaders.map((header) => {
    const relativeCol = columnIndex[header];
    if (typeof relativeCol !== "number") {
      throw new Error(`缺少必需字段列映射：${header}`);
    }
    return {
      header,
      absoluteCol: usedRangeStartCol + relativeCol
    };
  });
}

function buildGroupedReadPlan(
  usedRange: RangeDimensions,
  headerRowOffset: number,
  requiredHeaders: string[],
  columnIndex: Record<string, number>
): GroupedReadPlan {
  const requiredColumns = requiredColumnsFromHeader(requiredHeaders, columnIndex, usedRange.startCol);
  const uniqueColumns = [...new Set(requiredColumns.map((column) => column.absoluteCol))];
  const groups = contiguousGroups(uniqueColumns);
  const startRow = usedRange.startRow + headerRowOffset;
  const rowCount = usedRange.rowCount - headerRowOffset;
  return {
    startRow,
    rowCount,
    groups,
    requiredColumns,
    usedRange,
    description: describeGroups(groups, startRow, rowCount)
  };
}

function readRectangleMatrix(sheet: WpsSheet, group: ColumnGroup, startRow: number, rowCount: number): WpsMatrix {
  const address = rangeAddress(startRow, group.startCol, rowCount, group.endCol - group.startCol + 1);
  return normalizeMatrix(readRangeValue(sheet.Range(address)));
}

function groupForColumn(groups: ColumnGroup[], absoluteCol: number): ColumnGroup {
  const group = groups.find((candidate) => candidate.startCol <= absoluteCol && absoluteCol <= candidate.endCol);
  if (!group) {
    throw new Error(`找不到字段列所在读取组：${absoluteCol}`);
  }
  return group;
}

function readGroupedMatrices(sheet: WpsSheet, plan: GroupedReadPlan): Map<string, WpsMatrix> {
  const matrices = new Map<string, WpsMatrix>();
  for (const group of plan.groups) {
    const matrix = readRectangleMatrix(sheet, group, plan.startRow, plan.rowCount);
    const expectedWidth = group.endCol - group.startCol + 1;
    const address = rangeAddress(plan.startRow, group.startCol, plan.rowCount, expectedWidth);
    if (matrix.length !== plan.rowCount) {
      throw new Error(`列组读取行数不一致：${address} 期望 ${plan.rowCount} 行，实际 ${matrix.length} 行`);
    }
    if (matrix.some((row) => row.length < expectedWidth)) {
      throw new Error(`列组读取列数不一致：${address} 期望 ${expectedWidth} 列`);
    }
    matrices.set(groupKey(group), matrix);
  }
  return matrices;
}

function stitchRequiredHeaderMatrix(plan: GroupedReadPlan, groupMatrices: Map<string, WpsMatrix>): WpsMatrix {
  const result: WpsMatrix = [];
  for (let rowIndex = 0; rowIndex < plan.rowCount; rowIndex += 1) {
    const row = plan.requiredColumns.map((requiredColumn) => {
      const group = groupForColumn(plan.groups, requiredColumn.absoluteCol);
      const matrix = groupMatrices.get(groupKey(group));
      if (!matrix) {
        throw new Error(`缺少列组读取结果：${groupKey(group)}`);
      }
      return matrix[rowIndex]?.[requiredColumn.absoluteCol - group.startCol] ?? "";
    });
    result.push(row);
  }
  return result;
}

function diagnosticsForGroupedPlan(plan: GroupedReadPlan, matrix: WpsMatrix): SheetReadDiagnostics {
  return {
    strategy: "grouped_ranges",
    usedRangeAddress: plan.usedRange.address,
    usedRangeRows: plan.usedRange.rowCount,
    usedRangeCols: plan.usedRange.colCount,
    readRangeDescription: plan.description,
    readRows: matrix.length,
    readCols: plan.requiredColumns.length,
    groupCount: plan.groups.length
  };
}

export function readUsedRangeMatrix(sheet: WpsSheet): { matrix: WpsMatrix; usedRangeStartRow?: number } {
  try {
    const usedRange = sheet.UsedRange;
    if (!usedRange) {
      throw new Error("UsedRange 不存在");
    }

    const matrix = normalizeMatrix(readRangeValue(usedRange));
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

export function readSheetMatrixOptimized(
  sheet: WpsSheet,
  requiredHeaders: string[],
  minMatchCount: number,
  maxScanRows: number
): OptimizedMatrixReadResult {
  const usedRange = sheet.UsedRange;
  if (!usedRange) {
    throw new Error(`读取工作表失败：${sheet.Name}；UsedRange 不存在`);
  }

  const dimensions = readUsedRangeDimensions(usedRange);
  try {
    if (!dimensions) {
      throw new Error("UsedRange 缺少行列范围信息");
    }

    const probeRows = Math.min(maxScanRows, dimensions.rowCount);
    const probeAddress = rangeAddress(dimensions.startRow, dimensions.startCol, probeRows, dimensions.colCount);
    const headerProbeMatrix = normalizeMatrix(readRangeValue(sheet.Range(probeAddress)));
    const headerResult = detectHeaderRow(headerProbeMatrix, requiredHeaders, {
      minMatchCount,
      maxScanRows,
      usedRangeStartRow: dimensions.startRow
    });
    if (!headerResult.ok) {
      throw new HeaderDetectionError(headerResult);
    }

    const plan = buildGroupedReadPlan(dimensions, headerResult.headerRowIndex, requiredHeaders, headerResult.columnIndex);
    const groupMatrices = readGroupedMatrices(sheet, plan);
    const matrix = stitchRequiredHeaderMatrix(plan, groupMatrices);
    if (matrix.length === 0 || !hasAnyNonBlankRow(matrix)) {
      throw new Error("分组读取范围没有可读取的数据");
    }

    return {
      matrix,
      usedRangeStartRow: plan.startRow,
      diagnostics: diagnosticsForGroupedPlan(plan, matrix)
    };
  } catch (groupedError) {
    const fallback = readUsedRangeMatrix(sheet);
    const result: OptimizedMatrixReadResult = {
      matrix: fallback.matrix,
      diagnostics: {
        strategy: "used_range_fallback",
        usedRangeAddress: dimensions?.address ?? "无确切信息",
        usedRangeRows: dimensions?.rowCount ?? fallback.matrix.length,
        usedRangeCols: dimensions?.colCount ?? matrixWidth(fallback.matrix),
        readRangeDescription: dimensions?.address ?? "UsedRange.Value2",
        readRows: fallback.matrix.length,
        readCols: matrixWidth(fallback.matrix),
        fallbackReason: errorMessage(groupedError)
      }
    };
    if (fallback.usedRangeStartRow !== undefined) {
      result.usedRangeStartRow = fallback.usedRangeStartRow;
    }
    return result;
  }
}

export function readSheetTableWithDiagnostics(
  sheet: WpsSheet,
  requiredHeaders: string[],
  minMatchCount: number,
  maxScanRows: number
): ParsedTableWithDiagnostics {
  const result = readSheetMatrixOptimized(sheet, requiredHeaders, minMatchCount, maxScanRows);
  return {
    table: parseTableFromMatrix(result.matrix, requiredHeaders, {
      minMatchCount,
      maxScanRows,
      usedRangeStartRow: result.usedRangeStartRow
    }),
    diagnostics: result.diagnostics
  };
}

export function readSheetTable(
  sheet: WpsSheet,
  requiredHeaders: string[],
  minMatchCount: number,
  maxScanRows: number
): ParsedTable {
  return readSheetTableWithDiagnostics(sheet, requiredHeaders, minMatchCount, maxScanRows).table;
}
