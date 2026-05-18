import { describe, expect, it, vi } from "vitest";
import {
  createButtonActions,
  getButtonAction,
  runAllButtonActionTests,
  type ButtonActionRegistry
} from "../../src/actions/button-actions";

describe("button action registry", () => {
  it("builds one testable action for every WPS ribbon button", () => {
    const runners = {
      runPrecheck: vi.fn(),
      setupOutputSheets: vi.fn(),
      queryCurrentSheet: vi.fn(),
      queryCurrentSheetTest: vi.fn(),
      toggleMaterialRows: vi.fn(),
      runDiagnostics: vi.fn()
    };

    const actions = createButtonActions(runners);

    expect(Object.keys(actions)).toEqual([
      "btnPrecheck",
      "btnSetupOutputSheets",
      "btnQueryCurrentSheet",
      "btnToggleMaterialRows",
      "btnPerformanceDiagnostics"
    ]);
    expect(actions.btnPrecheck.name).toBe("runPrecheck");
    expect(actions.btnSetupOutputSheets.name).toBe("setupOutputSheets");
    expect(actions.btnQueryCurrentSheet.name).toBe("queryCurrentSheet");
    expect(actions.btnQueryCurrentSheet.test).toBe(runners.queryCurrentSheetTest);
    expect(actions.btnToggleMaterialRows.name).toBe("toggleMaterialRows");
    expect(actions.btnPerformanceDiagnostics.name).toBe("runDiagnostics");
  });

  it("runs every registered test action and returns structured results", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const actions: ButtonActionRegistry = {
      btnFirst: { name: "runFirst", run: first },
      btnSecond: { name: "runSecond", run: vi.fn(), test: second }
    };

    await expect(runAllButtonActionTests(actions)).resolves.toEqual([
      { name: "runFirst", ok: true, message: "完成" },
      { name: "runSecond", ok: true, message: "完成" }
    ]);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it("captures action failures without converting them into fake success", async () => {
    const actions: ButtonActionRegistry = {
      btnFail: {
        name: "runFail",
        run: () => {
          throw new Error("真实 WPS 上下文缺失");
        }
      }
    };

    await expect(runAllButtonActionTests(actions)).resolves.toEqual([
      { name: "runFail", ok: false, message: "真实 WPS 上下文缺失" }
    ]);
  });

  it("looks up actions by ribbon button id", () => {
    const action = { name: "runCheck", run: vi.fn() };

    expect(getButtonAction({ btnCheck: action }, "btnCheck")).toBe(action);
    expect(() => getButtonAction({ btnCheck: action }, "missing")).toThrow("未知功能区按钮：missing");
  });
});
