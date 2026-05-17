import type { ScrapVarianceGlobal, WpsApplication, WpsSheet, WpsSheets } from "../types/wps";

function isUsableSheets(value: WpsSheets | undefined): value is WpsSheets {
  return Boolean(value && typeof value.Count === "number" && typeof value.Item === "function");
}

export function getApplication(root: ScrapVarianceGlobal = globalThis as ScrapVarianceGlobal): WpsApplication {
  if (!root.Application) {
    throw new Error("当前环境没有 WPS Application 对象，请在 WPS JS 宏环境中运行。");
  }
  return root.Application;
}

export function getSheets(app: WpsApplication): WpsSheets {
  const activeWorkbook = app.ActiveWorkbook;
  const sheets = activeWorkbook?.Worksheets ?? activeWorkbook?.Sheets ?? app.Worksheets ?? app.Sheets;
  if (!isUsableSheets(sheets)) {
    throw new Error("当前 WPS Application 没有可用的工作簿或 Worksheets/Sheets 集合。");
  }
  return sheets;
}

export function findSheetByName(sheetName: string, root?: ScrapVarianceGlobal): WpsSheet | null {
  const app = getApplication(root);
  const sheets = getSheets(app);

  for (let index = 1; index <= sheets.Count; index += 1) {
    const sheet = sheets.Item(index);
    if (sheet?.Name === sheetName) {
      return sheet;
    }
  }
  return null;
}

export function getSheetByName(sheetName: string, root?: ScrapVarianceGlobal): WpsSheet {
  const sheet = findSheetByName(sheetName, root);
  if (!sheet) {
    throw new Error(`找不到工作表：${sheetName}`);
  }
  return sheet;
}

export function ensureSheet(sheetName: string, root?: ScrapVarianceGlobal): WpsSheet {
  const existingSheet = findSheetByName(sheetName, root);
  if (existingSheet) {
    return existingSheet;
  }

  const sheets = getSheets(getApplication(root));
  if (typeof sheets.Add !== "function") {
    throw new Error("当前工作簿不支持新增工作表。");
  }

  const sheet = sheets.Add();
  sheet.Name = sheetName;
  return sheet;
}
