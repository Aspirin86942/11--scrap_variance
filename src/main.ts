import { runPerformanceDiagnostics } from "./macros/performance-diagnostics";
import { runCurrentSheetQuery, toggleMaterialRows } from "./macros/current-sheet-query";
import { setupOutputSheets } from "./macros/output-sheets";
import { runScrapVariancePrecheck } from "./macros/scrap-variance-precheck";
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

const root = globalThis as ScrapVarianceGlobal;

root.ribbon = createRibbonHandlers({
  root,
  runPrecheck: () => runScrapVariancePrecheck(root),
  setupOutputSheets: () => setupOutputSheets(root),
  queryCurrentSheet: () => runCurrentSheetQuery(root),
  toggleMaterialRows: () => toggleMaterialRows(root),
  runDiagnostics: () => runPerformanceDiagnostics(root),
  reportError: reportRuntimeError
});
