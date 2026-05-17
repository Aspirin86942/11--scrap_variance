import {
  ERP_REQUIRED_HEADERS,
  MAX_HEADER_SCAN_ROWS,
  MAX_PRECHECK_CLEAR_ROW,
  MIN_ERP_HEADER_MATCH_COUNT,
  MIN_OA_HEADER_MATCH_COUNT,
  OA_REQUIRED_HEADERS,
  SHEET_NAMES,
  WRITE_CHUNK_ROWS
} from "../constants";
import { buildPrecheckIssues, buildSystemErrorIssue, issueRowsToValues } from "../core/precheck";
import type { PrecheckIssue } from "../types/scrap";
import type { ScrapVarianceGlobal } from "../types/wps";
import { readSheetTable } from "../wps-api/read-sheet-data";
import { ensureSheet, getSheetByName } from "../wps-api/workbook";
import { clearPrecheckOutput, writeMatrixBulkOrChunks } from "../wps-api/write-results";

function assertPrecheckOutputLimit(issueRowCount: number): void {
  const lastIssueRow = 4 + issueRowCount - 1;

  if (lastIssueRow > MAX_PRECHECK_CLEAR_ROW) {
    throw new Error(
      `预验证结果需要写到第 ${lastIssueRow} 行，超过当前清理上限 MAX_PRECHECK_CLEAR_ROW=${MAX_PRECHECK_CLEAR_ROW}。` +
        "请调整 MAX_PRECHECK_CLEAR_ROW 后重新运行。"
    );
  }
}

export function writePrecheckResults(issues: PrecheckIssue[], root?: ScrapVarianceGlobal): void {
  const sheet = ensureSheet(SHEET_NAMES.precheckResult, root);
  const status = issues.length === 0 ? "未发现预验证问题" : `发现 ${issues.length} 条预验证问题`;
  const issueValues = issueRowsToValues(issues);

  assertPrecheckOutputLimit(issueValues.length);
  clearPrecheckOutput(sheet);
  writeMatrixBulkOrChunks(
    sheet,
    1,
    1,
    [
      ["报废差异预验证", ""],
      ["状态", status]
    ],
    WRITE_CHUNK_ROWS
  );
  writeMatrixBulkOrChunks(sheet, 4, 1, issueValues, WRITE_CHUNK_ROWS);
}

export function runScrapVariancePrecheck(root?: ScrapVarianceGlobal): void {
  let issues: PrecheckIssue[];

  try {
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
    issues = buildPrecheckIssues(oaTable, erpTable);
  } catch (error) {
    issues = [buildSystemErrorIssue(error)];
  }

  writePrecheckResults(issues, root);
}
