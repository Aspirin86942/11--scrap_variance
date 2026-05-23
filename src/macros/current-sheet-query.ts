import {
  ERP_REQUIRED_HEADERS,
  MAX_HEADER_SCAN_ROWS,
  MIN_ERP_HEADER_MATCH_COUNT,
  MIN_OA_HEADER_MATCH_COUNT,
  OA_REQUIRED_HEADERS,
  SHEET_NAMES,
  WRITE_CHUNK_ROWS
} from "../constants";
import {
  buildErpDocCompare,
  buildMaterialRowsForDocSummary,
  buildOaDocCompare,
  docCompareRowsToValues
} from "../core/doc-compare";
import { parseFilters } from "../core/build-oa-rows";
import { DEFAULT_QUERY_DIRECTION, parseQueryDirection } from "../core/query-direction";
import { runOutputSheetQueryCore } from "../core/output-query-runner";
import { detectOutputSheetKind, unsupportedOutputSheetMessage } from "../core/output-sheets";
import { createMetricsRecorder } from "../perf/metrics";
import { getRibbonState } from "../ribbon/state";
import type { OutputMatrix, OutputSheetKind, QueryFilters, RawRow, RibbonQueryState } from "../types/scrap";
import type { ScrapVarianceGlobal, WpsSheet } from "../types/wps";
import { deleteRows, getActiveSheet, getSelectedRowNumber, insertRowsBelow } from "../wps-api/active-context";
import {
  adjustOutputMetadataRows,
  clearPreviousToolOutput,
  readOutputQueryState,
  saveOutputMetadata,
  saveOutputQueryState
} from "../wps-api/output-metadata";
import { readSheetTable } from "../wps-api/read-sheet-data";
import { getSheetByName } from "../wps-api/workbook";
import { rangeAddress, writeMatrixBulkOrChunks } from "../wps-api/write-results";
import { normalizeMatrix } from "../utils/matrix";
import { normalizeText } from "../utils/text";
import { setupOutputSheets } from "./output-sheets";

