import { describe, expect, it } from "vitest";
import {
  ERP_DOC_COMPARE_HEADERS,
  ERP_REQUIRED_HEADERS,
  OA_DOC_COMPARE_HEADERS,
  OA_REQUIRED_HEADERS,
  SHEET_NAMES
} from "../../src/constants";
import { QUERY_DIRECTIONS } from "../../src/core/query-direction";
import { unsupportedOutputSheetMessage } from "../../src/core/output-sheets";
import { runCurrentSheetQuery, runCurrentSheetQueryWithState, toggleMaterialRows } from "../../src/macros/current-sheet-query";
import { setupOutputSheets } from "../../src/macros/output-sheets";
import type { OutputMatrix } from "../../src/types/scrap";
import type { ScrapVarianceGlobal, WpsSheet } from "../../src/types/wps";
import { createFakeApplication, createFakeSheet, type FakeSheet } from "../wps-api/fakes";

function makeRoot(sheets: FakeSheet[]): ScrapVarianceGlobal {
  return {
    Application: createFakeApplication(sheets)
  };
}

function sheetNames(root: ScrapVarianceGlobal): string[] {
  const sheets = root.Application?.ActiveWorkbook?.Worksheets;
  if (!sheets) {
    throw new Error("missing fake worksheets");
  }

  const result: string[] = [];
  for (let index = 1; index <= sheets.Count; index += 1) {
    result.push(sheets.Item(index).Name);
  }
  return result;
}

function makeOutputSheet(name: string): FakeSheet {
  return createFakeSheet(name);
}

function makeOaSheet(rows: Array<Array<string | number>> = [validOaRow()]): FakeSheet {
  return createFakeSheet(SHEET_NAMES.oa, [[...OA_REQUIRED_HEADERS], ...rows]);
}

function makeErpSheet(rows: Array<Array<string | number>> = [validErpRow()]): FakeSheet {
  return createFakeSheet(SHEET_NAMES.erp, [[...ERP_REQUIRED_HEADERS], ...rows]);
}

function validOaRow(): Array<string | number> {
  return ["OA-001", "ERP-778", "2026/5/1", "数控", "生产", "仓储", "MAT-A", "物料A", 10, 100];
}

function validErpRow(): Array<string | number> {
  return ["ERP-778", "2026/5/2", "OA-001", "数控", "生产", "仓储", "MAT-A", "物料A", 9, 91];
}

function scatteredRequiredRow(values: Record<number, string | number>): Array<string | number> {
  const width = Math.max(...Object.keys(values).map(Number));
  return Array.from({ length: width }, (_, index) => values[index + 1] ?? "");
}

function blankScatteredRequiredRow(): Array<string> {
  return Array.from({ length: 29 }, () => "");
}

function visibleWrites(sheet: FakeSheet): Array<{ address: string; value: unknown }> {
  return sheet.writes.filter((write) => !write.address.startsWith("CB"));
}

function flattenWrites(sheet: FakeSheet): string[] {
  return visibleWrites(sheet).flatMap((write) =>
    Array.isArray(write.value) ? (write.value as OutputMatrix).flat().map(String) : [String(write.value)]
  );
}

function setActiveSheet(root: ScrapVarianceGlobal, sheet: WpsSheet): void {
  if (!root.Application) {
    throw new Error("missing fake application");
  }
  root.Application.ActiveSheet = sheet;
}

