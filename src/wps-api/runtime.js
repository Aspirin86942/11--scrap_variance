(function attachScrapVarianceAddinRuntime(root) {
  function normalizeErrorMessage(error) {
    var utils = root.ScrapVarianceRuntimeUtils;

    if (utils && utils.normalizeErrorMessage) {
      return utils.normalizeErrorMessage(error);
    }
    if (error && error.message) {
      return error.message;
    }
    return String(error);
  }

  function showError(error) {
    var message = normalizeErrorMessage(error);

    if (typeof root.alert === "function") {
      root.alert(message);
      return;
    }
    if (root.console && root.console.error) {
      root.console.error(message);
    }
  }

  root.ScrapVarianceAddinRuntime = {
    showError: showError
  };
})(typeof window !== "undefined" ? window : this);
