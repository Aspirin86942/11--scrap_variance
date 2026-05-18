import { createButtonActions, type ButtonActionRegistry } from "./actions/button-actions";
import { runPerformanceDiagnostics } from "./macros/performance-diagnostics";
import { runCurrentSheetQueryWithState, toggleMaterialRows } from "./macros/current-sheet-query";
import { setupOutputSheets } from "./macros/output-sheets";
import { runScrapVariancePrecheck } from "./macros/scrap-variance-precheck";
import { openQueryDialogAndRun } from "./query-dialog/open-query-dialog";
import { buildDefaultQueryDialogState } from "./query-dialog/state";
import { createRibbonHandlers } from "./ribbon/handlers";
import type { ScrapVarianceGlobal } from "./types/wps";

export function reportRuntimeError(error: unknown): void {
  const root = globalThis as ScrapVarianceGlobal;
  const message = error instanceof Error ? error.message : String(error);

  if (typeof root.alert === "function") {
    root.alert(message);
    return;
  }

  if (typeof root.console?.error === "function") {
    root.console.error(message);
  }
}

export function createDefaultButtonActions(root: ScrapVarianceGlobal): ButtonActionRegistry {
  return createButtonActions({
    runPrecheck: () => runScrapVariancePrecheck(root),
    setupOutputSheets: () => setupOutputSheets(root),
    queryCurrentSheet: () =>
      openQueryDialogAndRun(root, (state) => runCurrentSheetQueryWithState(root, state), reportRuntimeError),
    queryCurrentSheetTest: () => runCurrentSheetQueryWithState(root, buildDefaultQueryDialogState()),
    toggleMaterialRows: () => toggleMaterialRows(root),
    runDiagnostics: () => runPerformanceDiagnostics(root)
  });
}

export function createWpsRibbon(root: ScrapVarianceGlobal, buttonActions: ButtonActionRegistry) {
  return createRibbonHandlers({
    root,
    buttonActions,
    reportError: reportRuntimeError
  });
}
