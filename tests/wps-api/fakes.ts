import type { WpsApplication, WpsCellValue, WpsMatrix, WpsRange, WpsSheet, WpsSheets } from "../../src/types/wps";
import { normalizeMatrix } from "../../src/utils/matrix";

export interface RecordedWrite {
  address: string;
  value: unknown;
}

export interface FakeSheet extends WpsSheet {
  writes: RecordedWrite[];
  clears: string[];
  rowInserts: Array<{ afterRow: number; rowCount: number }>;
  rowDeletes: Array<{ startRow: number; rowCount: number }>;
  rangeValues: Map<string, unknown>;
  failReadAddresses: Set<string>;
  failWriteAddresses: Set<string>;
  failNextBulkWrite: boolean;
  usedRangeValue2ReadCount: number;
}

function isMatrix(value: unknown): value is unknown[][] {
  return Array.isArray(value) && value.every((row) => Array.isArray(row));
}

interface ParsedRangeAddress {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

interface ParsedRowRangeAddress {
  startRow: number;
  endRow: number;
}

function columnIndex(columnName: string): number {
  return [...columnName.toUpperCase()].reduce((result, char) => result * 26 + char.charCodeAt(0) - 64, 0);
}

function columnName(columnNumber: number): string {
  let remaining = columnNumber;
  let name = "";
  while (remaining > 0) {
    const zeroBasedOffset = (remaining - 1) % 26;
    name = String.fromCharCode(65 + zeroBasedOffset) + name;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return name;
}

function matrixWidth(values: WpsMatrix): number {
  return values.reduce((width, row) => Math.max(width, row.length), 0);
}

function usedRangeAddress(rowCount: number, colCount: number): string {
  if (rowCount <= 0 || colCount <= 0) {
    return "A1:A1";
  }
  return rangeAddressFromBounds(1, 1, rowCount, colCount);
}

function rangeAddressFromBounds(startRow: number, startCol: number, endRow: number, endCol: number): string {
  return `${columnName(startCol)}${startRow}:${columnName(endCol)}${endRow}`;
}

function parseCellAddress(address: string): { row: number; col: number } | null {
  const match = address.match(/^([A-Z]+)(\d+)$/i);
  if (!match) {
    return null;
  }
  return {
    row: Number(match[2]),
    col: columnIndex(match[1])
  };
}

function parseRangeAddress(address: string): ParsedRangeAddress | null {
  const parts = address.split(":");
  const start = parseCellAddress(parts[0] ?? "");
  const end = parseCellAddress(parts[1] ?? parts[0] ?? "");

  if (!start || !end) {
    return null;
  }
  return {
    startRow: Math.min(start.row, end.row),
    startCol: Math.min(start.col, end.col),
    endRow: Math.max(start.row, end.row),
    endCol: Math.max(start.col, end.col)
  };
}

function parseRowRangeAddress(address: string): ParsedRowRangeAddress | null {
  const match = address.match(/^(\d+):(\d+)$/);
  if (!match) {
    return null;
  }

  const startRow = Number(match[1]);
  const endRow = Number(match[2]);
  return {
    startRow: Math.min(startRow, endRow),
    endRow: Math.max(startRow, endRow)
  };
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

class FakeRangeValues extends Map<string, unknown> {
  private readonly cells = new Map<string, WpsCellValue>();

  override get(address: string): unknown {
    const parsed = parseRangeAddress(address);
    if (!parsed) {
      return super.get(address);
    }

    const rows: WpsMatrix = [];
    let hasCellValue = false;
    for (let row = parsed.startRow; row <= parsed.endRow; row += 1) {
      const rowValues: WpsCellValue[] = [];
      for (let col = parsed.startCol; col <= parsed.endCol; col += 1) {
        const key = cellKey(row, col);
        const value = this.cells.get(key);
        if (this.cells.has(key)) {
          hasCellValue = true;
        }
        rowValues.push(value);
      }
      rows.push(rowValues);
    }

    return hasCellValue ? rows : super.get(address);
  }

  override set(address: string, value: unknown): this {
    super.set(address, value);

    const parsed = parseRangeAddress(address);
    if (!parsed) {
      return this;
    }

    const matrix = normalizeMatrix(value);
    const rowCount = parsed.endRow - parsed.startRow + 1;
    const colCount = parsed.endCol - parsed.startCol + 1;
    for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
      for (let colOffset = 0; colOffset < colCount; colOffset += 1) {
        this.cells.set(
          cellKey(parsed.startRow + rowOffset, parsed.startCol + colOffset),
          matrix[rowOffset]?.[colOffset]
        );
      }
    }

    return this;
  }
}

function usedRangeBounds(range: WpsRange | undefined): ParsedRangeAddress | null {
  if (!range) {
    return null;
  }

  const rowCount = range.Rows?.Count;
  const colCount = range.Columns?.Count;
  if (rowCount === 0 || colCount === 0) {
    return null;
  }
  if (
    typeof range.Row === "number" &&
    typeof range.Column === "number" &&
    typeof rowCount === "number" &&
    typeof colCount === "number" &&
    rowCount > 0 &&
    colCount > 0
  ) {
    return {
      startRow: range.Row,
      startCol: range.Column,
      endRow: range.Row + rowCount - 1,
      endCol: range.Column + colCount - 1
    };
  }

  return typeof range.Address === "string" ? parseRangeAddress(range.Address) : null;
}

function updateUsedRangeMetadata(sheet: FakeSheet, writtenRange: ParsedRangeAddress): void {
  if (!sheet.UsedRange) {
    return;
  }

  const previousRange = usedRangeBounds(sheet.UsedRange);
  const nextRange = previousRange
    ? {
        startRow: Math.min(previousRange.startRow, writtenRange.startRow),
        startCol: Math.min(previousRange.startCol, writtenRange.startCol),
        endRow: Math.max(previousRange.endRow, writtenRange.endRow),
        endCol: Math.max(previousRange.endCol, writtenRange.endCol)
      }
    : writtenRange;

  sheet.UsedRange.Row = nextRange.startRow;
  sheet.UsedRange.Column = nextRange.startCol;
  sheet.UsedRange.Address = rangeAddressFromBounds(
    nextRange.startRow,
    nextRange.startCol,
    nextRange.endRow,
    nextRange.endCol
  );
  sheet.UsedRange.Rows = { Count: nextRange.endRow - nextRange.startRow + 1 };
  sheet.UsedRange.Columns = { Count: nextRange.endCol - nextRange.startCol + 1 };
}

export function createFakeSheet(name: string, usedRangeValue: unknown = []): FakeSheet {
  const usedRangeMatrix = normalizeMatrix(usedRangeValue);
  const usedRangeRows = usedRangeMatrix.length;
  const usedRangeCols = matrixWidth(usedRangeMatrix);
  const initialUsedRangeAddress = usedRangeAddress(usedRangeRows, usedRangeCols);

  const sheet: FakeSheet = {
    Name: name,
    UsedRange: {
      Value2: usedRangeValue,
      Row: 1,
      Column: 1,
      Address: initialUsedRangeAddress,
      Rows: { Count: usedRangeRows },
      Columns: { Count: usedRangeCols }
    },
    writes: [],
    clears: [],
    rowInserts: [],
    rowDeletes: [],
    rangeValues: new FakeRangeValues(),
    failReadAddresses: new Set<string>(),
    failWriteAddresses: new Set<string>(),
    failNextBulkWrite: false,
    usedRangeValue2ReadCount: 0,
    Range(address: string): WpsRange {
      const rowRange = parseRowRangeAddress(address);
      const rowCount = rowRange ? rowRange.endRow - rowRange.startRow + 1 : 0;
      const parsedRange = parseRangeAddress(address);
      const range: WpsRange = {
        Address: address,
        Row: parsedRange?.startRow,
        Column: parsedRange?.startCol,
        Rows: parsedRange ? { Count: parsedRange.endRow - parsedRange.startRow + 1 } : undefined,
        Columns: parsedRange ? { Count: parsedRange.endCol - parsedRange.startCol + 1 } : undefined,
        get Value(): unknown {
          if (sheet.failReadAddresses.has(address)) {
            throw new Error(`range read failed: ${address}`);
          }
          return sheet.rangeValues.get(address);
        },
        get Value2(): unknown {
          if (sheet.failReadAddresses.has(address)) {
            throw new Error(`range read failed: ${address}`);
          }
          return sheet.rangeValues.get(address);
        },
        ClearContents(): void {
          sheet.clears.push(address);
        },
        set Value2(value: unknown) {
          if (sheet.failNextBulkWrite && isMatrix(value)) {
            sheet.failNextBulkWrite = false;
            throw new Error("bulk write failed");
          }
          if (sheet.failWriteAddresses.has(address)) {
            throw new Error(`range write failed: ${address}`);
          }
          sheet.rangeValues.set(address, value);
          if (parsedRange) {
            updateUsedRangeMetadata(sheet, parsedRange);
          }
          sheet.writes.push({ address, value });
        }
      };

      if (rowRange) {
        range.EntireRow = {
          Insert(): void {
            sheet.rowInserts.push({ afterRow: rowRange.startRow - 1, rowCount });
          },
          Delete(): void {
            sheet.rowDeletes.push({ startRow: rowRange.startRow, rowCount });
          }
        };
      }

      return range;
    }
  };
  if (usedRangeRows > 0 && usedRangeCols > 0) {
    sheet.rangeValues.set(initialUsedRangeAddress, usedRangeMatrix);
  }
  Object.defineProperty(sheet.UsedRange, "Value2", {
    get() {
      sheet.usedRangeValue2ReadCount += 1;
      return usedRangeValue;
    },
    enumerable: true
  });
  return sheet;
}

export function createFakeApplication(initialSheets: FakeSheet[]): WpsApplication {
  const sheets = [...initialSheets];
  const collection: WpsSheets = {
    get Count(): number {
      return sheets.length;
    },
    Item(index: number): WpsSheet {
      return sheets[index - 1];
    },
    Add(): WpsSheet {
      const sheet = createFakeSheet(`Sheet${sheets.length + 1}`);
      sheets.push(sheet);
      return sheet;
    }
  };

  return {
    ActiveWorkbook: {
      Worksheets: collection
    }
  };
}

export function matrixRows(value: unknown): number {
  return Array.isArray(value) ? (value as WpsMatrix).length : 0;
}
