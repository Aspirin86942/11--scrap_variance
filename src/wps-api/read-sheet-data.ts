import { HeaderDetectionError, detectHeaderRow } from "../core/header-detection";
import { parseTableFromMatrix } from "../core/table-parser";
import type { ParsedTable } from "../types/scrap";
import type { WpsMatrix, WpsRange, WpsSheet } from "../types/wps";
import { hasAnyNonBlankRow, normalizeMatrix } from "../utils/matrix";
import { rangeAddress } from "./write-results";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type SheetReadStrategy = "narrow_rectangle" | "grouped_columns" | "used_range_fallback";

export interface SheetReadDiagnostics {
  strategy: SheetReadStrategy;
  usedRangeAddress: string;
  usedRangeRows: number;
  usedRangeCols: number;
  readRangeDescription: string;
  readRows: number;
  readCols: number;
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

interface ReadPlan {
  strategy: Exclude<SheetReadStrategy, "used_range_fallback">;
  startRow: number;
  rowCount: number;
  groups: ColumnGroup[];
  usedRange: RangeDimensions;
  description: string;
  readCols: number;
}

const RECTANGLE_SPAN_MULTIPLIER = 2;
const MAX_GROUPED_RANGES = 4;

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

function compactColumnsFromHeader(
  requiredHeaders: string[],
  columnIndex: Record<string, number>,
  usedRangeStartCol: number
): number[] {
  const columns = requiredHeaders.map((header) => columnIndex[header]).filter((index) => typeof index === "number");
  return [...new Set(columns.map((index) => usedRangeStartCol + index))].sort((left, right) => left - right);
}

function buildReadPlan(usedRange: RangeDimensions, headerRowOffset: number, requiredColumns: number[]): ReadPlan {
  const startRow = usedRange.startRow + headerRowOffset;
  const rowCount = usedRange.rowCount - headerRowOffset;
  const minCol = Math.min(...requiredColumns);
  const maxCol = Math.max(...requiredColumns);
  const span = maxCol - minCol + 1;
  const compactGroups = contiguousGroups(requiredColumns);
  const useGrouped = span > requiredColumns.length * RECTANGLE_SPAN_MULTIPLIER && compactGroups.length <= MAX_GROUPED_RANGES;
  const groups = useGrouped ? compactGroups : [{ startCol: minCol, endCol: maxCol }];
  const strategy = useGrouped ? "grouped_columns" : "narrow_rectangle";
  return {
    strategy,
    startRow,
    rowCount,
    groups,
    usedRange,
    description: describeGroups(groups, startRow, rowCount),
    readCols: useGrouped ? requiredColumns.length : span
  };
}

function readRectangleMatrix(sheet: WpsSheet, group: ColumnGroup, startRow: number, rowCount: number): WpsMatrix {
  const address = rangeAddress(startRow, group.startCol, rowCount, group.endCol - group.startCol + 1);
  return normalizeMatrix(readRangeValue(sheet.Range(address)));
}

function readPlannedMatrix(sheet: WpsSheet, plan: ReadPlan): WpsMatrix {
  const matrices = plan.groups.map((group) => readRectangleMatrix(sheet, group, plan.startRow, plan.rowCount));
  if (matrices.length === 1) {
    return matrices[0] ?? [];
  }

  const result: WpsMatrix = [];
  for (let rowIndex = 0; rowIndex < plan.rowCount; rowIndex += 1) {
    const row = [];
    for (const matrix of matrices) {
      row.push(...(matrix[rowIndex] ?? []));
    }
    result.push(row);
  }
  return result;
}

function diagnosticsForPlan(plan: ReadPlan, matrix: WpsMatrix): SheetReadDiagnostics {
  return {
    strategy: plan.strategy,
    usedRangeAddress: plan.usedRange.address,
    usedRangeRows: plan.usedRange.rowCount,
    usedRangeCols: plan.usedRange.colCount,
    readRangeDescription: plan.description,
    readRows: matrix.length,
    readCols: matrixWidth(matrix)
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

    const requiredColumns = compactColumnsFromHeader(requiredHeaders, headerResult.columnIndex, dimensions.startCol);
    const plan = buildReadPlan(dimensions, headerResult.headerRowIndex, requiredColumns);
    const matrix = readPlannedMatrix(sheet, plan);
    if (matrix.length === 0 || !hasAnyNonBlankRow(matrix)) {
      throw new Error("窄读范围没有可读取的数据");
    }

    return {
      matrix,
      usedRangeStartRow: plan.startRow,
      diagnostics: diagnosticsForPlan(plan, matrix)
    };
  } catch (narrowError) {
    const fallback = readUsedRangeMatrix(sheet);
    const result: OptimizedMatrixReadResult = {
      matrix: fallback.matrix,
      diagnostics: {
        strategy: "used_range_fallback",
        usedRangeAddress: dimensions?.address ?? "无确切信息",
        usedRangeRows: fallback.matrix.length,
        usedRangeCols: matrixWidth(fallback.matrix),
        readRangeDescription: dimensions?.address ?? "UsedRange.Value2",
        readRows: fallback.matrix.length,
        readCols: matrixWidth(fallback.matrix),
        fallbackReason: errorMessage(narrowError)
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
