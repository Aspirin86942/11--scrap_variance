(function attachScrapVarianceRibbon(root) {
  function getControlId(control) {
    var source = control || {};

    return source.Id || source.id || source.ID || "";
  }

  function getMessage(error) {
    if (error && error.message) {
      return error.message;
    }
    return String(error);
  }

  function reportError(error) {
    var runtime = root.ScrapVarianceAddinRuntime;
    var message = getMessage(error);

    if (runtime && runtime.showError) {
      runtime.showError(error);
      return;
    }
    if (typeof root.alert === "function") {
      root.alert(message);
      return;
    }
    if (root.console && root.console.error) {
      root.console.error(message);
    }
  }

  function requireNamespace(namespace, functionName) {
    var target = root[namespace];

    if (!target || typeof target[functionName] !== "function") {
      throw new Error("加载项入口未就绪：" + namespace + "." + functionName);
    }
    return target[functionName];
  }

  function runPrecheck() {
    requireNamespace(
      "ScrapVariancePrecheck",
      "runScrapVariancePrecheck"
    )();
  }

  function initQueryPanel() {
    requireNamespace(
      "ScrapVarianceQuery",
      "setupQueryPanel"
    )();
  }

  function runQuery() {
    requireNamespace(
      "ScrapVarianceQuery",
      "runScrapVarianceQuery"
    )();
  }

  function onAction(control) {
    var id = getControlId(control);

    try {
      if (id === "btnPrecheck") {
        runPrecheck();
        return;
      }
      if (id === "btnInitQueryPanel") {
        initQueryPanel();
        return;
      }
      if (id === "btnRunQuery") {
        runQuery();
        return;
      }

      throw new Error("未知功能区按钮：" + id);
    } catch (error) {
      reportError(error);
    }
  }

  function onAddinLoad(ribbonUi) {
    root.ScrapVarianceRibbonUi = ribbonUi;
  }

  root.ribbon = {
    OnAddinLoad: onAddinLoad,
    OnAction: onAction
  };
})(typeof window !== "undefined" ? window : this);
