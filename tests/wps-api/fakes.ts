import type { WpsApplication, WpsCellValue, WpsMatrix, WpsRange, WpsSheet, WpsSheets } from "../../src/types/wps";
import { normalizeMatrix } from "../../src/utils/matrix";

export interface RecordedWrite {
  address: string;
  value: unknown;
}

export interface FakeSheet extends WpsSheet {
  writes: RecordedWrite[];
  clears: string[];
  rangeValues: Map<string, unknown>;
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

function columnIndex(columnName: string): number {
  return [...columnName.toUpperCase()].reduce((result, char) => result * 26 + char.charCodeAt(0) - 64, 0);
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

export function createFakeSheet(name: string, usedRangeValue: unknown = []): FakeSheet {
  const sheet: FakeSheet = {
    Name: name,
    UsedRange: {
      Value2: usedRangeValue,
      Row: 1
    },
    writes: [],
    clears: [],
    rangeValues: new FakeRangeValues(),
    failWriteAddresses: new Set<string>(),
    failNextBulkWrite: false,
    usedRangeValue2ReadCount: 0,
    Range(address: string): WpsRange {
      return {
        get Value(): unknown {
          return sheet.rangeValues.get(address);
        },
        get Value2(): unknown {
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
          sheet.writes.push({ address, value });
        }
      };
    }
  };
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
