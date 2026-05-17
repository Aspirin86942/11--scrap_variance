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

function oaRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    表单编号: "F1",
    申请日期: "2026/5/1",
    公司简称: "数控",
    一级部门: "生产",
    二级部门: "仓储",
    物料代码: "A",
    物料名称: "A物料",
    数量: 1,
    实际预算金额mx: 10,
    ...overrides
  };
}

function erpRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    单据编号: "Q1",
    日期: "2026/5/2",
    源单单号: "F1",
    区分公司简称: "数控",
    一级部门: "生产",
    二级部门: "仓储",
    物料编码: "A",
    物料名称: "A物料",
    实发数量: 1,
    总成本: 10,
    ...overrides
  };
}

describe("precheck core", () => {
  it("keeps existing duplicate and ERP source-form reminders", () => {
    const oaTable = table([oaRow(), oaRow({ 数量: 2, 实际预算金额mx: 20 })]);
    const erpTable = table([erpRow({ 源单单号: "F999", 实发数量: 3, 总成本: 30 })]);

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

  it("reports invalid dates with blocking row, field, raw value, and reason", () => {
    const issues = buildPrecheckIssues(table([oaRow({ 申请日期: "2026/2/30" })]), table([erpRow()]));
    const issue = issues.find((candidate) => candidate.issueType === "日期格式不正确");

    expect(issue).toMatchObject({
      level: "错误",
      source: "OA",
      rowNumber: 2,
      fieldName: "申请日期",
      rawValue: "2026/2/30"
    });
    expect(issue?.reason).toContain("日期格式不正确");
    expect(issue?.reason).toContain("2026/2/30");
  });

  it("reports invalid numeric values as blocking errors and preserves the raw value", () => {
    const issues = buildPrecheckIssues(table([oaRow({ 数量: "1,,2" })]), table([erpRow()]));
    const issue = issues.find((candidate) => candidate.issueType === "数值格式不正确");

    expect(issue).toMatchObject({
      level: "错误",
      source: "OA",
      rowNumber: 2,
      fieldName: "数量",
      rawValue: "1,,2"
    });
    expect(issue?.reason).toContain("数量数值格式不正确");
  });

  it("reports blank required cells as blocking errors", () => {
    const issues = buildPrecheckIssues(table([oaRow({ 物料代码: "" })]), table([erpRow()]));
    const issue = issues.find((candidate) => candidate.issueType === "关键字段为空");

    expect(issue).toMatchObject({
      level: "错误",
      source: "OA",
      rowNumber: 2,
      fieldName: "物料代码",
      rawValue: ""
    });
    expect(issue?.reason).toContain("物料代码 为空");
  });

  it("reports exact duplicate OA and ERP business-key row numbers", () => {
    const issues = buildPrecheckIssues(
      table([oaRow(), oaRow({ 数量: 2 })]),
      table([erpRow(), erpRow({ 单据编号: "Q2", 实发数量: 2 })])
    );

    expect(
      issues.find((issue) => issue.source === "OA" && issue.issueType === "业务键重复")?.rowNumber
    ).toBe("2,3");
    expect(
      issues.find((issue) => issue.source === "ERP" && issue.issueType === "业务键重复")?.rowNumber
    ).toBe("2,3");
  });

  it("deduplicates missing ERP source-form reminders by source form and keeps the first row", () => {
    const issues = buildPrecheckIssues(
      table([oaRow({ 表单编号: "F1" })]),
      table([
        erpRow({ 源单单号: "F999" }),
        erpRow({ 单据编号: "Q2", 源单单号: "F999" }),
        erpRow({ 单据编号: "Q3", 源单单号: "F888" })
      ])
    );
    const sourceFormIssues = issues.filter((issue) => issue.issueType === "ERP源单未在OA中找到");

    expect(sourceFormIssues).toHaveLength(2);
    expect(sourceFormIssues.map((issue) => [issue.rawValue, issue.rowNumber])).toEqual([
      ["F999", 2],
      ["F888", 4]
    ]);
  });

  it("returns one blocking header issue per source without row-level spam when required headers are missing", () => {
    const issues = buildPrecheckIssues(
      table([
        {
          表单编号: "F1",
          公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料名称: "A物料",
          数量: 1,
          实际预算金额mx: 10
        }
      ]),
      table([
        {
          日期: "2026/5/2",
          源单单号: "F1",
          实发数量: 1
        }
      ])
    );
    const values = issueRowsToValues(issues);

    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => [issue.source, issue.level, issue.issueType])).toEqual([
      ["OA", "错误", "缺少关键列"],
      ["ERP", "错误", "缺少关键列"]
    ]);
    expect(issues[0]?.reason).toContain("申请日期");
    expect(issues[0]?.reason).toContain("物料代码");
    expect(issues[1]?.reason).toContain("单据编号");
    expect(issues.every((issue) => issue.fieldName === "表头")).toBe(true);
    expect(issues.some((issue) => issue.issueType === "日期格式不正确")).toBe(false);
    expect(issues.some((issue) => issue.issueType === "关键字段为空")).toBe(false);
    expect(values[1]?.[5]).not.toBe("未发现预验证问题");
  });
});
