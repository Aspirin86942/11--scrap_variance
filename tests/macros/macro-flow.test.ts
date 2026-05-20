import { describe, expect, it } from "vitest";
import { ERP_REQUIRED_HEADERS, OA_REQUIRED_HEADERS, SHEET_NAMES } from "../../src/constants";
import { QUERY_DIRECTIONS } from "../../src/core/query-direction";
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

function getFakeSheetByName(root: ScrapVarianceGlobal, sheetName: string): FakeSheet {
  const sheets = root.Application?.ActiveWorkbook?.Worksheets;
  if (!sheets) {
    throw new Error("missing fake worksheets");
  }
  for (let index = 1; index <= sheets.Count; index += 1) {
    const sheet = sheets.Item(index) as FakeSheet;
    if (sheet.Name === sheetName) {
      return sheet;
    }
  }
  throw new Error(`missing fake sheet ${sheetName}`);
}

function setActiveSheet(root: ScrapVarianceGlobal, sheet: WpsSheet): void {
  if (!root.Application) {
    throw new Error("missing fake application");
  }
  root.Application.ActiveSheet = sheet;
}

function visibleWrites(sheet: FakeSheet): FakeSheet["writes"] {
  return sheet.writes.filter((write) => !write.address.startsWith("CB"));
}

function flattenWrites(sheet: FakeSheet): string[] {
  return visibleWrites(sheet).flatMap((write) =>
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

function scatteredRequiredRow(columns: Record<number, string | number>): Array<string | number> {
  const width = Math.max(...Object.keys(columns).map(Number));
  return Array.from({ length: width }, (_, index) => columns[index + 1] ?? "");
}

describe("TypeScript macro orchestration", () => {
  it("setupQueryPanel creates current output sheets and returns the variance summary sheet", () => {
    const root = makeRoot([]);

    const sheet = setupQueryPanel(root) as FakeSheet;

    expect(sheet.Name).toBe(SHEET_NAMES.varianceSummary);
    expect(root.Application?.ActiveWorkbook?.Worksheets?.Count).toBe(3);
    expect(getSheet(root, 1).Name).toBe(SHEET_NAMES.varianceSummary);
    expect(getSheet(root, 2).Name).toBe(SHEET_NAMES.oaDocCompare);
    expect(getSheet(root, 3).Name).toBe(SHEET_NAMES.erpDocCompare);
    expect(sheet.writes).toEqual([]);
  });

  it("setupQueryPanel renames the old query panel and preserves existing B2:B7 values", () => {
    const panelSheet = createFakeSheet(SHEET_NAMES.panel);
    panelSheet.rangeValues.set("B2:B7", [["数控"], ["生产"], ["仓储"], ["2026/5/1"], ["2026/5/31"], ["ERP源单查OA"]]);
    const root = makeRoot([panelSheet]);

    const sheet = setupQueryPanel(root) as FakeSheet;

    expect(sheet).toBe(panelSheet);
    expect(panelSheet.Name).toBe(SHEET_NAMES.varianceSummary);
    expect(panelSheet.Range("B2:B7").Value2).toEqual([
      ["数控"],
      ["生产"],
      ["仓储"],
      ["2026/5/1"],
      ["2026/5/31"],
      ["ERP源单查OA"]
    ]);
    expect(getSheet(root, 2).Name).toBe(SHEET_NAMES.oaDocCompare);
    expect(getSheet(root, 3).Name).toBe(SHEET_NAMES.erpDocCompare);
    expect(panelSheet.writes).toEqual([]);
  });

  it("setupQueryPanel does not rewrite legacy B7 run function during output setup", () => {
    const panelSheet = createFakeSheet(SHEET_NAMES.panel);
    panelSheet.rangeValues.set("B2:B7", [
      ["数控"],
      ["生产"],
      ["仓储"],
      ["2026/5/1"],
      ["2026/5/31"],
      ["runScrapVarianceQuery"]
    ]);
    const root = makeRoot([panelSheet]);

    setupQueryPanel(root);

    expect(panelSheet.Name).toBe(SHEET_NAMES.varianceSummary);
    expect(panelSheet.Range("B2:B7").Value2).toEqual([
      ["数控"],
      ["生产"],
      ["仓储"],
      ["2026/5/1"],
      ["2026/5/31"],
      ["runScrapVarianceQuery"]
    ]);
    expect(panelSheet.writes).toEqual([]);
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
    const root = makeRoot([oaSheet, erpSheet, panelSheet]);
    setActiveSheet(root, panelSheet);

    runScrapVarianceQuery(root);

    const output = flattenWrites(panelSheet);
    expect(panelSheet.Name).toBe(SHEET_NAMES.varianceSummary);
    expect(panelSheet.clears).toEqual([]);
    expect(panelSheet.writes).toContainEqual({
      address: "A1:S6",
      value: expect.any(Array)
    });
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
    panelSheet.rangeValues.set("B2:B7", [["数控"], [""], [""], [""], [""], ["OA金蝶单号查ERP"]]);
    const root = makeRoot([oaSheet, erpSheet, panelSheet]);
    setActiveSheet(root, panelSheet);

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
    const panelSheet = createFakeSheet(SHEET_NAMES.varianceSummary);
    panelSheet.rangeValues.set("CB1:CC1", [["legacy_detail", "A1:S6"]]);
    const root = makeRoot([oaSheet, erpSheet, panelSheet]);
    root.ScrapVarianceRibbonState = { company: "不存在公司" };
    setActiveSheet(root, panelSheet);

    runScrapVarianceQuery(root);

    expect(panelSheet.clears).toEqual(["A1:S6"]);
    expect(visibleWrites(panelSheet)).toContainEqual({
      address: "A1:A1",
      value: [["查询条件没有匹配到 OA 数据。"]]
    });
  });

  it("runScrapVarianceQuery writes the ERP no-match message for ERP source direction", () => {
    const oaSheet = createFakeSheet(SHEET_NAMES.oa, [[...OA_REQUIRED_HEADERS], validOaRow()]);
    const erpSheet = createFakeSheet(SHEET_NAMES.erp, [[...ERP_REQUIRED_HEADERS], validErpRow()]);
    const panelSheet = createFakeSheet(SHEET_NAMES.varianceSummary);
    const root = makeRoot([oaSheet, erpSheet, panelSheet]);
    root.ScrapVarianceRibbonState = {
      company: "不存在公司",
      queryDirection: QUERY_DIRECTIONS.erpSourceToOa
    };
    setActiveSheet(root, panelSheet);

    runScrapVarianceQuery(root);

    expect(panelSheet.clears).toEqual([]);
    expect(visibleWrites(panelSheet)).toContainEqual({
      address: "A1:A1",
      value: [["查询条件没有匹配到 ERP 数据。"]]
    });
  });

  it("runScrapVarianceQuery writes an error for an invalid query direction", () => {
    const oaSheet = createFakeSheet(SHEET_NAMES.oa, [[...OA_REQUIRED_HEADERS], validOaRow()]);
    const erpSheet = createFakeSheet(SHEET_NAMES.erp, [[...ERP_REQUIRED_HEADERS], validErpRow()]);
    const panelSheet = createFakeSheet(SHEET_NAMES.varianceSummary);
    const root = makeRoot([oaSheet, erpSheet, panelSheet]);
    root.ScrapVarianceRibbonState = { queryDirection: "坏方向" as typeof QUERY_DIRECTIONS.oaKingdeeToErp };
    setActiveSheet(root, panelSheet);

    runScrapVarianceQuery(root);

    const output = flattenWrites(panelSheet);
    expect(panelSheet.clears).toEqual([]);
    expect(visibleWrites(panelSheet)).toContainEqual({
      address: "A1:B1",
      value: [["错误", "查询方向不正确：请填写 OA金蝶单号查ERP 或 ERP源单查OA"]]
    });
    expect(output.join("|")).toContain("查询方向不正确：请填写 OA金蝶单号查ERP 或 ERP源单查OA");
  });

  it("runScrapVarianceQuery uses ERP filters when direction is ERP source to OA", () => {
    const oaSheet = createFakeSheet(SHEET_NAMES.oa, [
      [...OA_REQUIRED_HEADERS],
      ["F1", "OUT1", "2026/4/1", "其他公司", "其他部门", "其他二级", "MAT-A", "物料A", 1, 10]
    ]);
    const erpSheet = createFakeSheet(SHEET_NAMES.erp, [
      [...ERP_REQUIRED_HEADERS],
      ["OUT1", "2026/5/2", "F1", "数控", "生产", "仓储", "MAT-A", "物料A", 1, 10]
    ]);
    const panelSheet = createFakeSheet(SHEET_NAMES.varianceSummary);
    const root = makeRoot([oaSheet, erpSheet, panelSheet]);
    root.ScrapVarianceRibbonState = {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31",
      queryDirection: QUERY_DIRECTIONS.erpSourceToOa
    };
    setActiveSheet(root, panelSheet);

    runScrapVarianceQuery(root);

    const output = flattenWrites(panelSheet);
    expect(panelSheet.clears).toEqual([]);
    expect(output).toContain("F1");
    expect(output).toContain("OA和ERP都有，数量一致");
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
    const root = makeRoot([oaSheet, erpSheet, panelSheet]);

    setupQueryPanel(root);
    runPerformanceDiagnostics(root);

    const diagnosticsSheet = getFakeSheetByName(root, SHEET_NAMES.performanceDiagnostics);
    const output = flattenWrites(diagnosticsSheet);
    expect(diagnosticsSheet.Name).toBe(SHEET_NAMES.performanceDiagnostics);
    expect(panelSheet.Name).toBe(SHEET_NAMES.varianceSummary);
    expect(panelSheet.clears).toEqual([]);
    expect(output).toContain("类别");
    expect(output).toContain("read_oa_source_table");
    expect(output).toContain("read_erp_source_table");
    expect(output).toContain("oa_read_strategy");
    expect(output).toContain("oa_read_range");
    expect(output).toContain("oa_used_range");
    expect(output).toContain("erp_read_strategy");
    expect(output.some((value) => value.startsWith("grouped_ranges；列组="))).toBe(true);
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

  it("runPerformanceDiagnostics writes a cell-safe fallback reason for read strategy notes", () => {
    const oaSheet = createFakeSheet(SHEET_NAMES.oa, [[...OA_REQUIRED_HEADERS], validOaRow()]);
    const erpSheet = createFakeSheet(SHEET_NAMES.erp, [[...ERP_REQUIRED_HEADERS], validErpRow()]);
    const root = makeRoot([oaSheet, erpSheet]);
    const longFailureReason = `WPS read failed\n${"  host bridge returned a verbose diagnostic  ".repeat(12)}`;
    oaSheet.failReadAddresses.add("A1:J2");
    oaSheet.readFailureMessages.set("A1:J2", longFailureReason);

    runPerformanceDiagnostics(root);

    const diagnosticsSheet = getFakeSheetByName(root, SHEET_NAMES.performanceDiagnostics);
    const initialWrite = diagnosticsSheet.writes[0];
    if (!initialWrite || !Array.isArray(initialWrite.value)) {
      throw new Error("missing diagnostics write");
    }
    const initialRows = initialWrite.value as OutputMatrix;
    const strategyRow = initialRows.find((row) => row[1] === "oa_read_strategy");
    const strategyNote = String(strategyRow?.[6] ?? "");

    expect(strategyRow).toBeDefined();
    expect(strategyNote).toMatch(/^used_range_fallback；原因：/);
    expect(strategyNote).toContain("used_range_fallback");
    expect(strategyNote).not.toContain("\n");
    expect(strategyNote.length).toBeLessThanOrEqual(230);
    expect(initialRows[0]?.slice(0, 2)).toEqual(["类别", "阶段"]);
    expect(initialRows).toContainEqual(expect.arrayContaining(["结果规模", "result_rows"]));
  });

  it("runPerformanceDiagnostics writes grouped range count and read column diagnostics", () => {
    const oaSheet = createFakeSheet(SHEET_NAMES.oa, [
      scatteredRequiredRow({
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
      }),
      scatteredRequiredRow({
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
      })
    ]);
    const erpSheet = createFakeSheet(SHEET_NAMES.erp, [[...ERP_REQUIRED_HEADERS], validErpRow()]);
    const root = makeRoot([oaSheet, erpSheet]);

    runPerformanceDiagnostics(root);

    const diagnosticsSheet = getFakeSheetByName(root, SHEET_NAMES.performanceDiagnostics);
    const initialWrite = diagnosticsSheet.writes[0];
    if (!initialWrite || !Array.isArray(initialWrite.value)) {
      throw new Error("missing diagnostics write");
    }
    const initialRows = initialWrite.value as OutputMatrix;
    const strategyRow = initialRows.find((row) => row[1] === "oa_read_strategy");
    const readRangeRow = initialRows.find((row) => row[1] === "oa_read_range");

    expect(String(strategyRow?.[6] ?? "")).toBe("grouped_ranges；列组=3；读取列=10；总行=2");
    expect(readRangeRow?.[2]).toBe(2);
    expect(readRangeRow?.[3]).toBe(10);
    expect(readRangeRow?.[6]).toBe("A1:C2,M1:O2,Z1:AC2");
  });

  it("runPerformanceDiagnostics uses the selected ERP source query direction", () => {
    const oaSheet = createFakeSheet(SHEET_NAMES.oa, [
      [...OA_REQUIRED_HEADERS],
      ["F1", "OUT1", "2026/4/1", "其他公司", "其他部门", "其他二级", "MAT-A", "物料A", 1, 10]
    ]);
    const erpSheet = createFakeSheet(SHEET_NAMES.erp, [
      [...ERP_REQUIRED_HEADERS],
      ["OUT1", "2026/5/2", "F1", "数控", "生产", "仓储", "MAT-A", "物料A", 1, 10]
    ]);
    const root = makeRoot([oaSheet, erpSheet]);
    root.ScrapVarianceRibbonState = {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31",
      queryDirection: QUERY_DIRECTIONS.erpSourceToOa
    };

    runPerformanceDiagnostics(root);

    const diagnosticsSheet = getFakeSheetByName(root, SHEET_NAMES.performanceDiagnostics);
    const output = flattenWrites(diagnosticsSheet);
    const initialWrite = diagnosticsSheet.writes[0];
    if (!initialWrite || !Array.isArray(initialWrite.value)) {
      throw new Error("missing diagnostics writes");
    }
    const initialRows = initialWrite.value as OutputMatrix;
    const readFiltersRow = initialRows.find((row) => row[0] === "阶段耗时" && row[1] === "read_filters");

    expect(output).toContain("build_erp_rows_by_erp_filters");
    expect(output).not.toContain("build_erp_rows_for_oa");
    expect(output).toContain("read_oa_source_table");
    expect(output).toContain("read_erp_source_table");
    expect(readFiltersRow?.[2]).toBe(6);
    expect(readFiltersRow?.[3]).toBe(6);
    expect(initialRows).toContainEqual([
      "结果规模",
      "result_rows",
      2,
      2,
      "不适用",
      "不适用",
      "OA聚合=1；ERP匹配聚合=1；ERP-only聚合=0"
    ]);
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

  it("runPerformanceDiagnostics writes a cell-safe error note when diagnostics fails", () => {
    const diagnosticsSheet = createFakeSheet(SHEET_NAMES.performanceDiagnostics);
    const toxicSheet = createFakeSheet("会触发名称读取错误");
    const unsafeMessage = `=HYPERLINK("http://example.invalid","x")\n${"verbose host bridge details ".repeat(20)}`;
    Object.defineProperty(toxicSheet, "Name", {
      get() {
        throw new Error(unsafeMessage);
      }
    });
    const root = makeRoot([diagnosticsSheet, toxicSheet]);

    runPerformanceDiagnostics(root);

    const errorWrite = diagnosticsSheet.writes[0];
    if (!errorWrite || !Array.isArray(errorWrite.value)) {
      throw new Error("missing diagnostics error write");
    }
    const errorRows = errorWrite.value as OutputMatrix;
    const errorNote = String(errorRows[1]?.[6] ?? "");

    expect(errorRows[1]?.[0]).toBe("错误");
    expect(errorNote).toMatch(/^'=HYPERLINK/);
    expect(errorNote).not.toContain("\n");
    expect(errorNote.length).toBeLessThanOrEqual(200);
  });

  it("runPerformanceDiagnostics preserves the original error when writing the error row fails", () => {
    const diagnosticsSheet = createFakeSheet(SHEET_NAMES.performanceDiagnostics);
    diagnosticsSheet.failWriteAddresses.add("A1:G2");
    const root = makeRoot([diagnosticsSheet]);

    expect(() => runPerformanceDiagnostics(root)).toThrow(
      /性能诊断失败：.*找不到工作表：查询OA-存货报废申请单.*错误信息写入也失败：.*range write failed: A1:G2/s
    );
  });
});
