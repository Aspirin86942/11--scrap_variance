import { SHEET_NAMES, WRITE_CHUNK_ROWS } from "../constants";
import { DEFAULT_QUERY_DIRECTION } from "../core/query-direction";
import type { ScrapVarianceGlobal, WpsSheet } from "../types/wps";
import { normalizeText } from "../utils/text";
import { ensureSheet } from "../wps-api/workbook";
import { writeMatrixBulkOrChunks } from "../wps-api/write-results";

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

  if (readRangeText(sheet, "B7") === "") {
    writeMatrixBulkOrChunks(sheet, 7, 2, [[DEFAULT_QUERY_DIRECTION], ["runScrapVarianceQuery"]], WRITE_CHUNK_ROWS);
  } else {
    writeMatrixBulkOrChunks(sheet, 8, 2, [["runScrapVarianceQuery"]], WRITE_CHUNK_ROWS);
  }

  return sheet;
}
