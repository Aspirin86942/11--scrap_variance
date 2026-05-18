import { SHEET_NAMES, WRITE_CHUNK_ROWS } from "../constants";
import { DEFAULT_QUERY_DIRECTION } from "../core/query-direction";
import type { ScrapVarianceGlobal, WpsSheet } from "../types/wps";
import { normalizeText } from "../utils/text";
import { ensureSheet } from "../wps-api/workbook";
import { writeMatrixBulkOrChunks } from "../wps-api/write-results";

const RUN_QUERY_FUNCTION_NAME = "runScrapVarianceQuery";

function readRangeText(sheet: WpsSheet, address: string): string {
  const range = sheet.Range(address);
  return normalizeText(range.Value2 ?? range.Value);
}

export function setupQueryPanel(root?: ScrapVarianceGlobal): WpsSheet {
  const sheet = ensureSheet(SHEET_NAMES.panel, root);

  writeMatrixBulkOrChunks(
    sheet,
    1,
    1,
    [
      ["报废差异查询"],
      ["公司简称"],
      ["一级部门"],
      ["二级部门"],
      ["开始日期"],
      ["结束日期"],
      ["查询方向"],
      ["运行函数"]
    ],
    WRITE_CHUNK_ROWS
  );

  const existingDirection = readRangeText(sheet, "B7");
  if (existingDirection === "" || existingDirection === RUN_QUERY_FUNCTION_NAME) {
    // 旧版面板把运行函数放在 B7；升级时需要把 B7 迁移为查询方向。
    writeMatrixBulkOrChunks(sheet, 7, 2, [[DEFAULT_QUERY_DIRECTION], [RUN_QUERY_FUNCTION_NAME]], WRITE_CHUNK_ROWS);
  } else {
    writeMatrixBulkOrChunks(sheet, 8, 2, [[RUN_QUERY_FUNCTION_NAME]], WRITE_CHUNK_ROWS);
  }

  return sheet;
}
