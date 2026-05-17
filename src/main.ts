import type { RibbonApi, ScrapVarianceGlobal } from "./types/wps";

function getRoot(): ScrapVarianceGlobal {
  return globalThis as ScrapVarianceGlobal;
}

function reportPlaceholder(message: string): void {
  const root = getRoot();

  if (root.alert) {
    root.alert(message);
    return;
  }

  if (root.console) {
    root.console.error(message);
  }
}

export function createRibbon(): RibbonApi {
  return {
    OnAddinLoad(ribbonUi: unknown): void {
      getRoot().ScrapVarianceRibbonUi = ribbonUi;
    },
    OnAction(): void {
      reportPlaceholder("加载项入口尚未完成：TypeScript 迁移骨架已加载，请继续完成后续任务。");
    }
  };
}

getRoot().ribbon = createRibbon();