interface SourceRows {
  oaRows: RawRow[];
  erpRows: RawRow[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function matrixWidth(values: OutputMatrix): number {
  return values.reduce((width, row) => Math.max(width, row.length), 0);
}

function writeOutputWithMetadata(
  sheet: WpsSheet,
  kind: OutputSheetKind,
  values: OutputMatrix,
  queryState?: RibbonQueryState
): void {
  const width = matrixWidth(values);
  if (values.length === 0 || width === 0) {
    return;
  }

  const address = rangeAddress(1, 1, values.length, width);
  // 写完输出后立刻保存 metadata，后续清理和展开物料都依赖这块范围信息。
  writeMatrixBulkOrChunks(sheet, 1, 1, values, WRITE_CHUNK_ROWS);
  saveOutputMetadata(sheet, { kind, rangeAddress: address });
  if (queryState) {
    saveOutputQueryState(sheet, queryState);
  }
}

function readSourceRows(root?: ScrapVarianceGlobal): SourceRows {
  // 正式查询始终从两张源表读取最新数据，不复用旧输出页里的结果。
  const oaSheet = getSheetByName(SHEET_NAMES.oa, root);
  const erpSheet = getSheetByName(SHEET_NAMES.erp, root);
  const oaTable = readSheetTable(oaSheet, [...OA_REQUIRED_HEADERS], MIN_OA_HEADER_MATCH_COUNT, MAX_HEADER_SCAN_ROWS);
  const erpTable = readSheetTable(
    erpSheet,
    [...ERP_REQUIRED_HEADERS],
    MIN_ERP_HEADER_MATCH_COUNT,
    MAX_HEADER_SCAN_ROWS
  );

  return {
    oaRows: oaTable.rows,
    erpRows: erpTable.rows
  };
}

function queryStateFromRibbonForOutputKind(root: ScrapVarianceGlobal | undefined, kind: OutputSheetKind): RibbonQueryState {
  const state = (root ?? (globalThis as ScrapVarianceGlobal)).ScrapVarianceRibbonState ?? {};
  const filters = parseFilters({
    company: state.company,
    dept1: state.dept1,
    dept2: state.dept2,
    startDate: state.startDate,
    endDate: state.endDate
  });

  return {
    ...filters,
    // 单据对比页由当前工作表决定查询视角，旧状态里的方向脏值不应阻断查询。
    queryDirection: kind === "variance_summary" ? parseQueryDirection(state.queryDirection) : DEFAULT_QUERY_DIRECTION
  };
}

function safeWriteCurrentSheetError(
  sheet: WpsSheet,
  kind: OutputSheetKind,
  message: string,
  queryState?: RibbonQueryState
): void {
  try {
    // 查询失败也写回当前输出表，避免用户只看到旧结果而不知道本次执行失败。
    clearPreviousToolOutput(sheet, kind, kind === "variance_summary" ? ["legacy_detail"] : []);
    writeOutputWithMetadata(sheet, kind, [["错误", message]], queryState);
  } catch (writeError) {
    throw new Error(`查询执行失败：${message}；错误信息写入也失败：${errorMessage(writeError)}`);
  }
}

export function runCurrentSheetQuery(root?: ScrapVarianceGlobal): void {
  setupOutputSheets(root);

  const activeSheet = getActiveSheet(root);
  const kind = detectOutputSheetKind(activeSheet.Name);
  if (!kind) {
    throw new Error(unsupportedOutputSheetMessage());
  }

  try {
    // 旧入口没有显式传状态时，仍从功能区全局状态读取，保持兼容。
    runCurrentSheetQueryWithState(root, queryStateFromRibbonForOutputKind(root, kind));
  } catch (error) {
    safeWriteCurrentSheetError(activeSheet, kind, errorMessage(error));
  }
}

export function runCurrentSheetQueryWithState(root: ScrapVarianceGlobal | undefined, queryState: RibbonQueryState): void {
  setupOutputSheets(root);

  const activeSheet = getActiveSheet(root);
  const kind = detectOutputSheetKind(activeSheet.Name);
  if (!kind) {
    throw new Error(unsupportedOutputSheetMessage());
  }

  try {
    const { oaRows, erpRows } = readSourceRows(root);
    const result = runOutputSheetQueryCore({
      kind,
      oaRows,
      erpRows,
      queryState,
      metrics: createMetricsRecorder(root ?? globalThis)
    });

    clearPreviousToolOutput(activeSheet, kind, kind === "variance_summary" ? ["legacy_detail"] : []);
    // 成功或无结果都保存本次条件，下一次打开弹窗才能恢复当前输出页自己的状态。
    writeOutputWithMetadata(activeSheet, kind, result.values ?? [[result.noResultMessage ?? "查询条件没有匹配到数据。"]], queryState);
  } catch (error) {
    safeWriteCurrentSheetError(activeSheet, kind, errorMessage(error), queryState);
  }
}

function readOutputFilters(sheet: WpsSheet): QueryFilters {
  const savedState = readOutputQueryState(sheet);
  if (!savedState) {
    throw new Error("当前输出表缺少查询条件记录，请先在当前页重新执行查询。");
  }

  return parseFilters(savedState);
}

function readCellText(sheet: WpsSheet, row: number, column: string): string {
  const range = sheet.Range(`${column}${row}`);
  const matrix = normalizeMatrix(range.Value2 ?? range.Value);
  return normalizeText(matrix[0]?.[0]);
}

function countMaterialRowsBelow(sheet: WpsSheet, summaryRowNumber: number): number {
  let count = 0;
  // 物料行紧跟在汇总行下面，遇到第一行非“物料”就停止，避免扫描整张表。
  for (let row = summaryRowNumber + 1; row < summaryRowNumber + 100000; row += 1) {
    if (readCellText(sheet, row, "A") !== "物料") {
      break;
    }
    count += 1;
  }
  return count;
}

function readOutputRangeValues(sheet: WpsSheet, startRow: number, rowCount: number, columnCount: number): OutputMatrix {
  const address = rangeAddress(startRow, 1, rowCount, columnCount);
  const range = sheet.Range(address);
  return normalizeMatrix(range.Value2 ?? range.Value).map((row) =>
    row.slice(0, columnCount).map((cell) => (typeof cell === "number" ? cell : normalizeText(cell)))
  );
}

function rollbackInsertedRows(sheet: WpsSheet, startRow: number, rowCount: number, error: unknown): never {
  try {
    // 展开时如果写入或 metadata 更新失败，必须删掉刚插入的行，保持工作表可再次操作。
    deleteRows(sheet, startRow, rowCount);
  } catch (rollbackError) {
    throw new Error(`展开物料失败：${errorMessage(error)}；回滚插入行失败：${errorMessage(rollbackError)}`);
  }
  throw error;
}

function rollbackDeletedRows(
  sheet: WpsSheet,
  summaryRow: number,
  deletedValues: OutputMatrix,
  error: unknown
): never {
  try {
    // 收起时如果 metadata 更新失败，必须把已删除的物料行写回去，避免用户丢失当前展开内容。
    insertRowsBelow(sheet, summaryRow, deletedValues.length);
    writeMatrixBulkOrChunks(sheet, summaryRow + 1, 1, deletedValues, WRITE_CHUNK_ROWS);
  } catch (rollbackError) {
    throw new Error(`收起物料失败：${errorMessage(error)}；回滚删除行失败：${errorMessage(rollbackError)}`);
  }
  throw error;
}

export function toggleMaterialRows(root?: ScrapVarianceGlobal): void {
  const activeSheet = getActiveSheet(root);
  const kind = detectOutputSheetKind(activeSheet.Name);
  if (!kind) {
    throw new Error(unsupportedOutputSheetMessage());
  }
  if (kind === "variance_summary") {
    throw new Error("当前工作表不支持展开物料。");
  }

  const selectedRow = getSelectedRowNumber(root);
  // 展开/收起只对汇总行有意义，物料行本身不能再展开。
  if (readCellText(activeSheet, selectedRow, "A") !== "汇总") {
    throw new Error("请选中行类型为 汇总 的单据行。");
  }

  const existingMaterialRows = countMaterialRowsBelow(activeSheet, selectedRow);
  if (existingMaterialRows > 0) {
    // 已有物料行说明当前动作是收起；先保存被删内容，metadata 更新失败时可以回滚。
    const headerRow = docCompareRowsToValues(kind, [])[0] ?? [];
    const deletedValues = readOutputRangeValues(activeSheet, selectedRow + 1, existingMaterialRows, headerRow.length);
    deleteRows(activeSheet, selectedRow + 1, existingMaterialRows);
    try {
      adjustOutputMetadataRows(activeSheet, -existingMaterialRows);
    } catch (error) {
      rollbackDeletedRows(activeSheet, selectedRow, deletedValues, error);
    }
    return;
  }

  const filters = readOutputFilters(activeSheet);
  const { oaRows, erpRows } = readSourceRows(root);
  // 展开物料重新按当前输出表保存的条件构建结果，确保和汇总行同一查询上下文。
  const result = kind === "oa_doc_compare"
    ? buildOaDocCompare(oaRows, erpRows, filters)
    : buildErpDocCompare(oaRows, erpRows, filters);
  const selectedDocNumber = readCellText(activeSheet, selectedRow, "F");
  const summaryRow = result.summaryRows.find((row) => row.primaryDocNumber === selectedDocNumber);
  if (!summaryRow) {
    throw new Error(`找不到可展开的单据：${selectedDocNumber}`);
  }

  const materialRows = buildMaterialRowsForDocSummary(result, summaryRow);
  if (materialRows.length === 0) {
    throw new Error(`当前单据没有可展开物料：${selectedDocNumber}`);
  }

  const materialValues = docCompareRowsToValues(kind, materialRows).slice(1);
  insertRowsBelow(activeSheet, selectedRow, materialRows.length);
  try {
    // 插入行后批量写物料矩阵，再扩大 metadata 范围；任一步失败都回滚插入行。
    writeMatrixBulkOrChunks(activeSheet, selectedRow + 1, 1, materialValues, WRITE_CHUNK_ROWS);
    adjustOutputMetadataRows(activeSheet, materialRows.length);
  } catch (error) {
    rollbackInsertedRows(activeSheet, selectedRow + 1, materialRows.length, error);
  }
}
