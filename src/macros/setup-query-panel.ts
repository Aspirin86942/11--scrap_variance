import { SHEET_NAMES, WRITE_CHUNK_ROWS } from "../constants";
import type { ScrapVarianceGlobal, WpsSheet } from "../types/wps";
import { ensureSheet } from "../wps-api/workbook";
import { writeMatrixBulkOrChunks } from "../wps-api/write-results";

export function setupQueryPanel(root?: ScrapVarianceGlobal): WpsSheet {
  const sheet = ensureSheet(SHEET_NAMES.panel, root);

  writeMatrixBulkOrChunks(
    sheet,
    1,
    1,
    [
      ["报废差异查询", ""],
      ["公司简称", ""],
      ["一级部门", ""],
      ["二级部门", ""],
      ["开始日期", ""],
      ["结束日期", ""],
      ["运行函数", "runScrapVarianceQuery"]
    ],
    WRITE_CHUNK_ROWS
  );

  return sheet;
}
