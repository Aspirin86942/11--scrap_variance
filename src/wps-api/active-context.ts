import type { ScrapVarianceGlobal, WpsSheet } from "../types/wps";
import { getApplication } from "./workbook";

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} 必须是正整数。`);
  }
}

export function getActiveSheet(root?: ScrapVarianceGlobal): WpsSheet {
  const app = getApplication(root);
  if (!app.ActiveSheet) {
    // 当前页查询和展开物料都依赖活动工作表，缺失时不能猜测目标页。
    throw new Error("当前 WPS Application 没有 ActiveSheet，无法识别当前工作表。");
  }
  return app.ActiveSheet;
}

export function getSelectedRowNumber(root?: ScrapVarianceGlobal): number {
  const row = getApplication(root).Selection?.Row;
  if (typeof row !== "number" || !Number.isInteger(row) || row <= 0) {
    // 展开/收起物料必须定位到用户当前选中的汇总行，选区不合法时直接阻断。
    throw new Error("当前选区无法识别为有效单据行。");
  }
  return row;
}

export function insertRowsBelow(sheet: WpsSheet, afterRow: number, rowCount: number): void {
  assertPositiveInteger(afterRow, "插入位置行号");
  assertPositiveInteger(rowCount, "插入行数");

  const range = sheet.Range(`${afterRow + 1}:${afterRow + rowCount}`);
  // 不同 WPS 版本可能支持 EntireRow.Insert 或 Range.Insert，按可用接口逐级尝试。
  if (typeof range.EntireRow?.Insert === "function") {
    range.EntireRow.Insert();
    return;
  }
  if (typeof range.Insert === "function") {
    range.Insert();
    return;
  }

  throw new Error("当前 WPS Range 不支持插入行。");
}

export function deleteRows(sheet: WpsSheet, startRow: number, rowCount: number): void {
  assertPositiveInteger(startRow, "删除起始行号");
  assertPositiveInteger(rowCount, "删除行数");

  const range = sheet.Range(`${startRow}:${startRow + rowCount - 1}`);
  // 删除整行也按 WPS 可用接口兜底，避免只适配某一个宿主版本。
  if (typeof range.EntireRow?.Delete === "function") {
    range.EntireRow.Delete();
    return;
  }
  if (typeof range.Delete === "function") {
    range.Delete();
    return;
  }

  throw new Error("当前 WPS Range 不支持删除行。");
}
