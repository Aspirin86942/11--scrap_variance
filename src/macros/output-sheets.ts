import { SHEET_NAMES } from "../constants";
import type { ScrapVarianceGlobal, WpsSheet } from "../types/wps";
import { ensureSheet, findSheetByName } from "../wps-api/workbook";

export function setupOutputSheets(root?: ScrapVarianceGlobal): WpsSheet {
  let detailSheet = findSheetByName(SHEET_NAMES.detailOutput, root);

  if (!detailSheet) {
    const oldPanel = findSheetByName(SHEET_NAMES.panel, root);
    if (oldPanel) {
      oldPanel.Name = SHEET_NAMES.detailOutput;
      detailSheet = oldPanel;
    } else {
      detailSheet = ensureSheet(SHEET_NAMES.detailOutput, root);
    }
  }

  ensureSheet(SHEET_NAMES.oaDocCompare, root);
  ensureSheet(SHEET_NAMES.erpDocCompare, root);

  return detailSheet;
}
