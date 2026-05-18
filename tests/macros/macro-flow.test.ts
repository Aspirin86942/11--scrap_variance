import { describe, expect, it } from "vitest";
import { ERP_REQUIRED_HEADERS, OA_REQUIRED_HEADERS, SHEET_NAMES } from "../../src/constants";
import { runPerformanceDiagnostics } from "../../src/macros/performance-diagnostics";
import { runScrapVariancePrecheck } from "../../src/macros/scrap-variance-precheck";
import { runScrapVarianceQuery } from "../../src/macros/scrap-variance-query";
import { setupQueryPanel } from "../../src/macros/setup-query-panel";
import type { OutputMatrix } from "../../src/types/scrap";
import type { ScrapVarianceGlobal, WpsSheet } from "../../src/types/wps";
import { createFakeApplication, createFakeSheet, type FakeSheet } from "../wps-api/fakes";

function makeRoot(sheets: FakeSheet[]): ScrapVarianceGlobal {
  return {
    Application: createFakeApplication(sheets)
  };
}

function getSheet(root: ScrapVarianceGlobal, index: number): WpsSheet {
  const sheet = root.Application?.ActiveWorkbook?.Worksheets?.Item(index);
  if (!sheet) {
    throw new Error(`missing fake sheet ${index}`);
  }
  return sheet;
}

function flattenWrites(sheet: FakeSheet): string[] {
  return sheet.writes.flatMap((write) =>
    Array.isArray(write.value) ? (write.value as OutputMatrix).flat().map(String) : [String(write.value)]
  );
}

function precheckIssueRows(sheet: FakeSheet): OutputMatrix {
  const issueWrite = sheet.writes.find((write) => write.address === "A4:H5");
  if (!issueWrite || !Array.isArray(issueWrite.value)) {
    throw new Error("missing precheck issue write");
  }
  return issueWrite.value as OutputMatrix;
}

function validOaRow(): Array<string | number> {
  return ["F1", "OUT1", "2026/5/1", "数控", "生产", "仓储", "MAT-A", "物料A", 1, 10];
}

function validErpRow(): Array<string | number> {
  return ["OUT1", "2026/5/2", "F1", "数控", "生产", "仓储", "MAT-A", "物料A", 1, 10];
}

