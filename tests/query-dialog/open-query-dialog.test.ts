import { afterEach, describe, expect, it, vi } from "vitest";
import { ERP_REQUIRED_HEADERS, OA_REQUIRED_HEADERS, SHEET_NAMES } from "../../src/constants";
import { QUERY_DIRECTIONS } from "../../src/core/query-direction";
import { unsupportedOutputSheetMessage } from "../../src/core/output-sheets";
import {
  QUERY_DIALOG_RESULT_KEY,
  openQueryDialogAndRun,
  pollQueryDialogResult
} from "../../src/query-dialog/open-query-dialog";
import type { ScrapVarianceGlobal } from "../../src/types/wps";
import { createFakeSheet } from "../wps-api/fakes";

type ShowDialogMock = ReturnType<
  typeof vi.fn<(url: string, title: string, width: number, height: number, modal: boolean) => unknown>
>;

function makeRoot(): ScrapVarianceGlobal & {
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
  const values = new Map<string, unknown>();
  return {
    Application: {
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
      ShowDialog: vi.fn<(url: string, title: string, width: number, height: number, modal: boolean) => unknown>(),
      ActiveSheet: createFakeSheet(SHEET_NAMES.detailOutput)
    }
  };
}

function readTokenFromShowDialog(root: ReturnType<typeof makeRoot>): string {
  const [url] = root.Application.ShowDialog.mock.calls[0] ?? [];
  return new URL(String(url)).searchParams.get("token") ?? "";
}

function attachSourceWorkbook(root: ReturnType<typeof makeRoot>): void {
  root.Application.ActiveWorkbook = {
    Worksheets: {
      Count: 2,
      Item(index: number) {
        return [
          createFakeSheet(SHEET_NAMES.oa, [
            [...OA_REQUIRED_HEADERS],
            ["OA-001", "ERP-001", "2026/5/1", "数控", "生产", "仓储", "MAT-A", "物料A", 1, 10]
          ]),
          createFakeSheet(SHEET_NAMES.erp, [
            [...ERP_REQUIRED_HEADERS],
            ["ERP-001", "2026/5/1", "OA-001", "装备", "售后", "维修", "MAT-A", "物料A", 1, 10]
          ])
        ][index - 1];
      },
      Add() {
        return createFakeSheet("Sheet");
      }
    }
  };
}

function initialStateStorageKey(token: string): string {
  return `ScrapVarianceQueryDialogInitialState:${token}`;
}

