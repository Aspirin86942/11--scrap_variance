import { SHEET_NAMES, WRITE_CHUNK_ROWS } from "../constants";
import { parseFilters } from "../core/build-oa-rows";
import { parseQueryDirection } from "../core/query-direction";
import type { PanelQueryInput, QueryFilters } from "../types/scrap";
import type { ScrapVarianceGlobal, WpsCellValue, WpsRange } from "../types/wps";
import { normalizeMatrix } from "../utils/matrix";
import { normalizeText } from "../utils/text";
import { runCurrentSheetQuery } from "./current-sheet-query";
import { setupQueryPanel } from "./setup-query-panel";
import { clearQueryOutput, writeMatrixBulkOrChunks } from "../wps-api/write-results";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readRangeValue(range: WpsRange): unknown {
  // 旧查询面板直接读 Range，仍优先 Value2，保持和源表读取路径一致。
  if (range.Value2 !== undefined) {
    return range.Value2;
  }
  return range.Value;
}

function normalizePanelDateValue(value: WpsCellValue): WpsCellValue | string {
  // 旧面板日期空白有时会读成 0，进入 parseFilters 前先统一为空字符串。
  if (value === null || value === undefined || value === 0 || normalizeText(value) === "") {
    return "";
  }
  return value;
}

function panelFilterValues(rawValue: unknown): WpsCellValue[] {
  // B2:B7 可能被 WPS 返回成二维矩阵，打平后只取旧面板约定的 6 个输入。
  return normalizeMatrix(rawValue)
    .flat()
    .slice(0, 6);
}

export function readPanelFilters(panelRange: WpsRange): QueryFilters {
  const values = panelFilterValues(readRangeValue(panelRange));

  return parseFilters({
    company: values[0],
    dept1: values[1],
    dept2: values[2],
    startDate: normalizePanelDateValue(values[3]),
    endDate: normalizePanelDateValue(values[4])
  });
}

export function readPanelQueryInput(panelRange: WpsRange): PanelQueryInput {
  const values = panelFilterValues(readRangeValue(panelRange));

  return {
    filters: parseFilters({
      company: values[0],
      dept1: values[1],
      dept2: values[2],
      startDate: normalizePanelDateValue(values[3]),
      endDate: normalizePanelDateValue(values[4])
    }),
    queryDirection: parseQueryDirection(values[5])
  };
}

export function safeWriteQueryError(message: string, root?: ScrapVarianceGlobal): void {
  try {
    const panel = setupQueryPanel(root);
    clearQueryOutput(panel);
    writeMatrixBulkOrChunks(panel, 9, 1, [["错误", message]], WRITE_CHUNK_ROWS);
  } catch (writeError) {
    throw new Error(`查询执行失败：${message}；错误信息写入也失败：${errorMessage(writeError)}`);
  }
}

function syncActivePanelInputToRibbonState(root?: ScrapVarianceGlobal): void {
  const app = root?.Application ?? (globalThis as ScrapVarianceGlobal).Application;
  const activeSheet = app?.ActiveSheet;
  if (!activeSheet || activeSheet.Name !== SHEET_NAMES.panel) {
    return;
  }

  // 兼容旧工作簿：如果用户仍在旧查询面板触发查询，就先把面板输入同步到新状态模型。
  const queryInput = readPanelQueryInput(activeSheet.Range("B2:B7"));
  const currentState = root?.ScrapVarianceRibbonState ?? {};
  const nextState = {
    ...currentState,
    ...queryInput.filters,
    queryDirection: queryInput.queryDirection
  };
  if (root) {
    root.ScrapVarianceRibbonState = nextState;
  } else {
    (globalThis as ScrapVarianceGlobal).ScrapVarianceRibbonState = nextState;
  }
}

export function runScrapVarianceQuery(root?: ScrapVarianceGlobal): void {
  syncActivePanelInputToRibbonState(root);
  runCurrentSheetQuery(root);
}
