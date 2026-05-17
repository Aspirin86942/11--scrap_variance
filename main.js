"use strict";
(() => {
  // src/main.ts
  function getRoot() {
    return globalThis;
  }
  function createRibbon() {
    return {
      OnAddinLoad(ribbonUi) {
        getRoot().ScrapVarianceRibbonUi = ribbonUi;
      },
      OnAction() {
        throw new Error("ribbon handlers are not implemented yet");
      }
    };
  }
  getRoot().ribbon = createRibbon();
})();
