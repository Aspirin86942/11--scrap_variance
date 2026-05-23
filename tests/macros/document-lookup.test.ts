import { afterEach, describe, expect, it, vi } from "vitest";
import { ERP_REQUIRED_HEADERS, OA_REQUIRED_HEADERS, SHEET_NAMES } from "../../src/constants";
import {
  DOCUMENT_LOOKUP_INITIAL_STATE_KEY_PREFIX,
  DOCUMENT_LOOKUP_DIALOG_RESULT_KEY
} from "../../src/query-dialog/open-document-lookup-dialog";
import type { OutputMatrix } from "../../src/types/scrap";
import type { ScrapVarianceGlobal } from "../../src/types/wps";
import { createFakeApplication, createFakeSheet, type FakeSheet } from "../wps-api/fakes";
import { runDocumentLookupWithSelection, startDocumentLookup } from "../../src/macros/document-lookup";

type ShowDialogMock = ReturnType<
  typeof vi.fn<(url: string, title: string, width: number, height: number, modal: boolean) => unknown>
>;

function makeRoot(sheets: FakeSheet[]): ScrapVarianceGlobal & {
  Application: NonNullable<ScrapVarianceGlobal["Application"]> & {
    PluginStorage: {
      values: Map<string, unknown>;
      getItem(key: string): unknown;
      setItem(key: string, value: unknown): void;
      removeItem(key: string): void;
    };
    ShowDialog: ShowDialogMock;
  };
} {
  const application = createFakeApplication(sheets);
  const values = new Map<string, unknown>();
  return {
    Application: {
      ...application,
      PluginStorage: {
        values,
        getItem(key: string): unknown {
          return values.get(key);
        },
        setItem(key: string, value: unknown): void {
          values.set(key, value);
        },
        removeItem(key: string): void {
          values.delete(key);
        }
      },
      ShowDialog: vi.fn<(url: string, title: string, width: number, height: number, modal: boolean) => unknown>()
    }
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

function outputMatrix(sheet: FakeSheet): OutputMatrix {
  return visibleWrites(sheet)[0]?.value as OutputMatrix;
}

function getResultSheet(root: ScrapVarianceGlobal): FakeSheet {
  const sheets = root.Application?.ActiveWorkbook?.Worksheets;
  if (!sheets) {
    throw new Error("missing fake worksheets");
  }

  for (let index = 1; index <= sheets.Count; index += 1) {
    const sheet = sheets.Item(index);
    if (sheet.Name === SHEET_NAMES.documentLookup) {
      return sheet as FakeSheet;
    }
  }
  throw new Error("missing document lookup result sheet");
}

function readInitialPayload(root: ReturnType<typeof makeRoot>): unknown {
  const storage = root.Application.PluginStorage.values;
  const key = [...storage.keys()].find((candidate) =>
    candidate.startsWith(DOCUMENT_LOOKUP_INITIAL_STATE_KEY_PREFIX)
  );
  if (!key) {
    throw new Error("missing initial payload");
  }
  return JSON.parse(String(storage.get(key)));
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("document lookup macro", () => {
  it("creates fixed result sheet and writes output", () => {
    const root = makeRoot([makeOaSheet(), makeErpSheet()]);

    runDocumentLookupWithSelection(root, { mode: "oa_form_number", docNumber: "OA-001" });

    const resultSheet = getResultSheet(root);
    expect(sheetNames(root)).toEqual([SHEET_NAMES.oa, SHEET_NAMES.erp, SHEET_NAMES.documentLookup]);
    expect(visibleWrites(resultSheet).map((write) => write.address)).toEqual(["A1:Z2"]);
    expect(outputMatrix(resultSheet)[0]?.[0]).toBe("行类型");
    expect(outputMatrix(resultSheet)[0]?.[25]).toBe("备注");
    expect(outputMatrix(resultSheet)[1]).toEqual(
      expect.arrayContaining(["物料", "查OA表单编号", "OA-001", "MAT-A", "物料A", 10, 100, 9, 91])
    );
    expect(resultSheet.writes).toContainEqual({
      address: "CB1:CC1",
      value: [["document_lookup", "A1:Z2"]]
    });
  });

  it("reuses fixed result sheet and clears previous document_lookup metadata range", () => {
    const resultSheet = createFakeSheet(SHEET_NAMES.documentLookup);
    resultSheet.rangeValues.set("CB1:CC1", [["document_lookup", "A1:Z9"]]);
    const root = makeRoot([makeOaSheet(), makeErpSheet(), resultSheet]);

    runDocumentLookupWithSelection(root, { mode: "erp_doc_number", docNumber: "ERP-778" });

    expect(sheetNames(root).filter((name) => name === SHEET_NAMES.documentLookup)).toHaveLength(1);
    expect(resultSheet.clears).toEqual(["A1:Z9"]);
    expect(visibleWrites(resultSheet).map((write) => write.address)).toEqual(["A1:Z2"]);
    expect(outputMatrix(resultSheet)[1]).toEqual(
      expect.arrayContaining(["物料", "查ERP单据编号", "ERP-778", "OA-001", "ERP-778"])
    );
    expect(resultSheet.writes).toContainEqual({
      address: "CB1:CC1",
      value: [["document_lookup", "A1:Z2"]]
    });
  });

  it("writes a prompt when selected document no longer exists", () => {
    const root = makeRoot([makeOaSheet(), makeErpSheet()]);

    runDocumentLookupWithSelection(root, { mode: "oa_form_number", docNumber: "OA-MISSING" });

    const resultSheet = getResultSheet(root);
    expect(visibleWrites(resultSheet)).toEqual([
      {
        address: "A1:B1",
        value: [["提示", "未找到OA表单编号：OA-MISSING"]]
      }
    ]);
    expect(resultSheet.writes).toContainEqual({
      address: "CB1:CC1",
      value: [["document_lookup", "A1:B1"]]
    });
  });

  it("opens the dialog with source-derived suggestions", () => {
    vi.useFakeTimers();
    const root = makeRoot([makeOaSheet(), makeErpSheet()]);
    const runLookup = vi.fn();
    const reportError = vi.fn();
    root.Application.PluginStorage.values.set(DOCUMENT_LOOKUP_DIALOG_RESULT_KEY, "old result");

    startDocumentLookup(root, reportError, runLookup);

    expect(root.Application.ShowDialog).toHaveBeenCalledOnce();
    expect(root.Application.ShowDialog.mock.calls[0]?.[1]).toBe("单号查询");
    expect(root.Application.PluginStorage.values.get(DOCUMENT_LOOKUP_DIALOG_RESULT_KEY)).toBe("");
    expect(readInitialPayload(root)).toEqual(
      expect.objectContaining({
        suggestions: {
          oa: [
            expect.objectContaining({
              mode: "oa_form_number",
              docNumber: "OA-001",
              label: expect.stringContaining("ERP: ERP-778")
            })
          ],
          erp: [
            expect.objectContaining({
              mode: "erp_doc_number",
              docNumber: "ERP-778",
              label: expect.stringContaining("OA: OA-001")
            })
          ]
        }
      })
    );
    expect(runLookup).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("throws before opening the dialog when source sheets are missing", () => {
    const root = makeRoot([makeErpSheet()]);
    const runLookup = vi.fn();
    const reportError = vi.fn();

    expect(() => startDocumentLookup(root, reportError, runLookup)).toThrow(
      `找不到工作表：${SHEET_NAMES.oa}`
    );

    expect(root.Application.ShowDialog).not.toHaveBeenCalled();
    expect(runLookup).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });
});
