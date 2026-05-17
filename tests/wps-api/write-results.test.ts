import { describe, expect, it } from "vitest";
import { MAX_OUTPUT_CLEAR_ROW, MAX_PRECHECK_CLEAR_ROW, OA_REQUIRED_HEADERS } from "../../src/constants";
import { readSheetTable } from "../../src/wps-api/read-sheet-data";
import { clearPrecheckOutput, clearQueryOutput, writeMatrixBulkOrChunks } from "../../src/wps-api/write-results";
import { createFakeSheet } from "./fakes";

describe("WPS adapter bulk reads and writes", () => {
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

    expect(querySheet.clears).toEqual([`A8:O${MAX_OUTPUT_CLEAR_ROW}`]);
    expect(precheckSheet.clears).toEqual([`A1:H${MAX_PRECHECK_CLEAR_ROW}`]);
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
});
