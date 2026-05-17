import {
  ERP_REQUIRED_HEADERS,
  MAX_HEADER_SCAN_ROWS,
  MAX_OUTPUT_CLEAR_ROW,
  MIN_ERP_HEADER_MATCH_COUNT,
  MIN_OA_HEADER_MATCH_COUNT,
  OA_REQUIRED_HEADERS,
  SHEET_NAMES,
  WRITE_CHUNK_ROWS
} from "../constants";
import { buildErpOnlyRows, buildErpRowsForOa } from "../core/build-erp-rows";
import { buildOaRows, collectSelectedOaForms, parseFilters } from "../core/build-oa-rows";
import { detailRowsToValues, buildSummaryRows, summaryRowsToValues } from "../core/build-summary-rows";
import { compareRows } from "../core/compare-rows";
import type { QueryFilters } from "../types/scrap";
import type { ScrapVarianceGlobal, WpsCellValue, WpsRange } from "../types/wps";
import { normalizeMatrix } from "../utils/matrix";
import { normalizeText } from "../utils/text";
import { setupQueryPanel } from "./setup-query-panel";
import { readSheetTable } from "../wps-api/read-sheet-data";
import { getSheetByName } from "../wps-api/workbook";
import { clearQueryOutput, writeMatrixBulkOrChunks } from "../wps-api/write-results";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readRangeValue(range: WpsRange): unknown {
  if (range.Value2 !== undefined) {
    return range.Value2;
  }
  return range.Value;
}

function normalizePanelDateValue(value: WpsCellValue): WpsCellValue | string {
  if (value === null || value === undefined || value === 0 || normalizeText(value) === "") {
    return "";
  }
  return value;
}

function panelFilterValues(rawValue: unknown): WpsCellValue[] {
  return normalizeMatrix(rawValue)
    .flat()
    .slice(0, 5);
}

function readPanelFilters(panelRange: WpsRange): QueryFilters {
  const values = panelFilterValues(readRangeValue(panelRange));

  return parseFilters({
    company: values[0],
    dept1: values[1],
    dept2: values[2],
    startDate: normalizePanelDateValue(values[3]),
    endDate: normalizePanelDateValue(values[4])
  });
}

function assertQueryOutputLimit(summaryRowCount: number, detailRowCount: number): void {
  const plannedRows = 1 + summaryRowCount + 1 + detailRowCount;
  const lastOutputRow = 8 + plannedRows - 1;

  if (lastOutputRow > MAX_OUTPUT_CLEAR_ROW) {
    throw new Error(
      `查询结果需要写到第 ${lastOutputRow} 行，超过当前清理上限 MAX_OUTPUT_CLEAR_ROW=${MAX_OUTPUT_CLEAR_ROW}。` +
        "请调整 MAX_OUTPUT_CLEAR_ROW 后重新运行。"
    );
  }
}

export function safeWriteQueryError(message: string, root?: ScrapVarianceGlobal): void {
  try {
    const panel = setupQueryPanel(root);
    clearQueryOutput(panel);
    writeMatrixBulkOrChunks(panel, 8, 1, [["错误", message]], WRITE_CHUNK_ROWS);
  } catch (writeError) {
    throw new Error(`查询执行失败：${message}；错误信息写入也失败：${errorMessage(writeError)}`);
  }
}

export function runScrapVarianceQuery(root?: ScrapVarianceGlobal): void {
  try {
    const panel = setupQueryPanel(root);
    const filters = readPanelFilters(panel.Range("B2:B6"));
    const oaSheet = getSheetByName(SHEET_NAMES.oa, root);
    const erpSheet = getSheetByName(SHEET_NAMES.erp, root);
    const oaTable = readSheetTable(
      oaSheet,
      [...OA_REQUIRED_HEADERS],
      MIN_OA_HEADER_MATCH_COUNT,
      MAX_HEADER_SCAN_ROWS
    );
    const erpTable = readSheetTable(
      erpSheet,
      [...ERP_REQUIRED_HEADERS],
      MIN_ERP_HEADER_MATCH_COUNT,
      MAX_HEADER_SCAN_ROWS
    );
    const oaGroupedRows = buildOaRows(oaTable.rows, filters);
    const currentOaFormNumbers = collectSelectedOaForms(oaGroupedRows);
    const erpRowsForOa = buildErpRowsForOa(erpTable.rows, oaGroupedRows);
    const erpOnlyRows = buildErpOnlyRows(erpTable.rows, currentOaFormNumbers, filters);

    if (oaGroupedRows.size === 0 && erpOnlyRows.size === 0) {
      clearQueryOutput(panel);
      writeMatrixBulkOrChunks(panel, 8, 1, [["查询条件没有匹配到 OA 数据。"]], WRITE_CHUNK_ROWS);
      return;
    }

    const detailRows = compareRows(oaGroupedRows, erpRowsForOa, erpOnlyRows);
    const summaryRows = buildSummaryRows(detailRows);
    const summaryValues = summaryRowsToValues(summaryRows);
    const detailValues = detailRowsToValues(detailRows);
    assertQueryOutputLimit(summaryValues.length, detailValues.length);

    clearQueryOutput(panel);
    writeMatrixBulkOrChunks(panel, 8, 1, [["汇总差异"]], WRITE_CHUNK_ROWS);
    writeMatrixBulkOrChunks(panel, 9, 1, summaryValues, WRITE_CHUNK_ROWS);

    const detailTitleRow = 9 + summaryValues.length;
    writeMatrixBulkOrChunks(panel, detailTitleRow, 1, [["明细差异"]], WRITE_CHUNK_ROWS);
    writeMatrixBulkOrChunks(panel, detailTitleRow + 1, 1, detailValues, WRITE_CHUNK_ROWS);
  } catch (error) {
    safeWriteQueryError(errorMessage(error), root);
  }
}
