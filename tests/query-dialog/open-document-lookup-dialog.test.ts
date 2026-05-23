import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentLookupSuggestions } from "../../src/core/document-lookup";
import {
  DOCUMENT_LOOKUP_DIALOG_RESULT_KEY,
  openDocumentLookupDialogAndRun,
  pollDocumentLookupDialogResult
} from "../../src/query-dialog/open-document-lookup-dialog";
import type { ScrapVarianceGlobal } from "../../src/types/wps";

type ShowDialogMock = ReturnType<
  typeof vi.fn<(url: string, title: string, width: number, height: number, modal: boolean) => unknown>
>;

function makeSuggestions(): DocumentLookupSuggestions {
  return {
    oa: [
      {
        mode: "oa_form_number",
        docNumber: "OA-001",
        label: "OA-001 | 2026-05-01 | 数控 | ERP: ERP-001"
      }
    ],
    erp: [
      {
        mode: "erp_doc_number",
        docNumber: "ERP-001",
        label: "ERP-001 | 2026-05-01 | 数控 | OA: OA-001"
      }
    ]
  };
}

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
      ShowDialog: vi.fn<(url: string, title: string, width: number, height: number, modal: boolean) => unknown>()
    }
  };
}

function readTokenFromShowDialog(root: ReturnType<typeof makeRoot>): string {
  const [url] = root.Application.ShowDialog.mock.calls[0] ?? [];
  return new URL(String(url)).searchParams.get("token") ?? "";
}

function initialStateStorageKey(token: string): string {
  return `ScrapVarianceDocumentLookupInitialState:${token}`;
}

