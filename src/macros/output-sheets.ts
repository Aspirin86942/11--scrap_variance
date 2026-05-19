import { SHEET_NAMES } from "../constants";
import type { ScrapVarianceGlobal, WpsSheet } from "../types/wps";
import { ensureSheet, findSheetByName } from "../wps-api/workbook";

export function setupOutputSheets(root?: ScrapVarianceGlobal): WpsSheet {
  let detailSheet = findSheetByName(SHEET_NAMES.detailOutput, root);

  if (!detailSheet) {
    const oldPanel = findSheetByName(SHEET_NAMES.panel, root);
    if (oldPanel) {
      // 旧工作簿可能仍有“查询面板”，直接改名成新版明细页，减少用户手动迁移。
      oldPanel.Name = SHEET_NAMES.detailOutput;
      detailSheet = oldPanel;
    } else {
      detailSheet = ensureSheet(SHEET_NAMES.detailOutput, root);
    }
  }

  // 三张输出页都确保存在，但查询时仍只刷新当前活动的那一张。
  ensureSheet(SHEET_NAMES.oaDocCompare, root);
  ensureSheet(SHEET_NAMES.erpDocCompare, root);

  return detailSheet;
}
