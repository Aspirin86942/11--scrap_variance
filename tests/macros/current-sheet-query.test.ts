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
import { runCurrentSheetQuery, toggleMaterialRows } from "../../src/macros/current-sheet-query";
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
      SHEET_NAMES.detailOutput,
      SHEET_NAMES.oaDocCompare,
      SHEET_NAMES.erpDocCompare
    ]);
  });

  it("setupOutputSheets renames the old query panel to detail output when detail output is missing", () => {
    const oldPanel = createFakeSheet(SHEET_NAMES.panel);
    const root = makeRoot([oldPanel]);

    const detailSheet = setupOutputSheets(root);

    expect(detailSheet).toBe(oldPanel);
    expect(oldPanel.Name).toBe(SHEET_NAMES.detailOutput);
    expect(sheetNames(root)).toEqual([
      SHEET_NAMES.detailOutput,
      SHEET_NAMES.oaDocCompare,
      SHEET_NAMES.erpDocCompare
    ]);
  });

  it("runCurrentSheetQuery writes only OA document compare output for the active OA compare sheet", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.detailOutput);
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
  });

  it("runCurrentSheetQuery writes only ERP document compare output for the active ERP compare sheet", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.detailOutput);
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

  it("runCurrentSheetQuery writes legacy detail output for the active detail sheet and respects ribbon direction", () => {
    const oaSheet = makeOaSheet([
      ["OA-001", "ERP-778", "2026/4/1", "其他公司", "其他部门", "其他二级", "MAT-A", "物料A", 10, 100]
    ]);
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.detailOutput);
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
    expect(visibleWrites(detailSheet).map((write) => write.address)).toEqual(["A1:S6"]);
    expect(output).toContain("汇总差异");
    expect(output).toContain("明细差异");
    expect(output).toContain("OA和ERP都有，但数量不同");
    expect(output).toContain("OA-001");
    expect(detailSheet.writes).toContainEqual({
      address: "CB1:CC1",
      value: [["legacy_detail", "A1:S6"]]
    });
    expect(oaCompareSheet.writes).toEqual([]);
    expect(erpCompareSheet.writes).toEqual([]);
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
    const detailSheet = makeOutputSheet(SHEET_NAMES.detailOutput);
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
    const detailSheet = makeOutputSheet(SHEET_NAMES.detailOutput);
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
    const detailSheet = makeOutputSheet(SHEET_NAMES.detailOutput);
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
    const detailSheet = makeOutputSheet(SHEET_NAMES.detailOutput);
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

  it("toggleMaterialRows rejects non-summary selections without clearing existing output", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.detailOutput);
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
    const detailSheet = makeOutputSheet(SHEET_NAMES.detailOutput);
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
    const detailSheet = makeOutputSheet(SHEET_NAMES.detailOutput);
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
    const detailSheet = makeOutputSheet(SHEET_NAMES.detailOutput);
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
    const detailSheet = makeOutputSheet(SHEET_NAMES.detailOutput);
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
});
