import { describe, expect, it, vi } from "vitest";
import { createRibbonHandlers, getControlId } from "../../src/ribbon/handlers";
import type { ScrapVarianceGlobal } from "../../src/types/wps";

describe("WPS ribbon entrypoint", () => {
  it("getControlId accepts WPS control id casing variants", () => {
    expect(getControlId({ Id: "btnPrecheck" })).toBe("btnPrecheck");
    expect(getControlId({ id: "btnInitQueryPanel" })).toBe("btnInitQueryPanel");
    expect(getControlId({ ID: "btnRunQuery" })).toBe("btnRunQuery");
    expect(getControlId({})).toBe("");
  });

  it("createRibbonHandlers dispatches known ribbon buttons", () => {
    const runPrecheck = vi.fn();
    const setupQueryPanel = vi.fn();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    const ribbon = createRibbonHandlers({
      runPrecheck,
      setupQueryPanel,
      runQuery,
      reportError
    });

    ribbon.OnAction({ Id: "btnPrecheck" });
    ribbon.OnAction({ id: "btnInitQueryPanel" });
    ribbon.OnAction({ ID: "btnRunQuery" });

    expect(runPrecheck).toHaveBeenCalledOnce();
    expect(setupQueryPanel).toHaveBeenCalledOnce();
    expect(runQuery).toHaveBeenCalledOnce();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("createRibbonHandlers reports unknown ribbon button errors", () => {
    const reportError = vi.fn();
    const ribbon = createRibbonHandlers({
      runPrecheck: vi.fn(),
      setupQueryPanel: vi.fn(),
      runQuery: vi.fn(),
      reportError
    });

    ribbon.OnAction({ Id: "btnMissing" });

    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ message: expect.stringContaining("未知功能区按钮") }));
  });

  it("OnAddinLoad stores ribbon UI on the provided root", () => {
    const root: ScrapVarianceGlobal = {};
    const ribbonUi = { invalidate: vi.fn() };
    const ribbon = createRibbonHandlers({
      root,
      runPrecheck: vi.fn(),
      setupQueryPanel: vi.fn(),
      runQuery: vi.fn(),
      reportError: vi.fn()
    });

    ribbon.OnAddinLoad(ribbonUi);

    expect(root.ScrapVarianceRibbonUi).toBe(ribbonUi);
  });
});
