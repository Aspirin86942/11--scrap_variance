import type { RibbonApi, RibbonControl, ScrapVarianceGlobal } from "../types/wps";

export interface RibbonDependencies {
  runPrecheck(): void;
  setupQueryPanel(): void;
  runQuery(): void;
  reportError(error: unknown): void;
  root?: ScrapVarianceGlobal;
}

export function getControlId(control: RibbonControl): string {
  return control.Id ?? control.id ?? control.ID ?? "";
}

export function createRibbonHandlers(dependencies: RibbonDependencies): RibbonApi {
  return {
    OnAddinLoad(ribbonUi: unknown): void {
      if (dependencies.root) {
        dependencies.root.ScrapVarianceRibbonUi = ribbonUi;
      }
    },
    OnAction(control: RibbonControl): void {
      try {
        const controlId = getControlId(control);

        switch (controlId) {
          case "btnPrecheck":
            dependencies.runPrecheck();
            return;
          case "btnInitQueryPanel":
            dependencies.setupQueryPanel();
            return;
          case "btnRunQuery":
            dependencies.runQuery();
            return;
          default:
            throw new Error(`未知功能区按钮：${controlId}`);
        }
      } catch (error) {
        dependencies.reportError(error);
      }
    }
  };
}
