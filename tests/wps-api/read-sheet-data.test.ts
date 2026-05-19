import { describe, expect, it } from "vitest";
import { OA_REQUIRED_HEADERS } from "../../src/constants";
import { HeaderDetectionError } from "../../src/core/header-detection";
import { readSheetTableWithDiagnostics, readUsedRangeMatrix } from "../../src/wps-api/read-sheet-data";
import { createFakeSheet } from "./fakes";

function rowWith(columns: Record<number, string | number>): Array<string | number> {
  const width = Math.max(...Object.keys(columns).map(Number));
  return Array.from({ length: width }, (_, index) => columns[index + 1] ?? "");
}

function scatteredOaHeaderRow(): Array<string | number> {
  return rowWith({
    1: "表单编号",
    2: "金蝶云单据编号",
    3: "申请日期",
    13: "公司简称",
    14: "一级部门",
    15: "二级部门",
    26: "物料代码",
    27: "物料名称",
    28: "数量",
    29: "实际预算金额mx"
  });
}

function scatteredOaDataRow(): Array<string | number> {
  return rowWith({
    1: "F1",
    2: "OUT1",
    3: "2026/5/1",
    13: "数控",
    14: "生产",
    15: "仓储",
    26: "MAT-A",
    27: "物料A",
    28: 1,
    29: 10
  });
}

