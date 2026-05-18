import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ButtonActionRegistry } from "../../src/actions/button-actions";
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
  function makeButtonActions(overrides: Partial<ButtonActionRegistry> = {}): ButtonActionRegistry {
    return {
      btnPrecheck: { name: "runPrecheck", run: vi.fn() },
      btnSetupOutputSheets: { name: "setupOutputSheets", run: vi.fn() },
      btnQueryCurrentSheet: { name: "queryCurrentSheet", run: vi.fn() },
      btnToggleMaterialRows: { name: "toggleMaterialRows", run: vi.fn() },
      btnPerformanceDiagnostics: { name: "runDiagnostics", run: vi.fn() },
      ...overrides
    };
  }

  it("getControlId accepts WPS control id casing variants", () => {
    expect(getControlId({ Id: "btnPrecheck" })).toBe("btnPrecheck");
    expect(getControlId({ id: "btnSetupOutputSheets" })).toBe("btnSetupOutputSheets");
    expect(getControlId({ ID: "btnQueryCurrentSheet" })).toBe("btnQueryCurrentSheet");
    expect(getControlId({ Id: "btnPerformanceDiagnostics" })).toBe("btnPerformanceDiagnostics");
    expect(getControlId({})).toBe("");
  });

  it("createRibbonHandlers dispatches known ribbon buttons through registered actions", () => {
    const buttonActions = makeButtonActions();
    const reportError = vi.fn();
    const root: ScrapVarianceGlobal = {};
    const ribbon = createRibbonHandlers({
      root,
      buttonActions,
      reportError
    });

    ribbon.OnAction({ Id: "btnPrecheck" });
    ribbon.OnAction({ id: "btnSetupOutputSheets" });
    ribbon.OnAction({ ID: "btnQueryCurrentSheet" });
    ribbon.OnAction({ Id: "btnToggleMaterialRows" });
    ribbon.OnAction({ Id: "btnPerformanceDiagnostics" });

    expect(buttonActions.btnPrecheck.run).toHaveBeenCalledOnce();
    expect(buttonActions.btnSetupOutputSheets.run).toHaveBeenCalledOnce();
    expect(buttonActions.btnQueryCurrentSheet.run).toHaveBeenCalledOnce();
    expect(buttonActions.btnToggleMaterialRows.run).toHaveBeenCalledOnce();
    expect(buttonActions.btnPerformanceDiagnostics.run).toHaveBeenCalledOnce();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("createRibbonHandlers reports unknown ribbon button errors", () => {
    const reportError = vi.fn();
    const ribbon = createRibbonHandlers({
      buttonActions: makeButtonActions(),
      reportError
    });

    ribbon.OnAction({ Id: "btnMissing" });

    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ message: expect.stringContaining("未知功能区按钮") }));
  });

  it("createRibbonHandlers does not throw when a dependency fails and reportError handles it", () => {
    const reportError = vi.fn();
    const ribbon = createRibbonHandlers({
      buttonActions: makeButtonActions({
        btnPrecheck: {
          name: "runPrecheck",
          run: () => {
            throw new Error("precheck failed");
          }
        }
      }),
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
      buttonActions: makeButtonActions(),
      reportError: vi.fn()
    });

    ribbon.OnAddinLoad(ribbonUi);

    expect(root.ScrapVarianceRibbonUi).toBe(ribbonUi);
  });

  it("OnAddinLoad does not rewrite dialog query state", () => {
    const root: ScrapVarianceGlobal = {
      ScrapVarianceRibbonState: {
        company: "不存在公司",
        startDate: "2099/1/1",
        endDate: "2099/12/31"
      }
    };
    const ribbon = createRibbonHandlers({
      root,
      buttonActions: makeButtonActions(),
      reportError: vi.fn()
    });

    ribbon.OnAddinLoad({ invalidate: vi.fn() });

    expect(root.ScrapVarianceRibbonState).toEqual({
      company: "不存在公司",
      startDate: "2099/1/1",
      endDate: "2099/12/31"
    });
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
