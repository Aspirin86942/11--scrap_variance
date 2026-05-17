import { describe, expect, it } from "vitest";
import { buildHeaderDetectionIssue, buildPrecheckIssues, issueRowsToValues } from "../../src/core/precheck";
import type { ParsedTable } from "../../src/types/scrap";

function table(rows: Array<Record<string, unknown>>): ParsedTable {
  return {
    headers: Object.keys(rows[0] ?? {}),
    rows: rows.map((row, index) => ({ ...row, _rowNumber: index + 2 })),
    headerRowNumber: 1,
    columnIndex: {},
    matrix: []
  };
}

describe("precheck core", () => {
  it("keeps existing duplicate and ERP source-form reminders", () => {
    const oaTable = table([
      {
        表单编号: "F1",
        申请日期: "2026/5/1",
        公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料代码: "A",
        物料名称: "A物料",
        数量: 1,
        实际预算金额mx: 10
      },
      {
        表单编号: "F1",
        申请日期: "2026/5/1",
        公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料代码: "A",
        物料名称: "A物料",
        数量: 2,
        实际预算金额mx: 20
      }
    ]);
    const erpTable = table([
      {
        单据编号: "Q1",
        日期: "2026/5/2",
        源单单号: "F999",
        区分公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料编码: "A",
        物料名称: "A物料",
        实发数量: 3,
        总成本: 30
      }
    ]);

    const issues = buildPrecheckIssues(oaTable, erpTable);

    expect(issues.some((issue) => issue.issueType === "业务键重复")).toBe(true);
    expect(issues.some((issue) => issue.issueType === "ERP源单未在OA中找到")).toBe(true);
  });

  it("builds one blocking issue for header detection failure", () => {
    const issue = buildHeaderDetectionIssue("OA", {
      issueType: "无法识别表头",
      message: "OA 表无法识别表头：已扫描 UsedRange 前 20 行，最多命中 0/9 个必需字段。",
      missingHeaders: ["表单编号", "申请日期"],
      headerRowNumber: "相对 UsedRange 第 1 行"
    });

    expect(issue.level).toBe("错误");
    expect(issue.issueType).toBe("无法识别表头");
    expect(issue.reason).toContain("最多命中 0/9 个必需字段");
    expect(issue.suggestion).toContain("表头文字是否与模板完全一致");
  });

  it("includes all missing header names in header detection issue guidance", () => {
    const issue = buildHeaderDetectionIssue("ERP", {
      issueType: "无法识别表头",
      message: "ERP 表无法识别表头。",
      missingHeaders: ["源单单号", "物料编码", "总成本"],
      headerRowNumber: "相对 UsedRange 第 1 行"
    });
    const guidance = `${issue.reason} ${issue.suggestion}`;

    expect(guidance).toContain("源单单号");
    expect(guidance).toContain("物料编码");
    expect(guidance).toContain("总成本");
  });

  it("renders no-issue message and issue rows with current columns", () => {
    expect(issueRowsToValues([])[0]).toEqual([
      "级别",
      "数据源",
      "行号",
      "字段名",
      "原值",
      "问题类型",
      "原因",
      "处理建议"
    ]);
    expect(issueRowsToValues([])[1]?.[5]).toBe("未发现预验证问题");
  });
});
