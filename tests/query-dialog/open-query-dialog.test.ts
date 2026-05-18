import { afterEach, describe, expect, it, vi } from "vitest";
import { QUERY_DIRECTIONS } from "../../src/core/query-direction";
import {
  QUERY_DIALOG_RESULT_KEY,
  openQueryDialogAndRun,
  pollQueryDialogResult
} from "../../src/query-dialog/open-query-dialog";
import type { ScrapVarianceGlobal } from "../../src/types/wps";

type ShowDialogMock = ReturnType<
  typeof vi.fn<(url: string, title: string, width: number, height: number, modal: boolean) => unknown>
>;

function makeRoot(): ScrapVarianceGlobal & {
  Application: NonNullable<ScrapVarianceGlobal["Application"]> & {
    PluginStorage: {
      values: Map<string, unknown>;
      getItem(key: string): unknown;
      setItem(key: string, value: unknown): void;
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
        }
      },
      ShowDialog: vi.fn<(url: string, title: string, width: number, height: number, modal: boolean) => unknown>()
    }
  };
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
