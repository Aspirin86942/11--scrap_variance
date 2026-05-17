import type { WpsApplication, WpsMatrix, WpsRange, WpsSheet, WpsSheets } from "../../src/types/wps";

export interface RecordedWrite {
  address: string;
  value: unknown;
}

export interface FakeSheet extends WpsSheet {
  writes: RecordedWrite[];
  clears: string[];
  failWriteAddresses: Set<string>;
  failNextBulkWrite: boolean;
  usedRangeValue2ReadCount: number;
}

function isMatrix(value: unknown): value is unknown[][] {
  return Array.isArray(value) && value.every((row) => Array.isArray(row));
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
    failWriteAddresses: new Set<string>(),
    failNextBulkWrite: false,
    usedRangeValue2ReadCount: 0,
    Range(address: string): WpsRange {
      return {
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
