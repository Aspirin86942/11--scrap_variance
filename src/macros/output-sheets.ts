import { SHEET_NAMES } from "../constants";
import type { ScrapVarianceGlobal, WpsSheet } from "../types/wps";
import { ensureSheet, findSheetByName } from "../wps-api/workbook";

export function setupOutputSheets(root?: ScrapVarianceGlobal): WpsSheet {
  let summarySheet = findSheetByName(SHEET_NAMES.varianceSummary, root);

  if (!summarySheet) {
    const oldDetail = findSheetByName(SHEET_NAMES.legacyDetailOutput, root);
    const oldPanel = findSheetByName(SHEET_NAMES.panel, root);
    const migrationSource = oldDetail ?? oldPanel;

    if (migrationSource) {
      // 旧工作簿可能仍有“报废差异明细”或更早的“查询面板”，直接改名成新版汇总页。
      migrationSource.Name = SHEET_NAMES.varianceSummary;
      summarySheet = migrationSource;
    } else {
      summarySheet = ensureSheet(SHEET_NAMES.varianceSummary, root);
    }
  }

  // 三张输出页都确保存在，但查询时仍只刷新当前活动的那一张。
  ensureSheet(SHEET_NAMES.oaDocCompare, root);
  ensureSheet(SHEET_NAMES.erpDocCompare, root);

  return summarySheet;
}
