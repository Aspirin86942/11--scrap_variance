import { describe, expect, it } from "vitest";
import {
  MAX_DIAGNOSTICS_CLEAR_ROW,
  MAX_OUTPUT_CLEAR_ROW,
  MAX_PRECHECK_CLEAR_ROW,
  OA_REQUIRED_HEADERS
} from "../../src/constants";
import type { ScrapVarianceGlobal, WpsApplication, WpsSheet, WpsSheets } from "../../src/types/wps";
import { readSheetTable } from "../../src/wps-api/read-sheet-data";
import { ensureSheet, getApplication, getSheets } from "../../src/wps-api/workbook";
import {
  clearPrecheckOutput,
  clearDiagnosticsOutput,
  clearQueryOutput,
  rangeAddress,
  writeMatrixBulkOrChunks
} from "../../src/wps-api/write-results";
import { createFakeSheet } from "./fakes";

function createSheetCollection(sheets: WpsSheet[]): WpsSheets {
  return {
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
}

describe("WPS adapter bulk reads and writes", () => {
  it("builds range addresses for columns beyond Z", () => {
    expect(rangeAddress(1, 27, 1, 2)).toBe("AA1:AB1");
  });

  it("rejects invalid range address inputs before attempting fallback writes", () => {
    const sheet = createFakeSheet("查询结果");

    expect(() => writeMatrixBulkOrChunks(sheet, 0, 1, [["A"]])).toThrow("起始行号 必须是正整数");
    expect(() => rangeAddress(1, 0, 1, 1)).toThrow("起始列号 必须是正整数");
    expect(() => rangeAddress(1, 1, 0, 1)).toThrow("行数 必须是正整数");
    expect(() => rangeAddress(1, 1, 1, 0)).toThrow("列数 必须是正整数");
    expect(sheet.writes).toEqual([]);
  });

  it("reads UsedRange.Value2 once and parses table by automatic header detection", () => {
    const usedRange = [
      ["导出时间", "2026-05-17"],
      [...OA_REQUIRED_HEADERS],
      ["F1", "2026-05-01", "公司A", "部门1", "部门2", "M001", "物料A", 2, 10]
    ];
    const sheet = createFakeSheet("OA", usedRange);

    const parsed = readSheetTable(sheet, [...OA_REQUIRED_HEADERS], 5, 20);

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.["表单编号"]).toBe("F1");
    expect(parsed.headerRowNumber).toBe(2);
    expect(sheet.usedRangeValue2ReadCount).toBe(1);
  });

  it("clears query and precheck output fixed ranges exactly once", () => {
    const querySheet = createFakeSheet("查询结果");
    const precheckSheet = createFakeSheet("预验证结果");

    clearQueryOutput(querySheet);
    clearPrecheckOutput(precheckSheet);

    expect(querySheet.clears).toEqual([`A9:S${MAX_OUTPUT_CLEAR_ROW}`]);
    expect(precheckSheet.clears).toEqual([`A1:H${MAX_PRECHECK_CLEAR_ROW}`]);
  });

  it("clears diagnostics output fixed range exactly once", () => {
    const diagnosticsSheet = createFakeSheet("性能诊断结果");

    clearDiagnosticsOutput(diagnosticsSheet);

    expect(diagnosticsSheet.clears).toEqual([`A1:G${MAX_DIAGNOSTICS_CLEAR_ROW}`]);
  });

  it("writes a matrix with a single bulk range assignment", () => {
    const sheet = createFakeSheet("查询结果");

    writeMatrixBulkOrChunks(sheet, 9, 1, [
      ["A", "B"],
      [1, 2]
    ]);

    expect(sheet.writes).toEqual([
      {
        address: "A9:B10",
        value: [
          ["A", "B"],
          [1, 2]
        ]
      }
    ]);
  });

  it("pads jagged matrix rows before writing to a rectangular WPS range", () => {
    const sheet = createFakeSheet("报废差异明细");

    writeMatrixBulkOrChunks(sheet, 1, 1, [
      ["汇总差异"],
      ["公司简称", "一级部门", "二级部门"],
      ["数控", "生产", "仓储"]
    ]);

    expect(sheet.writes).toEqual([
      {
        address: "A1:C3",
        value: [
          ["汇总差异", "", ""],
          ["公司简称", "一级部门", "二级部门"],
          ["数控", "生产", "仓储"]
        ]
      }
    ]);
  });

  it("fake ranges read values from overlapping matrix writes", () => {
    const sheet = createFakeSheet("查询面板");

    sheet.rangeValues.set("B2:B6", [["公司原值"], ["部门1"], ["部门2"], ["2026/5/1"], ["2026/5/31"]]);
    writeMatrixBulkOrChunks(sheet, 1, 1, [
      ["报废差异查询", ""],
      ["公司简称", ""],
      ["一级部门", ""],
      ["二级部门", ""],
      ["开始日期", ""],
      ["结束日期", ""],
      ["运行函数", "runScrapVarianceQuery"]
    ]);

    expect(sheet.Range("B2:B6").Value2).toEqual([[""], [""], [""], [""], [""]]);
  });

  it("falls back to chunked bulk range assignments when full write fails", () => {
    const sheet = createFakeSheet("查询结果");
    sheet.failNextBulkWrite = true;

    writeMatrixBulkOrChunks(sheet, 9, 1, [["A"], [1], [2], [3]], 2);

    expect(sheet.writes.map((write) => write.address)).toEqual(["A9:A10", "A11:A12"]);
    expect(sheet.writes.every((write) => Array.isArray(write.value))).toBe(true);
    expect(sheet.writes).toEqual([
      { address: "A9:A10", value: [["A"], [1]] },
      { address: "A11:A12", value: [[2], [3]] }
    ]);
  });

  it("throws full and chunk write context when chunk fallback also fails", () => {
    const sheet = createFakeSheet("查询结果");
    sheet.failNextBulkWrite = true;
    sheet.failWriteAddresses.add("A9:A10");

    expect(() => writeMatrixBulkOrChunks(sheet, 9, 1, [["A"], [1], [2], [3]], 2)).toThrow(
      /整块写入失败.*bulk write failed.*分块写入失败.*第 1 块.*A9:A10.*range write failed: A9:A10/s
    );
  });
});

