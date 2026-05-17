import { describe, expect, it } from "vitest";
import { OA_REQUIRED_HEADERS } from "../../src/constants";
import { HeaderDetectionError } from "../../src/core/header-detection";
import { parseTableFromMatrix } from "../../src/core/table-parser";

describe("parseTableFromMatrix", () => {
  it("parses nonblank rows below the detected header and preserves worksheet row numbers", () => {
    const table = parseTableFromMatrix(
      [
        ["导出条件"],
        ["表单编号", "申请日期", "公司简称", "一级部门", "二级部门", "物料代码", "物料名称", "数量", "实际预算金额mx"],
        ["F001", "2026/5/1", "数控", "生产运营中心", "仓储部", "MAT-A", "物料A", 2, 20],
        ["", "", "", "", "", "", "", "", ""]
      ],
      [...OA_REQUIRED_HEADERS],
      {
        minMatchCount: 5,
        maxScanRows: 20,
        usedRangeStartRow: 6
      }
    );

    expect(table.headerRowNumber).toBe(7);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]?._rowNumber).toBe(8);
    expect(table.rows[0]?.["表单编号"]).toBe("F001");
  });

  it("throws a structured header detection error when headers cannot be recognized", () => {
    expect.assertions(4);

    try {
      parseTableFromMatrix([["完全不是表头"]], [...OA_REQUIRED_HEADERS], {
        minMatchCount: 5,
        maxScanRows: 20,
        usedRangeStartRow: undefined
      });
    } catch (error) {
      expect(error).toBeInstanceOf(HeaderDetectionError);
      if (error instanceof HeaderDetectionError) {
        expect(error.result.issueType).toBe("无法识别表头");
        expect(error.result.headerRowNumber).toBe("相对 UsedRange 第 1 行");
        expect(error.result.missingHeaders).toContain("表单编号");
      }
    }
  });

  it("does not silently parse full-match header rows with duplicate required headers", () => {
    expect(() =>
      parseTableFromMatrix(
        [
          [
            "表单编号",
            "申请日期",
            "公司简称",
            "一级部门",
            "二级部门",
            "物料代码",
            "物料名称",
            "数量",
            "实际预算金额mx",
            "数量"
          ],
          ["F001", "2026/5/1", "数控", "生产运营中心", "仓储部", "MAT-A", "物料A", 2, 20, 999]
        ],
        [...OA_REQUIRED_HEADERS],
        {
          minMatchCount: 5,
          maxScanRows: 20,
          usedRangeStartRow: 1
        }
      )
    ).toThrow(HeaderDetectionError);
  });
});
