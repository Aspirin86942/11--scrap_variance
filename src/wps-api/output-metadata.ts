import { parseQueryDirection } from "../core/query-direction";
import type { OutputSheetKind, RibbonQueryState } from "../types/scrap";
import type { WpsCellValue, WpsSheet } from "../types/wps";
import { normalizeDateKey } from "../utils/date";
import { normalizeMatrix } from "../utils/matrix";
import { clearRange, writeMatrixBulkOrChunks } from "./write-results";

const METADATA_START_ROW = 1;
const METADATA_START_COL = 80;
const METADATA_ADDRESS = "CB1:CC1";
const QUERY_STATE_ADDRESS = "CB2:CG2";
const QUERY_STATE_START_ROW = 2;
const QUERY_STATE_START_COL = 80;
const VALID_OUTPUT_KINDS = new Set<OutputSheetKind>(["legacy_detail", "oa_doc_compare", "erp_doc_compare"]);
const A1_RECTANGLE_ADDRESS_PATTERN = /^([A-Z]+)([1-9]\d*):([A-Z]+)([1-9]\d*)$/i;

// metadata 写在远离用户可见输出的隐藏列区域，用来记录本工具上次生成了哪块范围。
export interface OutputMetadata {
  kind: OutputSheetKind;
  rangeAddress: string;
}

function normalizeText(value: WpsCellValue): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function isOutputSheetKind(value: string): value is OutputSheetKind {
  return VALID_OUTPUT_KINDS.has(value as OutputSheetKind);
}

function columnIndex(columnName: string): number {
  return [...columnName.toUpperCase()].reduce((result, char) => result * 26 + char.charCodeAt(0) - 64, 0);
}

function isSafeA1RectangleAddress(value: string): boolean {
  // 只接受简单矩形 A1 地址，避免把异常字符串传给 Range 后误清用户数据。
  const match = value.match(A1_RECTANGLE_ADDRESS_PATTERN);
  if (!match) {
    return false;
  }

  const startCol = columnIndex(match[1] ?? "");
  const startRow = Number(match[2]);
  const endCol = columnIndex(match[3] ?? "");
  const endRow = Number(match[4]);
  return startCol <= endCol && startRow <= endRow;
}

function parseA1RectangleAddress(
  value: string
): { startColumn: string; startRow: number; endColumn: string; endRow: number } | null {
  if (!isSafeA1RectangleAddress(value)) {
    return null;
  }

  const match = value.match(A1_RECTANGLE_ADDRESS_PATTERN);
  if (!match) {
    return null;
  }

  return {
    startColumn: (match[1] ?? "").toUpperCase(),
    startRow: Number(match[2]),
    endColumn: (match[3] ?? "").toUpperCase(),
    endRow: Number(match[4])
  };
}

export function readOutputMetadata(sheet: WpsSheet): OutputMetadata | null {
  const range = sheet.Range(METADATA_ADDRESS);
  const matrix = normalizeMatrix(range.Value2 ?? range.Value);
  const kind = normalizeText(matrix[0]?.[0]);
  const rangeAddress = normalizeText(matrix[0]?.[1]);

  if (!isOutputSheetKind(kind) || !isSafeA1RectangleAddress(rangeAddress)) {
    // metadata 不可信时宁可不清理，也不能拿错误地址清空工作表。
    return null;
  }

  return { kind, rangeAddress };
}

export function saveOutputMetadata(sheet: WpsSheet, metadata: OutputMetadata): void {
  writeMatrixBulkOrChunks(sheet, METADATA_START_ROW, METADATA_START_COL, [[metadata.kind, metadata.rangeAddress]], 1);
}

export function saveOutputQueryState(sheet: WpsSheet, state: RibbonQueryState): void {
  // 每张输出表保存自己的上次查询条件，弹窗再次打开时只恢复当前页的条件。
  writeMatrixBulkOrChunks(
    sheet,
    QUERY_STATE_START_ROW,
    QUERY_STATE_START_COL,
    [[state.company, state.dept1, state.dept2, state.startDate, state.endDate, state.queryDirection]],
    1
  );
}

export function readOutputQueryState(sheet: WpsSheet): RibbonQueryState | null {
  const range = sheet.Range(QUERY_STATE_ADDRESS);
  const matrix = normalizeMatrix(range.Value2 ?? range.Value);
  const row = matrix[0] ?? [];

  if (row.length < 6) {
    return null;
  }

  try {
    // 读取时重新走日期和查询方向解析，防止隐藏状态被用户手改后污染下一次查询。
    return {
      company: normalizeText(row[0]),
      dept1: normalizeText(row[1]),
      dept2: normalizeText(row[2]),
      startDate: normalizeDateKey(row[3]),
      endDate: normalizeDateKey(row[4]),
      queryDirection: parseQueryDirection(row[5])
    };
  } catch {
    return null;
  }
}

export function clearPreviousToolOutput(sheet: WpsSheet, expectedKind: OutputSheetKind): void {
  const metadata = readOutputMetadata(sheet);
  if (!metadata || metadata.kind !== expectedKind) {
    return;
  }

  // 只清理上次由本工具记录的输出范围，避免误删用户在同一工作表上的其他内容。
  clearRange(sheet, metadata.rangeAddress);
}

export function adjustOutputMetadataRows(sheet: WpsSheet, rowDelta: number): void {
  const metadata = readOutputMetadata(sheet);
  if (!metadata || rowDelta === 0) {
    return;
  }

  const parsed = parseA1RectangleAddress(metadata.rangeAddress);
  if (!parsed) {
    return;
  }

  const nextEndRow = Math.max(parsed.startRow, parsed.endRow + rowDelta);
  // 展开或收起物料会改变工具输出范围，metadata 要同步调整，下一次清理才准确。
  saveOutputMetadata(sheet, {
    kind: metadata.kind,
    rangeAddress: `${parsed.startColumn}${parsed.startRow}:${parsed.endColumn}${nextEndRow}`
  });
}
