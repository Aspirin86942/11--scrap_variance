import { describe, expect, it } from "vitest";
import { OA_REQUIRED_HEADERS } from "../../src/constants";
import { detectHeaderRow } from "../../src/core/header-detection";

describe("detectHeaderRow", () => {
  it("finds a header row within the scan window using exact trimmed headers", () => {
    const matrix = [
      ["导出条件", "", ""],
      ["制表人", "", ""],
      [" 表单编号 ", "申请日期", "公司简称", "一级部门", "二级部门", "物料代码", "物料名称", "数量", "实际预算金额mx"],
      ["F001", "2026/5/1", "数控", "生产运营中心", "仓储部", "MAT-A", "物料A", 2, 20]
    ];

    const result = detectHeaderRow(matrix, [...OA_REQUIRED_HEADERS], {
      minMatchCount: 5,
      maxScanRows: 20,
      usedRangeStartRow: 1
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.headerRowIndex).toBe(2);
      expect(result.headerRowNumber).toBe(3);
      expect(result.columnIndex["表单编号"]).toBe(0);
      expect(result.columnIndex["实际预算金额mx"]).toBe(8);
    }
  });

  it("uses fixed tie-break rules for duplicate partial candidates", () => {
    const matrix = [
      ["表单编号", "申请日期", "公司简称", "", ""],
      ["表单编号", "申请日期", "公司简称", "一级部门", ""],
      ["F001", "2026/5/1", "数控", "生产运营中心", ""]
    ];

    const result = detectHeaderRow(matrix, [...OA_REQUIRED_HEADERS], {
      minMatchCount: 3,
      maxScanRows: 20,
      usedRangeStartRow: 10
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.headerRowIndex).toBe(1);
      expect(result.headerRowNumber).toBe(11);
    }
  });

  it("reports ambiguous headers when partial candidates cannot be separated", () => {
    const matrix = [
      ["表单编号", "申请日期", "公司简称"],
      ["表单编号", "申请日期", "公司简称"]
    ];

    const result = detectHeaderRow(matrix, [...OA_REQUIRED_HEADERS], {
      minMatchCount: 3,
      maxScanRows: 20,
      usedRangeStartRow: 1
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issueType).toBe("表头识别不唯一");
      expect(result.message).toContain("表头识别不唯一");
    }
  });

  it("reports one blocking error when headers cannot be recognized", () => {
    const result = detectHeaderRow([["完全不是表头"]], [...OA_REQUIRED_HEADERS], {
      minMatchCount: 5,
      maxScanRows: 20,
      usedRangeStartRow: undefined
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issueType).toBe("无法识别表头");
      expect(result.message).toContain("最多命中 0/9 个必需字段");
      expect(result.headerRowNumber).toBe("相对 UsedRange 第 1 行");
    }
  });
});