describe("current sheet query macro", () => {
  it("setupOutputSheets creates exactly three output sheets in order for an empty workbook", () => {
    const root = makeRoot([]);

    setupOutputSheets(root);

    expect(sheetNames(root)).toEqual([
      SHEET_NAMES.varianceSummary,
      SHEET_NAMES.oaDocCompare,
      SHEET_NAMES.erpDocCompare
    ]);
  });

  it("setupOutputSheets renames the old query panel to variance summary when summary is missing", () => {
    const oldPanel = createFakeSheet(SHEET_NAMES.panel);
    const root = makeRoot([oldPanel]);

    const summarySheet = setupOutputSheets(root);

    expect(summarySheet).toBe(oldPanel);
    expect(oldPanel.Name).toBe(SHEET_NAMES.varianceSummary);
    expect(sheetNames(root)).toEqual([
      SHEET_NAMES.varianceSummary,
      SHEET_NAMES.oaDocCompare,
      SHEET_NAMES.erpDocCompare
    ]);
  });

  it("setupOutputSheets renames the old detail output to variance summary when summary is missing", () => {
    const oldDetail = createFakeSheet(SHEET_NAMES.legacyDetailOutput);
    oldDetail.rangeValues.set("CB2:CG2", [
      ["数控", "生产", "仓储", "2026-05-01", "2026-05-31", QUERY_DIRECTIONS.erpSourceToOa]
    ]);
    const root = makeRoot([oldDetail]);

    const summarySheet = setupOutputSheets(root);

    expect(summarySheet).toBe(oldDetail);
    expect(oldDetail.Name).toBe(SHEET_NAMES.varianceSummary);
    expect(oldDetail.Range("CB2:CG2").Value2).toEqual([
      ["数控", "生产", "仓储", "2026-05-01", "2026-05-31", QUERY_DIRECTIONS.erpSourceToOa]
    ]);
    expect(sheetNames(root)).toEqual([
      SHEET_NAMES.varianceSummary,
      SHEET_NAMES.oaDocCompare,
      SHEET_NAMES.erpDocCompare
    ]);
  });

  it("runCurrentSheetQuery writes only OA document compare output for the active OA compare sheet", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    root.ScrapVarianceRibbonState = {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31"
    };
    setActiveSheet(root, oaCompareSheet);

    runCurrentSheetQuery(root);

    expect(visibleWrites(oaCompareSheet)).toEqual([
      {
        address: "A1:P2",
        value: [
          [...OA_DOC_COMPARE_HEADERS],
          ["汇总", "数控", "生产", "仓储", "2026-05-01", "OA-001", 10, 100, "ERP-778", 9, 91, 1, 9, "", "", ""]
        ]
      }
    ]);
    expect(oaCompareSheet.writes).toContainEqual({
      address: "CB1:CC1",
      value: [["oa_doc_compare", "A1:P2"]]
    });
    expect(detailSheet.writes).toEqual([]);
    expect(erpCompareSheet.writes).toEqual([]);
    expect(oaSheet.writes).toEqual([]);
    expect(erpSheet.writes).toEqual([]);
    expect(oaSheet.usedRangeValue2ReadCount).toBe(0);
    expect(erpSheet.usedRangeValue2ReadCount).toBe(0);
  });

  it("runCurrentSheetQuery treats blank department and date filters as all when only company is set", () => {
    const oaSheet = makeOaSheet([
      validOaRow(),
      ["OA-002", "ERP-999", "2026/4/1", "装备", "其他一级", "其他二级", "MAT-B", "物料B", 2, 20]
    ]);
    const erpSheet = makeErpSheet([
      validErpRow(),
      ["ERP-999", "2026/4/2", "OA-002", "装备", "其他一级", "其他二级", "MAT-B", "物料B", 2, 20]
    ]);
    const detailSheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    root.ScrapVarianceRibbonState = {
      company: "数控"
    };
    setActiveSheet(root, oaCompareSheet);

    runCurrentSheetQuery(root);

    const output = flattenWrites(oaCompareSheet);
    expect(output).toContain("数控");
    expect(output).toContain("OA-001");
    expect(output).not.toContain("装备");
    expect(output).not.toContain("查询条件没有匹配到 OA 数据。");
  });

  it("runCurrentSheetQuery ignores a stale bad ribbon direction for the active OA compare sheet", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    root.ScrapVarianceRibbonState = {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31",
      queryDirection: "坏方向" as typeof QUERY_DIRECTIONS.oaKingdeeToErp
    };
    setActiveSheet(root, oaCompareSheet);

    runCurrentSheetQuery(root);

    const output = flattenWrites(oaCompareSheet);
    expect(output).toContain("OA-001");
    expect(output).toContain("ERP-778");
    expect(output).not.toContain("查询方向不正确：请填写 OA金蝶单号查ERP 或 ERP源单查OA");
    expect(oaCompareSheet.writes).toContainEqual({
      address: "CB2:CG2",
      value: [["数控", "生产", "仓储", "2026-05-01", "2026-05-31", QUERY_DIRECTIONS.oaKingdeeToErp]]
    });
    expect(detailSheet.writes).toEqual([]);
    expect(erpCompareSheet.writes).toEqual([]);
  });

  it("runCurrentSheetQueryWithState ignores stale global ribbon filters", () => {
    const oaSheet = makeOaSheet([
      validOaRow(),
      ["OA-002", "ERP-999", "2026/4/1", "装备", "其他一级", "其他二级", "MAT-B", "物料B", 2, 20]
    ]);
    const erpSheet = makeErpSheet([
      validErpRow(),
      ["ERP-999", "2026/4/2", "OA-002", "装备", "其他一级", "其他二级", "MAT-B", "物料B", 2, 20]
    ]);
    const detailSheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    root.ScrapVarianceRibbonState = {
      company: "不存在公司",
      dept1: "旧一级部门",
      dept2: "旧二级部门",
      startDate: "2099/1/1",
      endDate: "2099/12/31"
    };
    setActiveSheet(root, oaCompareSheet);

    runCurrentSheetQueryWithState(root, {
      company: "数控",
      dept1: "",
      dept2: "",
      startDate: "",
      endDate: "",
      queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp
    });

    const output = flattenWrites(oaCompareSheet);
    expect(output).toContain("数控");
    expect(output).toContain("OA-001");
    expect(output).not.toContain("查询条件没有匹配到 OA 数据。");
    expect(oaCompareSheet.writes).toContainEqual({
      address: "CB2:CG2",
      value: [["数控", "", "", "", "", QUERY_DIRECTIONS.oaKingdeeToErp]]
    });
  });

  it("runCurrentSheetQueryWithState writes OA perspective variance summary for the active summary sheet", () => {
    const oaSheet = makeOaSheet([
      validOaRow(),
      ["OA-002", "ERP-MISSING", "2026/5/3", "数控", "生产", "仓储", "MAT-B", "物料B", 2, 20]
    ]);
    const erpSheet = makeErpSheet([validErpRow()]);
    const summarySheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, summarySheet, oaCompareSheet, erpCompareSheet]);
    setActiveSheet(root, summarySheet);

    runCurrentSheetQueryWithState(root, {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31",
      queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp
    });

    expect(visibleWrites(summarySheet)).toEqual([
      {
        address: "A1:O2",
        value: [
          [
            "公司简称",
            "一级部门",
            "二级部门",
            "查询视角",
            "主视角单据数",
            "已匹配单据数",
            "未匹配单据数",
            "有差异单据数",
            "OA数量合计",
            "ERP实发数量合计",
            "数量差额",
            "OA实际预算金额mx合计",
            "ERP总成本合计",
            "金额差额",
            "差异类型摘要"
          ],
          [
            "数控",
            "生产",
            "仓储",
            "OA视角",
            2,
            1,
            1,
            1,
            12,
            9,
            3,
            120,
            91,
            29,
            "OA有申请，ERP无出库、OA和ERP都有，但数量不同"
          ]
        ]
      }
    ]);
    expect(summarySheet.writes).toContainEqual({
      address: "CB1:CC1",
      value: [["variance_summary", "A1:O2"]]
    });
    expect(summarySheet.writes).toContainEqual({
      address: "CB2:CG2",
      value: [["数控", "生产", "仓储", "2026/5/1", "2026/5/31", QUERY_DIRECTIONS.oaKingdeeToErp]]
    });
    expect(oaCompareSheet.writes).toEqual([]);
    expect(erpCompareSheet.writes).toEqual([]);
  });

  it("runCurrentSheetQueryWithState writes ERP perspective variance summary for the active summary sheet", () => {
    const oaSheet = makeOaSheet([validOaRow()]);
    const erpSheet = makeErpSheet([
      validErpRow(),
      ["ERP-999", "2026/5/3", "OA-MISSING", "数控", "生产", "仓储", "MAT-B", "物料B", 3, 30]
    ]);
    const summarySheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, summarySheet, oaCompareSheet, erpCompareSheet]);
    setActiveSheet(root, summarySheet);

    runCurrentSheetQueryWithState(root, {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31",
      queryDirection: QUERY_DIRECTIONS.erpSourceToOa
    });

    const output = visibleWrites(summarySheet)[0]?.value;
    expect(output).toEqual([
      [
        "公司简称",
        "一级部门",
        "二级部门",
        "查询视角",
        "主视角单据数",
        "已匹配单据数",
        "未匹配单据数",
        "有差异单据数",
        "OA数量合计",
        "ERP实发数量合计",
        "数量差额",
        "OA实际预算金额mx合计",
        "ERP总成本合计",
        "金额差额",
        "差异类型摘要"
      ],
      [
        "数控",
        "生产",
        "仓储",
        "ERP视角",
        2,
        1,
        1,
        1,
        10,
        12,
        -2,
        100,
        121,
        -21,
        "ERP出库对应OA未在当前OA数据中找到、OA和ERP都有，但数量不同"
      ]
    ]);
    expect(summarySheet.writes).toContainEqual({
      address: "CB1:CC1",
      value: [["variance_summary", "A1:O2"]]
    });
  });

  it("runCurrentSheetQuery writes only ERP document compare output for the active ERP compare sheet", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    root.ScrapVarianceRibbonState = {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31"
    };
    setActiveSheet(root, erpCompareSheet);

    runCurrentSheetQuery(root);

    expect(visibleWrites(erpCompareSheet)).toEqual([
      {
        address: "A1:P2",
        value: [
          [...ERP_DOC_COMPARE_HEADERS],
          ["汇总", "数控", "生产", "仓储", "2026-05-02", "ERP-778", 9, 91, "OA-001", 10, 100, -1, -9, "", "", ""]
        ]
      }
    ]);
    expect(erpCompareSheet.writes).toContainEqual({
      address: "CB1:CC1",
      value: [["erp_doc_compare", "A1:P2"]]
    });
    expect(detailSheet.writes).toEqual([]);
    expect(oaCompareSheet.writes).toEqual([]);
    expect(oaSheet.writes).toEqual([]);
    expect(erpSheet.writes).toEqual([]);
  });

  it("runCurrentSheetQuery ignores a stale bad ribbon direction for the active ERP compare sheet", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    root.ScrapVarianceRibbonState = {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31",
      queryDirection: "坏方向" as typeof QUERY_DIRECTIONS.oaKingdeeToErp
    };
    setActiveSheet(root, erpCompareSheet);

    runCurrentSheetQuery(root);

    const output = flattenWrites(erpCompareSheet);
    expect(output).toContain("ERP-778");
    expect(output).toContain("OA-001");
    expect(output).not.toContain("查询方向不正确：请填写 OA金蝶单号查ERP 或 ERP源单查OA");
    expect(erpCompareSheet.writes).toContainEqual({
      address: "CB2:CG2",
      value: [["数控", "生产", "仓储", "2026-05-01", "2026-05-31", QUERY_DIRECTIONS.oaKingdeeToErp]]
    });
    expect(detailSheet.writes).toEqual([]);
    expect(oaCompareSheet.writes).toEqual([]);
  });

  it("runCurrentSheetQuery writes variance summary output for the active summary sheet and respects ribbon direction", () => {
    const oaSheet = makeOaSheet([
      ["OA-001", "ERP-778", "2026/4/1", "其他公司", "其他部门", "其他二级", "MAT-A", "物料A", 10, 100]
    ]);
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    root.ScrapVarianceRibbonState = {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31",
      queryDirection: QUERY_DIRECTIONS.erpSourceToOa
    };
    setActiveSheet(root, detailSheet);

    runCurrentSheetQuery(root);

    const output = flattenWrites(detailSheet);
    expect(visibleWrites(detailSheet).map((write) => write.address)).toEqual(["A1:O2"]);
    expect(output).toContain("查询视角");
    expect(output).toContain("主视角单据数");
    expect(output).toContain("ERP视角");
    expect(output).toContain("OA和ERP都有，但数量不同");
    expect(detailSheet.writes).toContainEqual({
      address: "CB1:CC1",
      value: [["variance_summary", "A1:O2"]]
    });
    expect(oaCompareSheet.writes).toEqual([]);
    expect(erpCompareSheet.writes).toEqual([]);
  });

  it("runCurrentSheetQuery clears legacy detail metadata when the migrated summary page is queried first time", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const summarySheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    summarySheet.rangeValues.set("CB1:CC1", [["legacy_detail", "A1:S6"]]);
    const root = makeRoot([oaSheet, erpSheet, summarySheet, oaCompareSheet, erpCompareSheet]);
    setActiveSheet(root, summarySheet);

    runCurrentSheetQueryWithState(root, {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31",
      queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp
    });

    expect(summarySheet.clears).toEqual(["A1:S6"]);
    expect(summarySheet.writes).toContainEqual({
      address: "CB1:CC1",
      value: [["variance_summary", "A1:O2"]]
    });
  });

  it("runCurrentSheetQuery can read scattered required columns without full UsedRange reads", () => {
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
        1: "OA-001",
        2: "ERP-778",
        3: "2026/5/1",
        13: "数控",
        14: "生产",
        15: "仓储",
        26: "MAT-A",
        27: "物料A",
        28: 10,
        29: 100
      }),
      ...Array.from({ length: 23 }, blankScatteredRequiredRow)
    ]);
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    root.ScrapVarianceRibbonState = { company: "数控" };
    setActiveSheet(root, oaCompareSheet);

    runCurrentSheetQuery(root);

    const output = flattenWrites(oaCompareSheet);
    expect(output).toContain("OA-001");
    expect(output).toContain("数控");
    expect(output).toContain("ERP-778");
    expect(output).not.toContain("查询条件没有匹配到 OA 数据。");
    expect(oaSheet.usedRangeValue2ReadCount).toBe(0);
    expect(erpSheet.usedRangeValue2ReadCount).toBe(0);
    expect(oaSheet.rangeReads).toContain("A1:AC20");
    expect(oaSheet.rangeReads).not.toContain("A1:AC25");
    expect(oaSheet.rangeReads).not.toContain("A1:AJ25");
    expect(oaSheet.rangeReads).toEqual(expect.arrayContaining(["A1:C25", "M1:O25", "Z1:AC25"]));
    expect(oaSheet.rangeReads.filter((address) => address !== "A1:AC20")).toEqual(["A1:C25", "M1:O25", "Z1:AC25"]);
  });

  it("runCurrentSheetQuery throws for unsupported active sheet without writing or clearing source sheet ranges", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const root = makeRoot([oaSheet, erpSheet]);
    setActiveSheet(root, oaSheet);

    expect(() => runCurrentSheetQuery(root)).toThrow(unsupportedOutputSheetMessage());
    expect(oaSheet.writes).toEqual([]);
    expect(oaSheet.clears).toEqual([]);
    expect(erpSheet.writes).toEqual([]);
    expect(erpSheet.clears).toEqual([]);
  });

  it("runCurrentSheetQuery clears previous output only on the active output sheet before a no-result message", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    oaCompareSheet.rangeValues.set("CB1:CC1", [["oa_doc_compare", "A1:P2"]]);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    root.ScrapVarianceRibbonState = {
      company: "不存在公司"
    };
    setActiveSheet(root, oaCompareSheet);

    runCurrentSheetQuery(root);

    expect(oaCompareSheet.clears).toEqual(["A1:P2"]);
    expect(detailSheet.clears).toEqual([]);
    expect(erpCompareSheet.clears).toEqual([]);
    expect(oaSheet.clears).toEqual([]);
    expect(erpSheet.clears).toEqual([]);
    expect(visibleWrites(oaCompareSheet)).toEqual([
      {
        address: "A1:A1",
        value: [["查询条件没有匹配到 OA 数据。"]]
      }
    ]);
    expect(oaCompareSheet.writes).toContainEqual({
      address: "CB1:CC1",
      value: [["oa_doc_compare", "A1:A1"]]
    });
  });

  it("toggleMaterialRows inserts material rows below the selected OA summary row", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    root.ScrapVarianceRibbonState = {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31"
    };
    setActiveSheet(root, oaCompareSheet);
    root.Application!.Selection = { Row: 2 };
    runCurrentSheetQuery(root);

    toggleMaterialRows(root);

    expect(oaCompareSheet.rowInserts).toEqual([{ afterRow: 2, rowCount: 1 }]);
    expect(visibleWrites(oaCompareSheet)).toContainEqual({
      address: "A3:P3",
      value: [
        [
          "物料",
          "数控",
          "生产",
          "仓储",
          "2026-05-01",
          "OA-001",
          10,
          100,
          "ERP-778",
          9,
          91,
          1,
          9,
          "MAT-A",
          "物料A",
          ""
        ]
      ]
    });
    expect(oaCompareSheet.writes).toContainEqual({
      address: "CB1:CC1",
      value: [["oa_doc_compare", "A1:P3"]]
    });
  });

  it("toggleMaterialRows inserts material rows below the selected ERP summary row", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    root.ScrapVarianceRibbonState = {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31"
    };
    setActiveSheet(root, erpCompareSheet);
    root.Application!.Selection = { Row: 2 };
    runCurrentSheetQuery(root);

    toggleMaterialRows(root);

    expect(erpCompareSheet.rowInserts).toEqual([{ afterRow: 2, rowCount: 1 }]);
    expect(visibleWrites(erpCompareSheet)).toContainEqual({
      address: "A3:P3",
      value: [
        [
          "物料",
          "数控",
          "生产",
          "仓储",
          "2026-05-02",
          "ERP-778",
          9,
          91,
          "OA-001",
          10,
          100,
          -1,
          -9,
          "MAT-A",
          "物料A",
          ""
        ]
      ]
    });
  });

  it("toggleMaterialRows deletes continuous material rows when the selected summary is expanded", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    setActiveSheet(root, oaCompareSheet);
    root.Application!.Selection = { Row: 2 };
    runCurrentSheetQuery(root);
    oaCompareSheet.rangeValues.set("A3:A3", [["物料"]]);
    oaCompareSheet.rangeValues.set("A4:A4", [["汇总"]]);
    oaCompareSheet.rangeValues.set("CB1:CC1", [["oa_doc_compare", "A1:P3"]]);

    toggleMaterialRows(root);

    expect(oaCompareSheet.rowDeletes).toEqual([{ startRow: 3, rowCount: 1 }]);
    expect(oaCompareSheet.writes).toContainEqual({
      address: "CB1:CC1",
      value: [["oa_doc_compare", "A1:P2"]]
    });
  });

  it("toggleMaterialRows rejects unsupported active sheets without touching source sheets", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const root = makeRoot([oaSheet, erpSheet]);
    setActiveSheet(root, oaSheet);

    expect(() => toggleMaterialRows(root)).toThrow(unsupportedOutputSheetMessage());
    expect(oaSheet.writes).toEqual([]);
    expect(oaSheet.clears).toEqual([]);
    expect(erpSheet.writes).toEqual([]);
    expect(erpSheet.clears).toEqual([]);
  });

  it("toggleMaterialRows rejects the variance summary sheet without clearing output", () => {
    const summarySheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const root = makeRoot([summarySheet]);
    setActiveSheet(root, summarySheet);

    expect(() => toggleMaterialRows(root)).toThrow("当前工作表不支持展开物料。");

    expect(summarySheet.clears).toEqual([]);
    expect(summarySheet.rowInserts).toEqual([]);
    expect(summarySheet.rowDeletes).toEqual([]);
  });

  it("toggleMaterialRows rejects non-summary selections without clearing existing output", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    setActiveSheet(root, oaCompareSheet);
    root.Application!.Selection = { Row: 1 };
    runCurrentSheetQuery(root);
    const writesBefore = [...oaCompareSheet.writes];

    expect(() => toggleMaterialRows(root)).toThrow("请选中行类型为 汇总 的单据行。");

    expect(oaCompareSheet.clears).toEqual([]);
    expect(oaCompareSheet.rowInserts).toEqual([]);
    expect(oaCompareSheet.rowDeletes).toEqual([]);
    expect(oaCompareSheet.writes).toEqual(writesBefore);
  });

  it("toggleMaterialRows rolls back inserted rows when material row writing fails", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    root.ScrapVarianceRibbonState = {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31"
    };
    setActiveSheet(root, oaCompareSheet);
    root.Application!.Selection = { Row: 2 };
    runCurrentSheetQuery(root);
    oaCompareSheet.failWriteAddresses.add("A3:P3");

    expect(() => toggleMaterialRows(root)).toThrow("分块写入失败：第 1 块 A3:P3");

    expect(oaCompareSheet.rowInserts).toEqual([{ afterRow: 2, rowCount: 1 }]);
    expect(oaCompareSheet.rowDeletes).toEqual([{ startRow: 3, rowCount: 1 }]);
    expect(oaCompareSheet.clears).toEqual([]);
    expect(visibleWrites(oaCompareSheet).map((write) => write.address)).toEqual(["A1:P2"]);
    expect(oaCompareSheet.rangeValues.get("CB1:CC1")).toEqual([["oa_doc_compare", "A1:P2"]]);
  });

  it("toggleMaterialRows rolls back inserted rows when metadata update fails after material writing succeeds", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    root.ScrapVarianceRibbonState = {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31"
    };
    setActiveSheet(root, oaCompareSheet);
    root.Application!.Selection = { Row: 2 };
    runCurrentSheetQuery(root);
    oaCompareSheet.failWriteAddresses.add("CB1:CC1");

    expect(() => toggleMaterialRows(root)).toThrow("分块写入失败：第 1 块 CB1:CC1");

    expect(oaCompareSheet.rowInserts).toEqual([{ afterRow: 2, rowCount: 1 }]);
    expect(oaCompareSheet.rowDeletes).toEqual([{ startRow: 3, rowCount: 1 }]);
    expect(oaCompareSheet.clears).toEqual([]);
    expect(visibleWrites(oaCompareSheet).map((write) => write.address)).toEqual(["A1:P2", "A3:P3"]);
    expect(oaCompareSheet.rangeValues.get("CB1:CC1")).toEqual([["oa_doc_compare", "A1:P2"]]);
  });

  it("toggleMaterialRows restores deleted material rows when collapse metadata update fails", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    root.ScrapVarianceRibbonState = {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31"
    };
    setActiveSheet(root, oaCompareSheet);
    root.Application!.Selection = { Row: 2 };
    runCurrentSheetQuery(root);
    toggleMaterialRows(root);
    oaCompareSheet.rangeValues.set("A4:A4", [["汇总"]]);
    oaCompareSheet.failWriteAddresses.add("CB1:CC1");

    expect(() => toggleMaterialRows(root)).toThrow("分块写入失败：第 1 块 CB1:CC1");

    expect(oaCompareSheet.rowDeletes).toEqual([{ startRow: 3, rowCount: 1 }]);
    expect(oaCompareSheet.rowInserts).toEqual([
      { afterRow: 2, rowCount: 1 },
      { afterRow: 2, rowCount: 1 }
    ]);
    const materialWrites = visibleWrites(oaCompareSheet).filter((write) => write.address === "A3:P3");
    expect(materialWrites).toHaveLength(2);
    expect(materialWrites[1]?.value).toEqual(materialWrites[0]?.value);
    expect(oaCompareSheet.clears).toEqual([]);
    expect(oaCompareSheet.rangeValues.get("CB1:CC1")).toEqual([["oa_doc_compare", "A1:P3"]]);
  });

  it("toggleMaterialRows uses the active output sheet query state after other pages change filters", () => {
    const oaSheet = makeOaSheet([
      validOaRow(),
      ["OA-002", "ERP-999", "2026/5/1", "装备", "生产", "仓储", "MAT-B", "物料B", 2, 20]
    ]);
    const erpSheet = makeErpSheet([
      validErpRow(),
      ["ERP-999", "2026/5/2", "OA-002", "装备", "生产", "仓储", "MAT-B", "物料B", 2, 20]
    ]);
    const detailSheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    root.ScrapVarianceRibbonState = {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31"
    };
    setActiveSheet(root, oaCompareSheet);
    root.Application!.Selection = { Row: 2 };
    runCurrentSheetQuery(root);

    root.ScrapVarianceRibbonState = {
      company: "装备",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31"
    };
    setActiveSheet(root, erpCompareSheet);
    runCurrentSheetQuery(root);
    setActiveSheet(root, oaCompareSheet);
    root.Application!.Selection = { Row: 2 };

    toggleMaterialRows(root);

    expect(visibleWrites(oaCompareSheet)).toContainEqual({
      address: "A3:P3",
      value: [
        [
          "物料",
          "数控",
          "生产",
          "仓储",
          "2026-05-01",
          "OA-001",
          10,
          100,
          "ERP-778",
          9,
          91,
          1,
          9,
          "MAT-A",
          "物料A",
          ""
        ]
      ]
    });
    expect(flattenWrites(oaCompareSheet)).not.toContain("MAT-B");
  });

  it("toggleMaterialRows rejects missing output query state instead of falling back to current ribbon filters", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    root.ScrapVarianceRibbonState = {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31"
    };
    setActiveSheet(root, oaCompareSheet);
    root.Application!.Selection = { Row: 2 };
    oaCompareSheet.rangeValues.set("A2:F2", [["汇总", "数控", "生产", "仓储", "2026-05-01", "OA-001"]]);
    oaCompareSheet.rangeValues.set("CB1:CC1", [["oa_doc_compare", "A1:P2"]]);

    expect(() => toggleMaterialRows(root)).toThrow("当前输出表缺少查询条件记录，请先在当前页重新执行查询。");

    expect(oaCompareSheet.rowInserts).toEqual([]);
    expect(oaCompareSheet.rowDeletes).toEqual([]);
    expect(oaCompareSheet.clears).toEqual([]);
  });
});