describe("optimized WPS source reads", () => {
  it("reads a compact rectangle without touching full UsedRange.Value2", () => {
    const sheet = createFakeSheet("OA", [
      [...OA_REQUIRED_HEADERS],
      ["F1", "OUT1", "2026/5/1", "数控", "生产", "仓储", "MAT-A", "物料A", 1, 10]
    ]);

    const result = readSheetTableWithDiagnostics(sheet, [...OA_REQUIRED_HEADERS], 5, 20);

    expect(result.table.rows).toHaveLength(1);
    expect(result.table.rows[0]?.["表单编号"]).toBe("F1");
    expect(result.diagnostics.strategy).toBe("narrow_rectangle");
    expect(result.diagnostics.usedRangeAddress).toBe("A1:J2");
    expect(result.diagnostics.readRangeDescription).toBe("A1:J2");
    expect(result.diagnostics.readRows).toBe(2);
    expect(result.diagnostics.readCols).toBe(10);
    expect(sheet.usedRangeValue2ReadCount).toBe(0);
  });

  it("preserves worksheet row numbers when the header is below leading rows", () => {
    const sheet = createFakeSheet("OA", [
      ["导出条件"],
      ["制表人"],
      [...OA_REQUIRED_HEADERS],
      ["F1", "OUT1", "2026/5/1", "数控", "生产", "仓储", "MAT-A", "物料A", 1, 10]
    ]);

    const result = readSheetTableWithDiagnostics(sheet, [...OA_REQUIRED_HEADERS], 5, 20);

    expect(result.table.headerRowNumber).toBe(3);
    expect(result.table.rows[0]?._rowNumber).toBe(4);
    expect(result.diagnostics.readRangeDescription).toBe("A3:J4");
    expect(result.diagnostics.readRows).toBe(2);
    expect(sheet.usedRangeValue2ReadCount).toBe(0);
  });

  it("keeps absolute worksheet coordinates when UsedRange does not start at A1", () => {
    const usedRangeMatrix = [
      rowWith({ 1: "导出条件" }),
      [...OA_REQUIRED_HEADERS],
      ["F1", "OUT1", "2026/5/1", "数控", "生产", "仓储", "MAT-A", "物料A", 1, 10]
    ];
    const sheet = createFakeSheet("OA", []);
    const usedRange = sheet.UsedRange;
    if (!usedRange) {
      throw new Error("missing fake UsedRange");
    }
    usedRange.Row = 5;
    usedRange.Column = 3;
    usedRange.Address = "C5:L7";
    usedRange.Rows = { Count: 3 };
    usedRange.Columns = { Count: 10 };
    sheet.rangeValues.set("C5:L7", usedRangeMatrix);

    const result = readSheetTableWithDiagnostics(sheet, [...OA_REQUIRED_HEADERS], 5, 20);

    expect(result.table.headerRowNumber).toBe(6);
    expect(result.table.rows[0]?._rowNumber).toBe(7);
    expect(result.table.rows[0]?.["表单编号"]).toBe("F1");
    expect(result.diagnostics.usedRangeAddress).toBe("C5:L7");
    expect(result.diagnostics.readRangeDescription).toBe("C6:L7");
    expect(sheet.rangeReads).toEqual(["C5:L7", "C6:L7"]);
    expect(sheet.usedRangeValue2ReadCount).toBe(0);
  });

  it("uses grouped_ranges as the primary strategy when ten required fields are isolated", () => {
    const requiredHeaders = ["F01", "F02", "F03", "F04", "F05", "F06", "F07", "F08", "F09", "F10"];
    const sheet = createFakeSheet("DATA", [
      rowWith({
        1: "F01",
        3: "F02",
        5: "F03",
        7: "F04",
        9: "F05",
        11: "F06",
        13: "F07",
        15: "F08",
        17: "F09",
        19: "F10"
      }),
      rowWith({
        1: "v01",
        3: "v02",
        5: "v03",
        7: "v04",
        9: "v05",
        11: "v06",
        13: "v07",
        15: "v08",
        17: "v09",
        19: "v10"
      })
    ]);

    const result = readSheetTableWithDiagnostics(sheet, requiredHeaders, 5, 20);

    expect(result.diagnostics.strategy).toBe("grouped_ranges");
    expect(result.diagnostics.groupCount).toBe(10);
    expect(result.diagnostics.readRows).toBe(2);
    expect(result.diagnostics.readCols).toBe(10);
    expect(result.diagnostics.readRangeDescription).toBe(
      "A1:A2,C1:C2,E1:E2,G1:G2,I1:I2,K1:K2,M1:M2,O1:O2,Q1:Q2,S1:S2"
    );
    expect(result.table.matrix[0]).toEqual(requiredHeaders);
    expect(result.table.matrix[1]).toEqual(["v01", "v02", "v03", "v04", "v05", "v06", "v07", "v08", "v09", "v10"]);
    expect(sheet.rangeReads).toEqual([
      "A1:S2",
      "A1:A2",
      "C1:C2",
      "E1:E2",
      "G1:G2",
      "I1:I2",
      "K1:K2",
      "M1:M2",
      "O1:O2",
      "Q1:Q2",
      "S1:S2"
    ]);
    expect(sheet.usedRangeValue2ReadCount).toBe(0);
  });

  it("stitches grouped range values in required header order instead of worksheet column order", () => {
    const requiredHeaders = ["C字段", "A字段", "B字段"];
    const sheet = createFakeSheet("DATA", [
      rowWith({
        1: "A字段",
        2: "B字段",
        5: "C字段"
      }),
      rowWith({
        1: "A1",
        2: "B1",
        5: "C1"
      })
    ]);

    const result = readSheetTableWithDiagnostics(sheet, requiredHeaders, 2, 20);

    expect(result.diagnostics.strategy).toBe("grouped_ranges");
    expect(result.diagnostics.groupCount).toBe(2);
    expect(result.diagnostics.readRangeDescription).toBe("A1:B2,E1:E2");
    expect(result.table.headers).toEqual(requiredHeaders);
    expect(result.table.matrix[0]).toEqual(requiredHeaders);
    expect(result.table.matrix[1]).toEqual(["C1", "A1", "B1"]);
    expect(result.table.rows[0]?.["C字段"]).toBe("C1");
    expect(result.table.rows[0]?.["A字段"]).toBe("A1");
    expect(result.table.rows[0]?.["B字段"]).toBe("B1");
    expect(sheet.rangeReads).toEqual(["A1:E2", "A1:B2", "E1:E2"]);
    expect(sheet.usedRangeValue2ReadCount).toBe(0);
  });

  it("uses grouped column reads when required headers are scattered", () => {
    const sheet = createFakeSheet("OA", [scatteredOaHeaderRow(), scatteredOaDataRow()]);

    const result = readSheetTableWithDiagnostics(sheet, [...OA_REQUIRED_HEADERS], 5, 20);

    expect(result.diagnostics.strategy).toBe("grouped_columns");
    expect(result.diagnostics.usedRangeAddress).toBe("A1:AC2");
    expect(result.diagnostics.readRangeDescription).not.toBe(result.diagnostics.usedRangeAddress);
    expect(result.diagnostics.readRangeDescription).toContain("A1");
    expect(result.diagnostics.readRangeDescription).toContain("AC2");
    expect(result.diagnostics.readCols).toBe(10);
    expect(result.table.rows[0]?.["公司简称"]).toBe("数控");
    expect(result.table.rows[0]?.["实际预算金额mx"]).toBe(10);
    expect(sheet.usedRangeValue2ReadCount).toBe(0);
  });

  it("falls back to full UsedRange when the narrow read fails", () => {
    const sheet = createFakeSheet("OA", [
      [...OA_REQUIRED_HEADERS],
      ["F1", "OUT1", "2026/5/1", "数控", "生产", "仓储", "MAT-A", "物料A", 1, 10]
    ]);
    sheet.failReadAddresses.add("A1:J2");

    const result = readSheetTableWithDiagnostics(sheet, [...OA_REQUIRED_HEADERS], 5, 20);

    expect(result.diagnostics.strategy).toBe("used_range_fallback");
    expect(result.diagnostics.fallbackReason).toEqual(expect.any(String));
    expect(result.diagnostics.fallbackReason).not.toBe("");
    expect(result.table.rows[0]?.["表单编号"]).toBe("F1");
    expect(sheet.usedRangeValue2ReadCount).toBe(1);
  });

  it("reports UsedRange metadata dimensions when fallback matrix shape is trimmed", () => {
    const sheet = createFakeSheet("OA", [
      [...OA_REQUIRED_HEADERS],
      ["F1", "OUT1", "2026/5/1", "数控", "生产", "仓储", "MAT-A", "物料A", 1, 10]
    ]);
    const usedRange = sheet.UsedRange;
    if (!usedRange) {
      throw new Error("missing fake UsedRange");
    }
    usedRange.Row = 5;
    usedRange.Column = 3;
    usedRange.Address = "C5:N9";
    usedRange.Rows = { Count: 5 };
    usedRange.Columns = { Count: 12 };
    sheet.rangeValues.set("C5:N9", [
      [...OA_REQUIRED_HEADERS, "", ""],
      ["F1", "OUT1", "2026/5/1", "数控", "生产", "仓储", "MAT-A", "物料A", 1, 10, "", ""],
      [],
      [],
      []
    ]);
    sheet.failReadAddresses.add("C5:N9");

    const result = readSheetTableWithDiagnostics(sheet, [...OA_REQUIRED_HEADERS], 5, 20);

    expect(result.diagnostics.strategy).toBe("used_range_fallback");
    expect(result.diagnostics.usedRangeAddress).toBe("C5:N9");
    expect(result.diagnostics.usedRangeRows).toBe(5);
    expect(result.diagnostics.usedRangeCols).toBe(12);
    expect(result.diagnostics.readRows).toBe(2);
    expect(result.diagnostics.readCols).toBe(10);
    expect(result.table.headerRowNumber).toBe(5);
    expect(result.table.rows[0]?._rowNumber).toBe(6);
  });

  it("keeps full UsedRange reads available for explicit fallback callers", () => {
    const sheet = createFakeSheet("OA", [
      [...OA_REQUIRED_HEADERS],
      ["F1", "OUT1", "2026/5/1", "数控", "生产", "仓储", "MAT-A", "物料A", 1, 10]
    ]);

    const result = readUsedRangeMatrix(sheet);

    expect(result.matrix).toHaveLength(2);
    expect(result.usedRangeStartRow).toBe(1);
    expect(sheet.usedRangeValue2ReadCount).toBe(1);
  });

  it("still throws HeaderDetectionError when neither narrow nor fallback can identify headers", () => {
    const sheet = createFakeSheet("OA", [["不是表头"]]);

    expect(() => readSheetTableWithDiagnostics(sheet, [...OA_REQUIRED_HEADERS], 5, 20)).toThrow(HeaderDetectionError);
  });
});
