import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportRuntimeError } from "../../src/main";
import { createRibbonHandlers, getControlId } from "../../src/ribbon/handlers";
import { DEFAULT_RIBBON_STATE } from "../../src/ribbon/state";
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
    expect(getControlId({ id: "btnSetupOutputSheets" })).toBe("btnSetupOutputSheets");
    expect(getControlId({ ID: "btnQueryCurrentSheet" })).toBe("btnQueryCurrentSheet");
    expect(getControlId({ Id: "btnPerformanceDiagnostics" })).toBe("btnPerformanceDiagnostics");
    expect(getControlId({})).toBe("");
  });

  it("createRibbonHandlers dispatches known ribbon buttons and input callbacks", () => {
    const runPrecheck = vi.fn();
    const setupOutputSheets = vi.fn();
    const queryCurrentSheet = vi.fn();
    const toggleMaterialRows = vi.fn();
    const runDiagnostics = vi.fn();
    const reportError = vi.fn();
    const root: ScrapVarianceGlobal = {};
    const ribbon = createRibbonHandlers({
      root,
      runPrecheck,
      setupOutputSheets,
      queryCurrentSheet,
      toggleMaterialRows,
      runDiagnostics,
      reportError
    });

    ribbon.OnAction({ Id: "btnPrecheck" });
    ribbon.OnAction({ id: "btnSetupOutputSheets" });
    ribbon.OnAction({ ID: "btnQueryCurrentSheet" });
    ribbon.OnAction({ Id: "btnToggleMaterialRows" });
    ribbon.OnAction({ Id: "btnPerformanceDiagnostics" });
    ribbon.OnInputChange({ Id: "company" }, "数控");
    ribbon.OnInputChange({ Id: "dept1" }, "生产");
    ribbon.OnDirectionChange({ Id: "queryDirection" }, "1");

    expect(runPrecheck).toHaveBeenCalledOnce();
    expect(setupOutputSheets).toHaveBeenCalledOnce();
    expect(queryCurrentSheet).toHaveBeenCalledOnce();
    expect(toggleMaterialRows).toHaveBeenCalledOnce();
    expect(runDiagnostics).toHaveBeenCalledOnce();
    expect(root.ScrapVarianceRibbonState).toEqual(
      expect.objectContaining({
        company: "数控",
        dept1: "生产",
        queryDirection: "ERP源单查OA"
      })
    );
    expect(ribbon.GetDirectionCount({ Id: "queryDirection" })).toBe(2);
    expect(ribbon.GetDirectionLabel({ Id: "queryDirection" }, 0)).toBe("OA金蝶单号查ERP");
    expect(ribbon.GetDirectionSelectedIndex({ Id: "queryDirection" })).toBe(1);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("createRibbonHandlers accepts input values carried on the WPS control object", () => {
    const reportError = vi.fn();
    const root: ScrapVarianceGlobal = {};
    const ribbon = createRibbonHandlers({
      root,
      runPrecheck: vi.fn(),
      setupOutputSheets: vi.fn(),
      queryCurrentSheet: vi.fn(),
      toggleMaterialRows: vi.fn(),
      runDiagnostics: vi.fn(),
      reportError
    });

    ribbon.OnInputChange({ Id: "company", Text: " 波峰 " });
    ribbon.OnInputChange({ Id: "startDate", Value: "2026/1/1" });
    ribbon.OnInputChange({ Id: "endDate", text: "2026/5/1" });

    expect(root.ScrapVarianceRibbonState).toEqual(
      expect.objectContaining({
        company: "波峰",
        startDate: "2026/1/1",
        endDate: "2026/5/1"
      })
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  it("createRibbonHandlers exposes dedicated editBox callbacks when WPS only passes text", () => {
    const reportError = vi.fn();
    const root: ScrapVarianceGlobal = {};
    const ribbon = createRibbonHandlers({
      root,
      runPrecheck: vi.fn(),
      setupOutputSheets: vi.fn(),
      queryCurrentSheet: vi.fn(),
      toggleMaterialRows: vi.fn(),
      runDiagnostics: vi.fn(),
      reportError
    });
    const inputRibbon = ribbon as typeof ribbon & {
      OnCompanyChange(value: string): void;
      OnDept1Change(value: string): void;
      OnDept2Change(value: string): void;
      OnStartDateChange(value: string): void;
      OnEndDateChange(value: string): void;
    };

    inputRibbon.OnCompanyChange(" 数控 ");
    inputRibbon.OnDept1Change("硬件研发中心");
    inputRibbon.OnDept2Change("测试部");
    inputRibbon.OnStartDateChange("2026/1/1");
    inputRibbon.OnEndDateChange("2026/5/1");

    expect(root.ScrapVarianceRibbonState).toEqual(
      expect.objectContaining({
        company: "数控",
        dept1: "硬件研发中心",
        dept2: "测试部",
        startDate: "2026/1/1",
        endDate: "2026/5/1"
      })
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  it("createRibbonHandlers accepts direction selection carried on the WPS control object", () => {
    const reportError = vi.fn();
    const root: ScrapVarianceGlobal = {};
    const ribbon = createRibbonHandlers({
      root,
      runPrecheck: vi.fn(),
      setupOutputSheets: vi.fn(),
      queryCurrentSheet: vi.fn(),
      toggleMaterialRows: vi.fn(),
      runDiagnostics: vi.fn(),
      reportError
    });

    ribbon.OnDirectionChange({ Id: "queryDirection", selectedIndex: 1 });

    expect(root.ScrapVarianceRibbonState).toEqual(
      expect.objectContaining({
        queryDirection: "ERP源单查OA"
      })
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  it("createRibbonHandlers exposes a dedicated direction callback when WPS only passes selection", () => {
    const reportError = vi.fn();
    const root: ScrapVarianceGlobal = {};
    const ribbon = createRibbonHandlers({
      root,
      runPrecheck: vi.fn(),
      setupOutputSheets: vi.fn(),
      queryCurrentSheet: vi.fn(),
      toggleMaterialRows: vi.fn(),
      runDiagnostics: vi.fn(),
      reportError
    });
    const directionRibbon = ribbon as typeof ribbon & {
      OnQueryDirectionChange(value: number): void;
    };

    directionRibbon.OnQueryDirectionChange(1);

    expect(root.ScrapVarianceRibbonState).toEqual(
      expect.objectContaining({
        queryDirection: "ERP源单查OA"
      })
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  it("createRibbonHandlers reports unknown ribbon button errors", () => {
    const reportError = vi.fn();
    const ribbon = createRibbonHandlers({
      runPrecheck: vi.fn(),
      setupOutputSheets: vi.fn(),
      queryCurrentSheet: vi.fn(),
      toggleMaterialRows: vi.fn(),
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
      setupOutputSheets: vi.fn(),
      queryCurrentSheet: vi.fn(),
      toggleMaterialRows: vi.fn(),
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
      setupOutputSheets: vi.fn(),
      queryCurrentSheet: vi.fn(),
      toggleMaterialRows: vi.fn(),
      runDiagnostics: vi.fn(),
      reportError: vi.fn()
    });

    ribbon.OnAddinLoad(ribbonUi);

    expect(root.ScrapVarianceRibbonUi).toBe(ribbonUi);
  });

  it("OnAddinLoad resets stale ribbon filters so blank controls query all data", () => {
    const root: ScrapVarianceGlobal = {
      ScrapVarianceRibbonState: {
        company: "不存在公司",
        startDate: "2099/1/1",
        endDate: "2099/12/31"
      }
    };
    const ribbon = createRibbonHandlers({
      root,
      runPrecheck: vi.fn(),
      setupOutputSheets: vi.fn(),
      queryCurrentSheet: vi.fn(),
      toggleMaterialRows: vi.fn(),
      runDiagnostics: vi.fn(),
      reportError: vi.fn()
    });

    ribbon.OnAddinLoad({ invalidate: vi.fn() });

    expect(root.ScrapVarianceRibbonState).toEqual(DEFAULT_RIBBON_STATE);
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