describe("TypeScript macro orchestration", () => {
  it("setupQueryPanel ensures 查询面板 and writes setup labels without touching filter cells", () => {
    const root = makeRoot([]);

    const sheet = setupQueryPanel(root) as FakeSheet;

    expect(sheet.Name).toBe(SHEET_NAMES.panel);
    expect(getSheet(root, 1).Name).toBe(SHEET_NAMES.panel);
    expect(sheet.writes).toEqual([
      {
        address: "A1:A7",
        value: [
          ["报废差异查询"],
          ["公司简称"],
          ["一级部门"],
          ["二级部门"],
          ["开始日期"],
          ["结束日期"],
          ["运行函数"]
        ]
      },
      {
        address: "B7:B7",
        value: [["runScrapVarianceQuery"]]
      }
    ]);
  });

  it("setupQueryPanel preserves existing B2:B6 filter values", () => {
    const panelSheet = createFakeSheet(SHEET_NAMES.panel);
    panelSheet.rangeValues.set("B2:B6", [["数控"], ["生产"], ["仓储"], ["2026/5/1"], ["2026/5/31"]]);
    const root = makeRoot([panelSheet]);

    setupQueryPanel(root);

    expect(panelSheet.Range("B2:B6").Value2).toEqual([["数控"], ["生产"], ["仓储"], ["2026/5/1"], ["2026/5/31"]]);
  });

  it("runScrapVariancePrecheck detects OA headers below UsedRange row 1 and writes no-issue status", () => {
    const oaSheet = createFakeSheet(SHEET_NAMES.oa, [
      ["导出条件"],
      ["制表人"],
      [...OA_REQUIRED_HEADERS],
      validOaRow()
    ]);
    const erpSheet = createFakeSheet(SHEET_NAMES.erp, [[...ERP_REQUIRED_HEADERS], validErpRow()]);
    const root = makeRoot([oaSheet, erpSheet]);

    runScrapVariancePrecheck(root);

    const resultSheet = getSheet(root, 3) as FakeSheet;
    const output = flattenWrites(resultSheet);
    expect(resultSheet.Name).toBe(SHEET_NAMES.precheckResult);
    expect(resultSheet.clears).toEqual(["A1:H200000"]);
    expect(output).not.toContain("缺少关键列");
    expect(output).toContain("未发现预验证问题");
  });

  it("runScrapVarianceQuery reads tables and writes summary plus detail matrices", () => {
    const oaSheet = createFakeSheet(SHEET_NAMES.oa, [[...OA_REQUIRED_HEADERS], validOaRow()]);
    const erpSheet = createFakeSheet(SHEET_NAMES.erp, [[...ERP_REQUIRED_HEADERS], validErpRow()]);
    const panelSheet = createFakeSheet(SHEET_NAMES.panel);
    panelSheet.rangeValues.set("B2:B6", [[""], [""], [""], [""], [""]]);
    const root = makeRoot([oaSheet, erpSheet, panelSheet]);

    runScrapVarianceQuery(root);

    const output = flattenWrites(panelSheet);
    expect(panelSheet.clears).toEqual(["A8:Q200000"]);
    expect(output).toContain("汇总差异");
    expect(output).toContain("明细差异");
    expect(output).toContain("OA和ERP都有，数量一致");
  });

  it("runScrapVarianceQuery keeps non-empty panel filters after setup and applies them", () => {
    const oaSheet = createFakeSheet(SHEET_NAMES.oa, [
      [...OA_REQUIRED_HEADERS],
      validOaRow(),
      ["F2", "OUT2", "2026/5/1", "装备", "生产", "仓储", "MAT-B", "物料B", 1, 10]
    ]);
    const erpSheet = createFakeSheet(SHEET_NAMES.erp, [
      [...ERP_REQUIRED_HEADERS],
      validErpRow(),
      ["OUT2", "2026/5/2", "F2", "装备", "生产", "仓储", "MAT-B", "物料B", 1, 10]
    ]);
    const panelSheet = createFakeSheet(SHEET_NAMES.panel);
    panelSheet.rangeValues.set("B2:B6", [["数控"], [""], [""], [""], [""]]);
    const root = makeRoot([oaSheet, erpSheet, panelSheet]);

    runScrapVarianceQuery(root);

    const output = flattenWrites(panelSheet);
    expect(output).toContain("F1");
    expect(output).toContain("MAT-A");
    expect(output).not.toContain("F2");
    expect(output).not.toContain("MAT-B");
  });

  it("runScrapVarianceQuery clears output and writes a no-match message when filters match nothing", () => {
    const oaSheet = createFakeSheet(SHEET_NAMES.oa, [[...OA_REQUIRED_HEADERS], validOaRow()]);
    const erpSheet = createFakeSheet(SHEET_NAMES.erp, [[...ERP_REQUIRED_HEADERS], validErpRow()]);
    const panelSheet = createFakeSheet(SHEET_NAMES.panel);
    panelSheet.rangeValues.set("B2:B6", [["不存在公司"], [""], [""], [0], [null]]);
    const root = makeRoot([oaSheet, erpSheet, panelSheet]);

    runScrapVarianceQuery(root);

    expect(panelSheet.clears).toEqual(["A8:Q200000"]);
    expect(panelSheet.writes).toContainEqual({
      address: "A8:A8",
      value: [["查询条件没有匹配到 OA 数据。"]]
    });
  });

  it("runScrapVariancePrecheck keeps OA header detection failures as one OA issue row", () => {
    const oaSheet = createFakeSheet(SHEET_NAMES.oa, [["没有表头"]]);
    const erpSheet = createFakeSheet(SHEET_NAMES.erp, [[...ERP_REQUIRED_HEADERS], validErpRow()]);
    const root = makeRoot([oaSheet, erpSheet]);

    runScrapVariancePrecheck(root);

    const resultSheet = getSheet(root, 3) as FakeSheet;
    const output = flattenWrites(resultSheet);
    const rows = precheckIssueRows(resultSheet);
    const issue = rows[1];
    expect(output).toContain("发现 1 条预验证问题");
    expect(rows).toHaveLength(2);
    expect(issue?.[1]).toBe("OA");
    expect(issue?.[3]).toBe("表头");
    expect(issue?.[5]).toBe("无法识别表头");
    expect(issue?.[1]).not.toBe("系统");
    expect(issue?.[5]).not.toBe("预验证执行失败");
  });

  it("runScrapVariancePrecheck keeps ERP ambiguous header detection failures as one ERP issue row", () => {
    const oaSheet = createFakeSheet(SHEET_NAMES.oa, [[...OA_REQUIRED_HEADERS], validOaRow()]);
    const partialErpHeaders = ["单据编号", "日期", "源单单号", "区分公司简称", "一级部门"];
    const erpSheet = createFakeSheet(SHEET_NAMES.erp, [partialErpHeaders, partialErpHeaders]);
    const root = makeRoot([oaSheet, erpSheet]);

    runScrapVariancePrecheck(root);

    const resultSheet = getSheet(root, 3) as FakeSheet;
    const rows = precheckIssueRows(resultSheet);
    const issue = rows[1];
    expect(rows).toHaveLength(2);
    expect(issue?.[1]).toBe("ERP");
    expect(issue?.[3]).toBe("表头");
    expect(issue?.[5]).toBe("表头识别不唯一");
    expect(issue?.[1]).not.toBe("系统");
  });

  it("runPerformanceDiagnostics writes diagnostics without clearing query output", () => {
    const oaSheet = createFakeSheet(SHEET_NAMES.oa, [[...OA_REQUIRED_HEADERS], validOaRow()]);
    const erpSheet = createFakeSheet(SHEET_NAMES.erp, [[...ERP_REQUIRED_HEADERS], validErpRow()]);
    const panelSheet = createFakeSheet(SHEET_NAMES.panel);
    panelSheet.rangeValues.set("B2:B6", [[""], [""], [""], [""], [""]]);
    const root = makeRoot([oaSheet, erpSheet, panelSheet]);

    runPerformanceDiagnostics(root);

    const diagnosticsSheet = getSheet(root, 4) as FakeSheet;
    const output = flattenWrites(diagnosticsSheet);
    expect(diagnosticsSheet.Name).toBe(SHEET_NAMES.performanceDiagnostics);
    expect(panelSheet.clears).toEqual([]);
    expect(output).toContain("类别");
    expect(output).toContain("read_oa_used_range");
    expect(output).toContain("build_output_matrix");
    expect(output).toContain("write_diagnostics_sheet");
    expect(output).toContain("performance.now");

    const initialWrite = diagnosticsSheet.writes[0];
    const writeStageAppend = diagnosticsSheet.writes[1];
    if (!initialWrite || !writeStageAppend || !Array.isArray(initialWrite.value)) {
      throw new Error("missing diagnostics writes");
    }
    const initialRows = initialWrite.value as OutputMatrix;

    expect(initialRows).toContainEqual([
      "运行时能力",
      "performance.now",
      "不适用",
      "不适用",
      "不适用",
      "不适用",
      "支持"
    ]);
    expect(initialRows.some((row) => row[0] === "运行时能力" && row[1] === "memory_api")).toBe(true);
    expect(initialRows).toContainEqual([
      "结果规模",
      "result_rows",
      2,
      2,
      "不适用",
      "不适用",
      "OA聚合=1；ERP匹配聚合=1；ERP-only聚合=0"
    ]);
    const initialRowCount = (initialWrite.value as OutputMatrix).length;
    expect(initialWrite.address).toBe(`A1:G${initialRowCount}`);
    expect(writeStageAppend.address).toBe(`A${initialRowCount + 1}:G${initialRowCount + 1}`);
  });

  it("runPerformanceDiagnostics writes an error row when diagnostics fails", () => {
    const root = makeRoot([]);

    runPerformanceDiagnostics(root);

    const diagnosticsSheet = getSheet(root, 1) as FakeSheet;
    const output = flattenWrites(diagnosticsSheet);
    expect(diagnosticsSheet.Name).toBe(SHEET_NAMES.performanceDiagnostics);
    expect(output).toContain("错误");
    expect(output.join("|")).toContain("找不到工作表");
    const errorWrite = diagnosticsSheet.writes[0];
    if (!errorWrite || !Array.isArray(errorWrite.value)) {
      throw new Error("missing diagnostics error write");
    }
    expect(errorWrite.value).toEqual([
      ["类别", "阶段", "输入行数", "输出行数", "耗时ms", "内存MB", "说明"],
      [
        "错误",
        "performance_diagnostics",
        "不适用",
        "不适用",
        "不适用",
        "不适用",
        expect.stringContaining("找不到工作表")
      ]
    ]);
  });

  it("runPerformanceDiagnostics preserves the original error when writing the error row fails", () => {
    const diagnosticsSheet = createFakeSheet(SHEET_NAMES.performanceDiagnostics);
    diagnosticsSheet.failWriteAddresses.add("A1:G2");
    const root = makeRoot([diagnosticsSheet]);

    expect(() => runPerformanceDiagnostics(root)).toThrow(
      /性能诊断失败：.*找不到工作表：查询面板.*错误信息写入也失败：.*range write failed: A1:G2/s
    );
  });
});