describe("WPS workbook adapter", () => {
  it("throws a readable error when Application is missing", () => {
    expect(() => getApplication({} as ScrapVarianceGlobal)).toThrow("当前环境没有 WPS Application 对象");
  });

  it("prefers ActiveWorkbook.Worksheets over other sheet collections", () => {
    const preferred = createSheetCollection([createFakeSheet("preferred")]);
    const app: WpsApplication = {
      ActiveWorkbook: {
        Worksheets: preferred,
        Sheets: createSheetCollection([createFakeSheet("active-sheets")])
      },
      Worksheets: createSheetCollection([createFakeSheet("app-worksheets")]),
      Sheets: createSheetCollection([createFakeSheet("app-sheets")])
    };

    expect(getSheets(app)).toBe(preferred);
  });

  it("falls back through ActiveWorkbook.Sheets, app.Worksheets, and app.Sheets", () => {
    const activeSheets = createSheetCollection([createFakeSheet("active-sheets")]);
    const appWorksheets = createSheetCollection([createFakeSheet("app-worksheets")]);
    const appSheets = createSheetCollection([createFakeSheet("app-sheets")]);

    expect(getSheets({ ActiveWorkbook: { Sheets: activeSheets }, Worksheets: appWorksheets, Sheets: appSheets })).toBe(
      activeSheets
    );
    expect(getSheets({ ActiveWorkbook: {}, Worksheets: appWorksheets, Sheets: appSheets })).toBe(appWorksheets);
    expect(getSheets({ ActiveWorkbook: {}, Sheets: appSheets })).toBe(appSheets);
  });

  it("returns existing sheets and adds named missing sheets through injected root", () => {
    const sheets = [createFakeSheet("Existing")];
    const root = {
      Application: {
        ActiveWorkbook: {
          Worksheets: createSheetCollection(sheets)
        }
      }
    } satisfies ScrapVarianceGlobal;

    expect(ensureSheet("Existing", root)).toBe(sheets[0]);

    const added = ensureSheet("Created", root);
    expect(added.Name).toBe("Created");
    expect(sheets.map((sheet) => sheet.Name)).toEqual(["Existing", "Created"]);
  });
});
