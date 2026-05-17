import type { RibbonApi, ScrapVarianceGlobal } from "./types/wps";

function getRoot(): ScrapVarianceGlobal {
  return globalThis as ScrapVarianceGlobal;
}

export function createRibbon(): RibbonApi {
  return {
    OnAddinLoad(ribbonUi: unknown): void {
      getRoot().ScrapVarianceRibbonUi = ribbonUi;
    },
    OnAction(): void {
      throw new Error("ribbon handlers are not implemented yet");
    }
  };
}

getRoot().ribbon = createRibbon();
