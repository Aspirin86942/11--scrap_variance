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
import { detectOutputSheetKind, unsupportedOutputSheetMessage } from "../core/output-sheets";
import { QUERY_DIRECTIONS } from "../core/query-direction";
import { runQueryCorePipeline } from "../core/query-pipeline";
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
  writeMatrixBulkOrChunks(sheet, 1, 1, values, WRITE_CHUNK_ROWS);
  saveOutputMetadata(sheet, { kind, rangeAddress: address });
  if (queryState) {
    saveOutputQueryState(sheet, queryState);
  }
}

function readSourceRows(root?: ScrapVarianceGlobal): SourceRows {
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

function buildLegacyDetailValues(
  oaRows: RawRow[],
  erpRows: RawRow[],
  filters: QueryFilters,
  queryDirection: RibbonQueryState["queryDirection"]
):
  | { values: OutputMatrix; noResultMessage: null }
  | { values: null; noResultMessage: string } {
  const pipeline = runQueryCorePipeline(oaRows, erpRows, filters, undefined, queryDirection);

  if (pipeline.detailRows.length === 0) {
    return {
      values: null,
      noResultMessage:
        pipeline.queryDirection === QUERY_DIRECTIONS.erpSourceToOa
          ? "查询条件没有匹配到 ERP 数据。"
          : "查询条件没有匹配到 OA 数据。"
    };
  }

  return {
    values: [["汇总差异"], ...pipeline.summaryValues, ["明细差异"], ...pipeline.detailValues],
    noResultMessage: null
  };
}

function buildOaDocCompareValues(oaRows: RawRow[], erpRows: RawRow[], filters: QueryFilters):
  | { values: OutputMatrix; noResultMessage: null }
  | { values: null; noResultMessage: string } {
  const result = buildOaDocCompare(oaRows, erpRows, filters);
  if (result.summaryRows.length === 0) {
    return {
      values: null,
      noResultMessage: "查询条件没有匹配到 OA 数据。"
    };
  }

  return {
    values: docCompareRowsToValues("oa_doc_compare", result.summaryRows),
    noResultMessage: null
  };
}

function buildErpDocCompareValues(oaRows: RawRow[], erpRows: RawRow[], filters: QueryFilters):
  | { values: OutputMatrix; noResultMessage: null }
  | { values: null; noResultMessage: string } {
  const result = buildErpDocCompare(oaRows, erpRows, filters);
  if (result.summaryRows.length === 0) {
    return {
      values: null,
      noResultMessage: "查询条件没有匹配到 ERP 数据。"
    };
  }

  return {
    values: docCompareRowsToValues("erp_doc_compare", result.summaryRows),
    noResultMessage: null
  };
}

function safeWriteCurrentSheetError(
  sheet: WpsSheet,
  kind: OutputSheetKind,
  message: string,
  queryState?: RibbonQueryState
): void {
  try {
    clearPreviousToolOutput(sheet, kind);
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
    runCurrentSheetQueryWithState(root, getRibbonState(root));
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
    const filters = parseFilters(queryState);
    const { oaRows, erpRows } = readSourceRows(root);
    const result =
      kind === "legacy_detail"
        ? buildLegacyDetailValues(oaRows, erpRows, filters, queryState.queryDirection)
        : kind === "oa_doc_compare"
          ? buildOaDocCompareValues(oaRows, erpRows, filters)
          : buildErpDocCompareValues(oaRows, erpRows, filters);

    clearPreviousToolOutput(activeSheet, kind);
    writeOutputWithMetadata(activeSheet, kind, result.values ?? [[result.noResultMessage]], queryState);
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
  if (kind === "legacy_detail") {
    throw new Error("当前工作表不支持展开物料。");
  }

  const selectedRow = getSelectedRowNumber(root);
  if (readCellText(activeSheet, selectedRow, "A") !== "汇总") {
    throw new Error("请选中行类型为 汇总 的单据行。");
  }

  const existingMaterialRows = countMaterialRowsBelow(activeSheet, selectedRow);
  if (existingMaterialRows > 0) {
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
    writeMatrixBulkOrChunks(activeSheet, selectedRow + 1, 1, materialValues, WRITE_CHUNK_ROWS);
    adjustOutputMetadataRows(activeSheet, materialRows.length);
  } catch (error) {
    rollbackInsertedRows(activeSheet, selectedRow + 1, materialRows.length, error);
  }
}
