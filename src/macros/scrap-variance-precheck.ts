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
import { HeaderDetectionError } from "../core/header-detection";
import { buildHeaderDetectionIssue, buildPrecheckIssues, buildSystemErrorIssue, issueRowsToValues } from "../core/precheck";
import type { ParsedTable, PrecheckIssue } from "../types/scrap";
import type { ScrapVarianceGlobal } from "../types/wps";
import { readSheetTable } from "../wps-api/read-sheet-data";
import { ensureSheet, getSheetByName } from "../wps-api/workbook";
import { clearPrecheckOutput, writeMatrixBulkOrChunks } from "../wps-api/write-results";

function assertPrecheckOutputLimit(issueRowCount: number): void {
  const lastIssueRow = 4 + issueRowCount - 1;

  if (lastIssueRow > MAX_PRECHECK_CLEAR_ROW) {
    // 预验证结果超出固定清理范围时必须阻断，否则下次运行可能残留旧问题行。
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
  // 预验证页每次全量重写，保证用户看到的是本次源表状态，而不是旧结果叠加。
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

function readPrecheckTable(
  source: "OA" | "ERP",
  sheet: ReturnType<typeof getSheetByName>,
  requiredHeaders: string[],
  minMatchCount: number,
  headerIssues: PrecheckIssue[]
): ParsedTable | null {
  try {
    return readSheetTable(sheet, requiredHeaders, minMatchCount, MAX_HEADER_SCAN_ROWS);
  } catch (error) {
    if (error instanceof HeaderDetectionError) {
      // 表头识别失败仍要返回结构化问题，让用户知道该改哪些关键列。
      headerIssues.push(buildHeaderDetectionIssue(source, error.result));
      return null;
    }
    throw error;
  }
}

export function runScrapVariancePrecheck(root?: ScrapVarianceGlobal): void {
  let issues: PrecheckIssue[];

  try {
    const oaSheet = getSheetByName(SHEET_NAMES.oa, root);
    const erpSheet = getSheetByName(SHEET_NAMES.erp, root);
    const headerIssues: PrecheckIssue[] = [];
    const oaTable = readPrecheckTable(
      "OA",
      oaSheet,
      [...OA_REQUIRED_HEADERS],
      MIN_OA_HEADER_MATCH_COUNT,
      headerIssues
    );
    const erpTable = readPrecheckTable(
      "ERP",
      erpSheet,
      [...ERP_REQUIRED_HEADERS],
      MIN_ERP_HEADER_MATCH_COUNT,
      headerIssues
    );
    // 表头问题优先输出；只有两张表表头都可识别时，才继续做行级数据校验。
    issues = headerIssues.length > 0 ? headerIssues : buildPrecheckIssues(oaTable, erpTable);
  } catch (error) {
    issues = [buildSystemErrorIssue(error)];
  }

  writePrecheckResults(issues, root);
}