function readInitialPayload(root: ReturnType<typeof makeRoot>, token: string): unknown {
  return JSON.parse(String(root.Application.PluginStorage.values.get(initialStateStorageKey(token))));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("document lookup dialog bridge", () => {
  it("opens the document lookup dialog with tokenized suggestions", () => {
    vi.useFakeTimers();
    const root = makeRoot();
    const suggestions = makeSuggestions();
    const runLookup = vi.fn();
    const reportError = vi.fn();
    root.Application.PluginStorage.values.set(
      DOCUMENT_LOOKUP_DIALOG_RESULT_KEY,
      JSON.stringify({
        token: "old-token",
        action: "query",
        selection: { mode: "oa_form_number", docNumber: "OA-OLD" }
      })
    );

    openDocumentLookupDialogAndRun(root, suggestions, runLookup, reportError);

    expect(root.Application.ShowDialog).toHaveBeenCalledOnce();
    expect(root.Application.ShowDialog.mock.contexts[0]).toBe(root.Application);
    const [url, title, width, height, modal] = root.Application.ShowDialog.mock.calls[0] ?? [];
    const token = new URL(String(url)).searchParams.get("token") ?? "";
    expect(String(url)).toContain("ui/document-lookup-dialog.html");
    expect(token).not.toBe("");
    expect(title).toBe("单号查询");
    expect(width).toBe(560);
    expect(height).toBe(300);
    expect(modal).toBe(false);
    expect(root.Application.PluginStorage.values.get(DOCUMENT_LOOKUP_DIALOG_RESULT_KEY)).toBe("");
    expect(readInitialPayload(root, token)).toEqual({ token, suggestions });
    expect(runLookup).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
    vi.clearAllTimers();
  });

  it("runs a submitted matching-token lookup and clears storage", () => {
    const root = makeRoot();
    const runLookup = vi.fn();
    const reportError = vi.fn();
    root.Application.PluginStorage.setItem(initialStateStorageKey("token-1"), "initial payload");
    root.Application.PluginStorage.setItem(
      DOCUMENT_LOOKUP_DIALOG_RESULT_KEY,
      JSON.stringify({
        token: "token-1",
        action: "query",
        selection: {
          mode: "oa_form_number",
          docNumber: " OA-001 "
        }
      })
    );

    expect(pollDocumentLookupDialogResult(root, "token-1", runLookup, reportError)).toBe(true);

    expect(runLookup).toHaveBeenCalledWith({
      mode: "oa_form_number",
      docNumber: "OA-001"
    });
    expect(root.Application.PluginStorage.values.get(initialStateStorageKey("token-1"))).toBeUndefined();
    expect(root.Application.PluginStorage.values.get(DOCUMENT_LOOKUP_DIALOG_RESULT_KEY)).toBe("");
    expect(reportError).not.toHaveBeenCalled();
  });

  it("ignores stale tokens and cancels without running lookup", () => {
    const root = makeRoot();
    const runLookup = vi.fn();
    const reportError = vi.fn();
    const staleResult = JSON.stringify({
      token: "other-token",
      action: "query",
      selection: { mode: "erp_doc_number", docNumber: "ERP-001" }
    });
    root.Application.PluginStorage.setItem(initialStateStorageKey("token-1"), "initial payload");
    root.Application.PluginStorage.setItem(DOCUMENT_LOOKUP_DIALOG_RESULT_KEY, staleResult);

    expect(pollDocumentLookupDialogResult(root, "token-1", runLookup, reportError)).toBe(false);

    expect(root.Application.PluginStorage.values.get(DOCUMENT_LOOKUP_DIALOG_RESULT_KEY)).toBe(staleResult);
    expect(root.Application.PluginStorage.values.get(initialStateStorageKey("token-1"))).toBe("initial payload");
    expect(runLookup).not.toHaveBeenCalled();

    root.Application.PluginStorage.setItem(
      DOCUMENT_LOOKUP_DIALOG_RESULT_KEY,
      JSON.stringify({ token: "token-1", action: "cancel", selection: null })
    );
    expect(pollDocumentLookupDialogResult(root, "token-1", runLookup, reportError)).toBe(true);

    expect(root.Application.PluginStorage.values.get(DOCUMENT_LOOKUP_DIALOG_RESULT_KEY)).toBe("");
    expect(root.Application.PluginStorage.values.get(initialStateStorageKey("token-1"))).toBeUndefined();
    expect(runLookup).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("ignores dirty result values without running lookup or clearing storage", () => {
    const dirtyValues: unknown[] = [
      123,
      "",
      "   ",
      "{",
      JSON.stringify({ action: "query", selection: { mode: "oa_form_number", docNumber: "OA-001" } }),
      JSON.stringify({ token: "token-1", action: "close", selection: { mode: "oa_form_number", docNumber: "OA-001" } })
    ];

    for (const dirtyValue of dirtyValues) {
      const root = makeRoot();
      const runLookup = vi.fn();
      const reportError = vi.fn();
      root.Application.PluginStorage.values.set(initialStateStorageKey("token-1"), "initial payload");
      root.Application.PluginStorage.values.set(DOCUMENT_LOOKUP_DIALOG_RESULT_KEY, dirtyValue);
      const setItemSpy = vi.spyOn(root.Application.PluginStorage, "setItem");
      const removeItemSpy = vi.spyOn(root.Application.PluginStorage, "removeItem");

      expect(pollDocumentLookupDialogResult(root, "token-1", runLookup, reportError)).toBe(false);

      expect(runLookup).not.toHaveBeenCalled();
      expect(reportError).not.toHaveBeenCalled();
      expect(root.Application.PluginStorage.values.get(DOCUMENT_LOOKUP_DIALOG_RESULT_KEY)).toBe(dirtyValue);
      expect(root.Application.PluginStorage.values.get(initialStateStorageKey("token-1"))).toBe("initial payload");
      expect(setItemSpy).not.toHaveBeenCalled();
      expect(removeItemSpy).not.toHaveBeenCalled();
    }
  });

  it("falls back to clearing tokenized initial state with setItem when removeItem is unavailable", () => {
    const root = makeRoot();
    const runLookup = vi.fn();
    const reportError = vi.fn();
    Object.defineProperty(root.Application.PluginStorage, "removeItem", {
      configurable: true,
      value: undefined
    });
    root.Application.PluginStorage.setItem(initialStateStorageKey("token-1"), "initial payload");
    root.Application.PluginStorage.setItem(
      DOCUMENT_LOOKUP_DIALOG_RESULT_KEY,
      JSON.stringify({
        token: "token-1",
        action: "query",
        selection: {
          mode: "erp_doc_number",
          docNumber: "ERP-001"
        }
      })
    );

    expect(pollDocumentLookupDialogResult(root, "token-1", runLookup, reportError)).toBe(true);

    expect(runLookup).toHaveBeenCalledWith({
      mode: "erp_doc_number",
      docNumber: "ERP-001"
    });
    expect(root.Application.PluginStorage.values.get(initialStateStorageKey("token-1"))).toBe("");
    expect(root.Application.PluginStorage.values.get(DOCUMENT_LOOKUP_DIALOG_RESULT_KEY)).toBe("");
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports invalid submitted selection without running lookup", () => {
    const root = makeRoot();
    const runLookup = vi.fn();
    const reportError = vi.fn();
    root.Application.PluginStorage.setItem(initialStateStorageKey("token-1"), "initial payload");
    root.Application.PluginStorage.setItem(
      DOCUMENT_LOOKUP_DIALOG_RESULT_KEY,
      JSON.stringify({
        token: "token-1",
        action: "query",
        selection: {
          mode: "oa_form_number",
          docNumber: "   "
        }
      })
    );

    expect(pollDocumentLookupDialogResult(root, "token-1", runLookup, reportError)).toBe(true);

    expect(runLookup).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ message: "单号查询结果无效：请重新选择单号。" })
    );
    expect(root.Application.PluginStorage.values.get(initialStateStorageKey("token-1"))).toBeUndefined();
    expect(root.Application.PluginStorage.values.get(DOCUMENT_LOOKUP_DIALOG_RESULT_KEY)).toBe("");
  });

  it("does not leak reportError failures while reporting an invalid submitted selection", () => {
    const root = makeRoot();
    const runLookup = vi.fn();
    const reportError = vi.fn(() => {
      throw new Error("report failed");
    });
    root.Application.PluginStorage.setItem(initialStateStorageKey("token-1"), "initial payload");
    root.Application.PluginStorage.setItem(
      DOCUMENT_LOOKUP_DIALOG_RESULT_KEY,
      JSON.stringify({
        token: "token-1",
        action: "query",
        selection: {
          mode: "oa_form_number",
          docNumber: "   "
        }
      })
    );

    expect(() => {
      expect(pollDocumentLookupDialogResult(root, "token-1", runLookup, reportError)).toBe(true);
    }).not.toThrow();

    expect(runLookup).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledOnce();
    expect(root.Application.PluginStorage.values.get(initialStateStorageKey("token-1"))).toBeUndefined();
    expect(root.Application.PluginStorage.values.get(DOCUMENT_LOOKUP_DIALOG_RESULT_KEY)).toBe("");
  });

  it("clears tokenized initial state when ShowDialog throws synchronously", () => {
    vi.useFakeTimers();
    const root = makeRoot();
    const suggestions = makeSuggestions();
    const runLookup = vi.fn();
    const reportError = vi.fn();
    root.Application.ShowDialog.mockImplementation(() => {
      throw new Error("ShowDialog failed");
    });

    expect(() => openDocumentLookupDialogAndRun(root, suggestions, runLookup, reportError)).toThrow(
      "ShowDialog failed"
    );

    const token = readTokenFromShowDialog(root);
    expect(root.Application.PluginStorage.values.get(initialStateStorageKey(token))).toBeUndefined();
    expect(root.Application.PluginStorage.values.get(DOCUMENT_LOOKUP_DIALOG_RESULT_KEY)).toBe("");
    expect(runLookup).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
    vi.clearAllTimers();
  });

  it("reports runLookup errors after consuming a valid result", () => {
    const root = makeRoot();
    const lookupError = new Error("lookup failed");
    const runLookup = vi.fn(() => {
      throw lookupError;
    });
    const reportError = vi.fn();
    root.Application.PluginStorage.setItem(initialStateStorageKey("token-1"), "initial payload");
    root.Application.PluginStorage.setItem(
      DOCUMENT_LOOKUP_DIALOG_RESULT_KEY,
      JSON.stringify({
        token: "token-1",
        action: "query",
        selection: { mode: "erp_doc_number", docNumber: "ERP-001" }
      })
    );

    expect(pollDocumentLookupDialogResult(root, "token-1", runLookup, reportError)).toBe(true);

    expect(reportError).toHaveBeenCalledWith(lookupError);
    expect(root.Application.PluginStorage.values.get(initialStateStorageKey("token-1"))).toBeUndefined();
    expect(root.Application.PluginStorage.values.get(DOCUMENT_LOOKUP_DIALOG_RESULT_KEY)).toBe("");
  });

  it("clears storage and reports timeout when the opened dialog never returns a result", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-23T00:00:00Z"));
    const root = makeRoot();
    const suggestions = makeSuggestions();
    const runLookup = vi.fn();
    const reportError = vi.fn();

    openDocumentLookupDialogAndRun(root, suggestions, runLookup, reportError);
    const token = readTokenFromShowDialog(root);
    vi.advanceTimersByTime(5 * 60 * 1000 + 250);

    expect(runLookup).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ message: "单号查询弹窗超时：没有收到查询或取消结果，请关闭弹窗后重试。" })
    );
    expect(root.Application.PluginStorage.values.get(initialStateStorageKey(token))).toBeUndefined();
    expect(root.Application.PluginStorage.values.get(DOCUMENT_LOOKUP_DIALOG_RESULT_KEY)).toBe("");
  });

  it("does not clear another token result when an older dialog times out", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-23T00:00:00Z"));
    const root = makeRoot();
    const suggestions = makeSuggestions();
    const runLookup = vi.fn();
    const reportError = vi.fn();

    openDocumentLookupDialogAndRun(root, suggestions, runLookup, reportError);
    const token = readTokenFromShowDialog(root);
    const otherTokenResult = JSON.stringify({
      token: "token-2",
      action: "query",
      selection: { mode: "erp_doc_number", docNumber: "ERP-001" }
    });
    root.Application.PluginStorage.values.set(DOCUMENT_LOOKUP_DIALOG_RESULT_KEY, otherTokenResult);

    vi.advanceTimersByTime(5 * 60 * 1000 + 250);

    expect(runLookup).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledOnce();
    expect(root.Application.PluginStorage.values.get(initialStateStorageKey(token))).toBeUndefined();
    expect(root.Application.PluginStorage.values.get(DOCUMENT_LOOKUP_DIALOG_RESULT_KEY)).toBe(otherTokenResult);
  });

  it("clears the polling interval when result cleanup fails while consuming a matching token", () => {
    vi.useFakeTimers();
    const root = makeRoot();
    const suggestions = makeSuggestions();
    const cleanupError = new Error("cleanup failed");
    const runLookup = vi.fn();
    const reportError = vi.fn();

    openDocumentLookupDialogAndRun(root, suggestions, runLookup, reportError);
    const token = readTokenFromShowDialog(root);
    root.Application.PluginStorage.values.set(
      DOCUMENT_LOOKUP_DIALOG_RESULT_KEY,
      JSON.stringify({
        token,
        action: "query",
        selection: { mode: "oa_form_number", docNumber: "OA-001" }
      })
    );
    root.Application.PluginStorage.setItem = vi.fn((key: string, value: unknown) => {
      if (key === DOCUMENT_LOOKUP_DIALOG_RESULT_KEY && value === "") {
        throw cleanupError;
      }
      root.Application.PluginStorage.values.set(key, value);
    });

    expect(() => vi.advanceTimersByTime(250)).not.toThrow();
    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledWith(cleanupError);
    expect(runLookup).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);

    expect(reportError).toHaveBeenCalledOnce();
    expect(runLookup).not.toHaveBeenCalled();
  });

  it("throws when PluginStorage is unavailable", () => {
    const root = {
      Application: {
        ShowDialog: vi.fn()
      }
    } satisfies ScrapVarianceGlobal;

    expect(() => openDocumentLookupDialogAndRun(root, makeSuggestions(), vi.fn(), vi.fn())).toThrow(
      "当前 WPS 环境不支持 PluginStorage，无法打开单号查询弹窗。"
    );
    expect(root.Application.ShowDialog).not.toHaveBeenCalled();
  });

  it("throws when ShowDialog is unavailable", () => {
    const values = new Map<string, unknown>();
    const root = {
      Application: {
        PluginStorage: {
          getItem(key: string): unknown {
            return values.get(key);
          },
          setItem(key: string, value: unknown): void {
            values.set(key, value);
          },
          removeItem(key: string): void {
            values.delete(key);
          }
        }
      }
    } satisfies ScrapVarianceGlobal;

    expect(() => openDocumentLookupDialogAndRun(root, makeSuggestions(), vi.fn(), vi.fn())).toThrow(
      "当前 WPS 环境不支持 ShowDialog，无法打开单号查询弹窗。"
    );
    expect(values.size).toBe(0);
  });
});
