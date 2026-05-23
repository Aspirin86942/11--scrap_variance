import { createButtonActions, type ButtonActionRegistry } from "./actions/button-actions";
import { startDocumentLookup } from "./macros/document-lookup";
import { runPerformanceDiagnostics } from "./macros/performance-diagnostics";
import { runCurrentSheetQueryWithState, toggleMaterialRows } from "./macros/current-sheet-query";
import { setupOutputSheets } from "./macros/output-sheets";
import { isUserNotifiedError } from "./macros/query-feedback";
import { runScrapVariancePrecheck } from "./macros/scrap-variance-precheck";
import { openQueryDialogAndRun } from "./query-dialog/open-query-dialog";
import { createRibbonHandlers } from "./ribbon/handlers";
import type { ScrapVarianceGlobal } from "./types/wps";

export function reportRuntimeError(error: unknown): void {
  if (isUserNotifiedError(error)) {
    return;
  }

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
  // 这里集中声明功能区按钮能触发的业务动作，后续 ribbon 只负责按按钮 id 找到并执行 action。
  return createButtonActions({
    runPrecheck: () => runScrapVariancePrecheck(root),
    setupOutputSheets: () => setupOutputSheets(root),
    queryCurrentSheet: () =>
      openQueryDialogAndRun(root, (state) => runCurrentSheetQueryWithState(root, state), reportRuntimeError),
    lookupDocument: () => startDocumentLookup(root, reportRuntimeError),
    toggleMaterialRows: () => toggleMaterialRows(root),
    runDiagnostics: () => runPerformanceDiagnostics(root)
  });
}

export function createWpsRibbon(root: ScrapVarianceGlobal, buttonActions: ButtonActionRegistry) {
  // ribbon 回调需要 WPS 全局对象、按钮 registry 和统一报错入口，避免每个按钮重复写适配代码。
  return createRibbonHandlers({
    root,
    buttonActions,
    reportError: reportRuntimeError
  });
}