function readInitialPayload(root: ReturnType<typeof makeRoot>, token: string): unknown {
  return JSON.parse(String(root.Application.PluginStorage.values.get(initialStateStorageKey(token))));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("query dialog bridge", () => {
  it("opens the WPS query dialog with a tokenized URL", () => {
    vi.useFakeTimers();
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();

    openQueryDialogAndRun(root, runQuery, reportError);

    expect(root.Application.ShowDialog).toHaveBeenCalledOnce();
    expect(root.Application.ShowDialog.mock.contexts[0]).toBe(root.Application);
    const [url, title, width, height, modal] = root.Application.ShowDialog.mock.calls[0] ?? [];
    expect(String(url)).toContain("ui/query-dialog.html");
    expect(String(url)).toContain("token=");
    expect(title).toBe("报废差异查询条件");
    expect(width).toBeGreaterThanOrEqual(480);
    expect(height).toBeGreaterThanOrEqual(360);
    expect(modal).toBe(false);
    expect(runQuery).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
    vi.clearAllTimers();
  });

  it("passes the active output sheet kind to the dialog URL", () => {
    vi.useFakeTimers();
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    root.Application.ActiveSheet = {
      Name: SHEET_NAMES.oaDocCompare,
      Range: vi.fn()
    };

    openQueryDialogAndRun(root, runQuery, reportError);

    const [url] = root.Application.ShowDialog.mock.calls[0] ?? [];
    expect(new URL(String(url)).searchParams.get("outputKind")).toBe("oa_doc_compare");
    vi.clearAllTimers();
  });

  it("writes the current output sheet saved query state for the dialog token", () => {
    vi.useFakeTimers();
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    const sheet = createFakeSheet(SHEET_NAMES.oaDocCompare);
    sheet.rangeValues.set("CB2:CG2", [
      ["数控", "生产运营中心", "仓储部", "2026-01-01", "2026-04-27", QUERY_DIRECTIONS.oaKingdeeToErp]
    ]);
    root.Application.ActiveSheet = sheet;
    attachSourceWorkbook(root);

    openQueryDialogAndRun(root, runQuery, reportError);

    const token = readTokenFromShowDialog(root);
    expect(readInitialPayload(root, token)).toEqual({
      token,
      state: {
        company: "数控",
        dept1: "生产运营中心",
        dept2: "仓储部",
        startDate: "2026-01-01",
        endDate: "2026-04-27",
        queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp
      },
      suggestions: {
        company: ["数控", "装备"],
        dept1: ["生产", "售后"],
        dept2: ["仓储", "维修"]
      }
    });
    vi.clearAllTimers();
  });

  it("writes suggestions even when the current output sheet has no saved query state", () => {
    vi.useFakeTimers();
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    root.Application.ActiveSheet = createFakeSheet(SHEET_NAMES.oaDocCompare);
    attachSourceWorkbook(root);

    openQueryDialogAndRun(root, runQuery, reportError);

    const token = readTokenFromShowDialog(root);
    expect(readInitialPayload(root, token)).toEqual({
      token,
      suggestions: {
        company: ["数控", "装备"],
        dept1: ["生产", "售后"],
        dept2: ["仓储", "维修"]
      }
    });
    vi.clearAllTimers();
  });

  it("opens the query dialog with empty suggestions when source sheets are unavailable", () => {
    vi.useFakeTimers();
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    root.Application.ActiveSheet = createFakeSheet(SHEET_NAMES.oaDocCompare);

    openQueryDialogAndRun(root, runQuery, reportError);

    const token = readTokenFromShowDialog(root);
    expect(readInitialPayload(root, token)).toEqual({
      token,
      suggestions: {
        company: [],
        dept1: [],
        dept2: []
      }
    });
    vi.clearAllTimers();
  });

  it("rejects unsupported active sheets before opening the query dialog", () => {
    vi.useFakeTimers();
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    const sheet = createFakeSheet("临时查询条件");
    sheet.rangeValues.set("CB2:CG2", [
      ["数控", "生产运营中心", "仓储部", "2026-01-01", "2026-04-27", QUERY_DIRECTIONS.oaKingdeeToErp]
    ]);
    root.Application.ActiveSheet = sheet;

    expect(() => openQueryDialogAndRun(root, runQuery, reportError)).toThrow(unsupportedOutputSheetMessage());

    expect(root.Application.ShowDialog).not.toHaveBeenCalled();
    expect(root.Application.PluginStorage.values.size).toBe(0);
    expect(runQuery).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
    vi.clearAllTimers();
  });

  it("clears tokenized initial state when ShowDialog throws synchronously", () => {
    vi.useFakeTimers();
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    root.Application.ActiveSheet = createFakeSheet(SHEET_NAMES.oaDocCompare);
    root.Application.ShowDialog.mockImplementation(() => {
      throw new Error("ShowDialog failed");
    });
    attachSourceWorkbook(root);

    expect(() => openQueryDialogAndRun(root, runQuery, reportError)).toThrow("ShowDialog failed");

    const token = readTokenFromShowDialog(root);
    expect(root.Application.PluginStorage.values.get(initialStateStorageKey(token))).toBeUndefined();
    expect(root.Application.PluginStorage.values.get(QUERY_DIALOG_RESULT_KEY)).toBe("");
    expect(runQuery).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
    vi.clearAllTimers();
  });

  it("clears initial state after a submitted query result is consumed", () => {
    vi.useFakeTimers();
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    const sheet = createFakeSheet(SHEET_NAMES.oaDocCompare);
    sheet.rangeValues.set("CB2:CG2", [
      ["数控", "", "", "2026-01-01", "2026-04-27", QUERY_DIRECTIONS.oaKingdeeToErp]
    ]);
    root.Application.ActiveSheet = sheet;

    openQueryDialogAndRun(root, runQuery, reportError);
    const token = readTokenFromShowDialog(root);
    root.Application.PluginStorage.setItem(
      QUERY_DIALOG_RESULT_KEY,
      JSON.stringify({
        token,
        action: "query",
        state: {
          company: "数控",
          queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp
        }
      })
    );

    expect(pollQueryDialogResult(root, token, runQuery, reportError)).toBe(true);

    expect(root.Application.PluginStorage.values.get(initialStateStorageKey(token))).toBeUndefined();
    expect(runQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        company: "数控",
        queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp
      })
    );
    vi.clearAllTimers();
  });

  it("clears initial state after a cancel result is consumed", () => {
    vi.useFakeTimers();
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    const sheet = createFakeSheet(SHEET_NAMES.oaDocCompare);
    sheet.rangeValues.set("CB2:CG2", [
      ["数控", "", "", "2026-01-01", "2026-04-27", QUERY_DIRECTIONS.oaKingdeeToErp]
    ]);
    root.Application.ActiveSheet = sheet;

    openQueryDialogAndRun(root, runQuery, reportError);
    const token = readTokenFromShowDialog(root);
    root.Application.PluginStorage.setItem(QUERY_DIALOG_RESULT_KEY, JSON.stringify({ token, action: "cancel" }));

    expect(pollQueryDialogResult(root, token, runQuery, reportError)).toBe(true);

    expect(root.Application.PluginStorage.values.get(initialStateStorageKey(token))).toBeUndefined();
    expect(runQuery).not.toHaveBeenCalled();
    vi.clearAllTimers();
  });

  it("clears initial state when the opened dialog times out", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-19T00:00:00Z"));
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    const sheet = createFakeSheet(SHEET_NAMES.oaDocCompare);
    sheet.rangeValues.set("CB2:CG2", [
      ["数控", "", "", "2026-01-01", "2026-04-27", QUERY_DIRECTIONS.oaKingdeeToErp]
    ]);
    root.Application.ActiveSheet = sheet;

    openQueryDialogAndRun(root, runQuery, reportError);
    const token = readTokenFromShowDialog(root);
    vi.advanceTimersByTime(5 * 60 * 1000 + 250);

    expect(root.Application.PluginStorage.values.get(initialStateStorageKey(token))).toBeUndefined();
    expect(reportError).toHaveBeenCalledOnce();
  });

  it("reports a timeout when the opened dialog never returns a result", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-19T00:00:00Z"));
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();

    openQueryDialogAndRun(root, runQuery, reportError);
    vi.advanceTimersByTime(5 * 60 * 1000 + 250);

    expect(runQuery).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ message: expect.stringContaining("查询弹窗超时") }));
    expect(root.Application.PluginStorage.values.get(QUERY_DIALOG_RESULT_KEY)).toBe("");
  });

  it("pollQueryDialogResult runs a submitted matching-token query and clears storage", () => {
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    root.Application.PluginStorage.setItem(
      QUERY_DIALOG_RESULT_KEY,
      JSON.stringify({
        token: "token-1",
        action: "query",
        state: {
          company: " 数控 ",
          queryDirection: QUERY_DIRECTIONS.erpSourceToOa
        }
      })
    );

    expect(pollQueryDialogResult(root, "token-1", runQuery, reportError)).toBe(true);

    expect(runQuery).toHaveBeenCalledWith({
      company: "数控",
      dept1: "",
      dept2: "",
      startDate: "",
      endDate: "",
      queryDirection: QUERY_DIRECTIONS.erpSourceToOa
    });
    expect(root.Application.PluginStorage.values.get(QUERY_DIALOG_RESULT_KEY)).toBe("");
    expect(reportError).not.toHaveBeenCalled();
  });

  it("pollQueryDialogResult ignores stale tokens and handles canceled dialogs", () => {
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    root.Application.PluginStorage.setItem(
      QUERY_DIALOG_RESULT_KEY,
      JSON.stringify({ token: "other-token", action: "query", state: { company: "数控" } })
    );

    expect(pollQueryDialogResult(root, "token-1", runQuery, reportError)).toBe(false);
    expect(runQuery).not.toHaveBeenCalled();

    root.Application.PluginStorage.setItem(
      QUERY_DIALOG_RESULT_KEY,
      JSON.stringify({ token: "token-1", action: "cancel" })
    );
    expect(pollQueryDialogResult(root, "token-1", runQuery, reportError)).toBe(true);
    expect(runQuery).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("pollQueryDialogResult reports invalid submitted input without running query", () => {
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    root.Application.PluginStorage.setItem(
      QUERY_DIALOG_RESULT_KEY,
      JSON.stringify({
        token: "token-1",
        action: "query",
        state: {
          startDate: "2026/5/31",
          endDate: "2026/5/1"
        }
      })
    );

    expect(pollQueryDialogResult(root, "token-1", runQuery, reportError)).toBe(true);

    expect(runQuery).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ message: expect.stringContaining("开始日期不能晚于结束日期") })
    );
  });
});
