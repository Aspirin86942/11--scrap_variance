import { runScrapVariancePrecheck } from "./macros/scrap-variance-precheck";
import { runScrapVarianceQuery } from "./macros/scrap-variance-query";
import { setupQueryPanel } from "./macros/setup-query-panel";
import { createRibbonHandlers } from "./ribbon/handlers";
import type { ScrapVarianceGlobal } from "./types/wps";

export function reportRuntimeError(error: unknown): void {
  const root = globalThis as ScrapVarianceGlobal;
  const message = error instanceof Error ? error.message : String(error);

  if (root.alert) {
    root.alert(message);
    return;
  }

  root.console?.error(message);
}

const root = globalThis as ScrapVarianceGlobal;

root.ribbon = createRibbonHandlers({
  root,
  runPrecheck: () => runScrapVariancePrecheck(root),
  setupQueryPanel: () => setupQueryPanel(root),
  runQuery: () => runScrapVarianceQuery(root),
  reportError: reportRuntimeError
});
