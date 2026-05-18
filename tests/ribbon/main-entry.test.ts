import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportRuntimeError } from "../../src/main";
import { createRibbonHandlers, getControlId } from "../../src/ribbon/handlers";
import type { ScrapVarianceGlobal } from "../../src/types/wps";

const root = globalThis as ScrapVarianceGlobal;
let originalAlert: ScrapVarianceGlobal["alert"];
let originalConsole: ScrapVarianceGlobal["console"];

beforeEach(() => {
  originalAlert = root.alert;
  originalConsole = root.console;
  delete root.alert;
  delete root.console;
});

afterEach(() => {
  if (originalAlert) {
    root.alert = originalAlert;
  } else {
    delete root.alert;
  }

  if (originalConsole) {
    root.console = originalConsole;
  } else {
    delete root.console;
  }
});

describe("WPS ribbon entrypoint", () => {
  it("getControlId accepts WPS control id casing variants", () => {
    expect(getControlId({ Id: "btnPrecheck" })).toBe("btnPrecheck");
    expect(getControlId({ id: "btnInitQueryPanel" })).toBe("btnInitQueryPanel");
    expect(getControlId({ ID: "btnRunQuery" })).toBe("btnRunQuery");
    expect(getControlId({ Id: "btnPerformanceDiagnostics" })).toBe("btnPerformanceDiagnostics");
    expect(getControlId({})).toBe("");
  });

  it("createRibbonHandlers dispatches known ribbon buttons", () => {
    const runPrecheck = vi.fn();
    const setupQueryPanel = vi.fn();
    const runQuery = vi.fn();
    const runDiagnostics = vi.fn();
    const reportError = vi.fn();
    const ribbon = createRibbonHandlers({
      runPrecheck,
      setupQueryPanel,
      runQuery,
      runDiagnostics,
      reportError
    });

    ribbon.OnAction({ Id: "btnPrecheck" });
    ribbon.OnAction({ id: "btnInitQueryPanel" });
    ribbon.OnAction({ ID: "btnRunQuery" });
    ribbon.OnAction({ Id: "btnPerformanceDiagnostics" });

    expect(runPrecheck).toHaveBeenCalledOnce();
    expect(setupQueryPanel).toHaveBeenCalledOnce();
    expect(runQuery).toHaveBeenCalledOnce();
    expect(runDiagnostics).toHaveBeenCalledOnce();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("createRibbonHandlers reports unknown ribbon button errors", () => {
    const reportError = vi.fn();
    const ribbon = createRibbonHandlers({
      runPrecheck: vi.fn(),
      setupQueryPanel: vi.fn(),
      runQuery: vi.fn(),
      runDiagnostics: vi.fn(),
      reportError
    });

    ribbon.OnAction({ Id: "btnMissing" });

    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ message: expect.stringContaining("未知功能区按钮") }));
  });

  it("createRibbonHandlers does not throw when a dependency fails and reportError handles it", () => {
    const reportError = vi.fn();
    const ribbon = createRibbonHandlers({
      runPrecheck: () => {
        throw new Error("precheck failed");
      },
      setupQueryPanel: vi.fn(),
      runQuery: vi.fn(),
      runDiagnostics: vi.fn(),
      reportError
    });

    expect(() => ribbon.OnAction({ Id: "btnPrecheck" })).not.toThrow();
    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ message: "precheck failed" }));
  });

  it("OnAddinLoad stores ribbon UI on the provided root", () => {
    const root: ScrapVarianceGlobal = {};
    const ribbonUi = { invalidate: vi.fn() };
    const ribbon = createRibbonHandlers({
      root,
      runPrecheck: vi.fn(),
      setupQueryPanel: vi.fn(),
      runQuery: vi.fn(),
      runDiagnostics: vi.fn(),
      reportError: vi.fn()
    });

    ribbon.OnAddinLoad(ribbonUi);

    expect(root.ScrapVarianceRibbonUi).toBe(ribbonUi);
  });

  it("reportRuntimeError calls alert when alert is a function", () => {
    const alert = vi.fn();
    root.alert = alert;
    root.console = { error: vi.fn(), log: vi.fn() };

    reportRuntimeError(new Error("runtime failed"));

    expect(alert).toHaveBeenCalledWith("runtime failed");
    expect(root.console.error).not.toHaveBeenCalled();
  });

  it("reportRuntimeError falls back to console.error when alert is absent or not callable", () => {
    const consoleError = vi.fn();
    (root as { alert: unknown }).alert = "not callable";
    root.console = { error: consoleError, log: vi.fn() };

    reportRuntimeError("runtime failed");

    expect(consoleError).toHaveBeenCalledWith("runtime failed");
  });

  it("reportRuntimeError does not throw when alert and console.error are not callable", () => {
    (root as { alert: unknown }).alert = {};
    (root as { console: unknown }).console = { error: "not callable" };

    expect(() => reportRuntimeError(new Error("runtime failed"))).not.toThrow();
  });
});
