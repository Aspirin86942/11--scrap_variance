import { MAX_DIAGNOSTICS_CLEAR_ROW, MAX_OUTPUT_CLEAR_ROW, MAX_PRECHECK_CLEAR_ROW, WRITE_CHUNK_ROWS } from "../constants";
import type { OutputMatrix } from "../types/scrap";
import type { WpsRange, WpsSheet } from "../types/wps";

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} 必须是正整数。`);
  }
}

function columnName(columnIndex: number): string {
  assertPositiveInteger(columnIndex, "列号");

  let remaining = columnIndex;
  let name = "";
  while (remaining > 0) {
    const zeroBasedOffset = (remaining - 1) % 26;
    name = String.fromCharCode(65 + zeroBasedOffset) + name;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return name;
}

function normalizeChunkRows(chunkRows: number): number {
  if (Number.isFinite(chunkRows) && Number.isInteger(chunkRows) && chunkRows > 0) {
    return chunkRows;
  }
  return WRITE_CHUNK_ROWS;
}

function matrixWidth(values: OutputMatrix): number {
  return values.reduce((width, row) => Math.max(width, row.length), 0);
}

function assignRangeValue(range: WpsRange, value: OutputMatrix): void {
  range.Value2 = value;
}

export function clearRange(sheet: WpsSheet, address: string): void {
  const range = sheet.Range(address);
  if (typeof range.ClearContents !== "function") {
    throw new Error(`清空区域失败：${sheet.Name}!${address} 不支持 ClearContents。`);
  }
  range.ClearContents();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function rangeAddress(startRow: number, startCol: number, rowCount: number, colCount: number): string {
  assertPositiveInteger(startRow, "起始行号");
  assertPositiveInteger(startCol, "起始列号");
  assertPositiveInteger(rowCount, "行数");
  assertPositiveInteger(colCount, "列数");

  const endRow = startRow + rowCount - 1;
  const endCol = startCol + colCount - 1;
  return `${columnName(startCol)}${startRow}:${columnName(endCol)}${endRow}`;
}

export function writeMatrixBulkOrChunks(
  sheet: WpsSheet,
  startRow: number,
  startCol: number,
  values: OutputMatrix,
  chunkRows = WRITE_CHUNK_ROWS
): void {
  if (values.length === 0) {
    return;
  }

  const width = matrixWidth(values);
  if (width === 0) {
    return;
  }

  const address = rangeAddress(startRow, startCol, values.length, width);
  try {
    assignRangeValue(sheet.Range(address), values);
    return;
  } catch (fullWriteError) {
    const safeChunkRows = normalizeChunkRows(chunkRows);
    for (let rowOffset = 0; rowOffset < values.length; rowOffset += safeChunkRows) {
      const chunk = values.slice(rowOffset, rowOffset + safeChunkRows);
      const chunkWidth = matrixWidth(chunk);
      if (chunkWidth === 0) {
        continue;
      }
      const chunkAddress = rangeAddress(startRow + rowOffset, startCol, chunk.length, chunkWidth);
      try {
        assignRangeValue(sheet.Range(chunkAddress), chunk);
      } catch (chunkWriteError) {
        const chunkNumber = Math.floor(rowOffset / safeChunkRows) + 1;
        throw new Error(
          `整块写入失败：${address}；${errorMessage(fullWriteError)}。` +
            `分块写入失败：第 ${chunkNumber} 块 ${chunkAddress}；${errorMessage(chunkWriteError)}`
        );
      }
    }
  }
}

export function clearQueryOutput(sheet: WpsSheet): void {
  clearRange(sheet, `A9:S${MAX_OUTPUT_CLEAR_ROW}`);
}

export function clearPrecheckOutput(sheet: WpsSheet): void {
  clearRange(sheet, `A1:H${MAX_PRECHECK_CLEAR_ROW}`);
}

export function clearDiagnosticsOutput(sheet: WpsSheet): void {
  clearRange(sheet, `A1:G${MAX_DIAGNOSTICS_CLEAR_ROW}`);
}
