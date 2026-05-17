"use strict";
(() => {
  // src/main.ts
  function getRoot() {
    return globalThis;
  }
  function reportPlaceholder(message) {
    const root = getRoot();
    if (root.alert) {
      root.alert(message);
      return;
    }
    if (root.console) {
      root.console.error(message);
    }
  }
  function createRibbon() {
    return {
      OnAddinLoad(ribbonUi) {
        getRoot().ScrapVarianceRibbonUi = ribbonUi;
      },
      OnAction() {
        reportPlaceholder("\u52A0\u8F7D\u9879\u5165\u53E3\u5C1A\u672A\u5B8C\u6210\uFF1ATypeScript \u8FC1\u79FB\u9AA8\u67B6\u5DF2\u52A0\u8F7D\uFF0C\u8BF7\u7EE7\u7EED\u5B8C\u6210\u540E\u7EED\u4EFB\u52A1\u3002");
      }
    };
  }
  getRoot().ribbon = createRibbon();
})();
