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

  // WPS Range 地址使用 Excel 列名，这里把 1-based 列号转换成 A、Z、AA 这类名称。
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

function rectangularizeMatrix(values: OutputMatrix, width: number): OutputMatrix {
  // WPS 整块写入要求矩阵是矩形，短行需要补空字符串，否则 Range.Value2 可能写入失败。
  return values.map((row) => {
    if (row.length >= width) {
      return row;
    }
    return [...row, ...Array<string>(width - row.length).fill("")];
  });
}

function assignRangeValue(range: WpsRange, value: OutputMatrix): void {
  range.Value2 = value;
}

export function clearRange(sheet: WpsSheet, address: string): void {
  const range = sheet.Range(address);
  if (typeof range.ClearContents !== "function") {
    // 清理失败必须显式报错，否则旧输出和新输出混在一起会误导用户。
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

  const rectangularValues = rectangularizeMatrix(values, width);
  const address = rangeAddress(startRow, startCol, values.length, width);
  try {
    // 写表必须优先整块 Range 写入，避免逐格写入在 WPS 大表里变成主要性能瓶颈。
    assignRangeValue(sheet.Range(address), rectangularValues);
    return;
  } catch (fullWriteError) {
    // 整块写失败时按行分块重试，保留批量写的性能，同时提高 WPS 宿主兼容性。
    const safeChunkRows = normalizeChunkRows(chunkRows);
    for (let rowOffset = 0; rowOffset < rectangularValues.length; rowOffset += safeChunkRows) {
      const chunk = rectangularValues.slice(rowOffset, rowOffset + safeChunkRows);
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
