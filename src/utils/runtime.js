(function attachScrapVarianceRuntimeUtils(root) {
  function normalizeErrorMessage(error) {
    if (error && error.message) {
      return error.message;
    }
    return String(error);
  }

  root.ScrapVarianceRuntimeUtils = {
    normalizeErrorMessage: normalizeErrorMessage
  };
})(typeof window !== "undefined" ? window : this);
