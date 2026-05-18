(function () {
  var RESULT_KEY = "ScrapVarianceQueryDialogResult";
  var DEFAULT_DIRECTION = "OA金蝶单号查ERP";
  var REVERSE_DIRECTION = "ERP源单查OA";

  function getToken() {
    return new URLSearchParams(window.location.search).get("token") || "";
  }

  function getStorage() {
    var app = window.Application;
    if (!app || !app.PluginStorage) {
      alert("当前 WPS 环境不支持 PluginStorage，无法提交查询条件。");
      return null;
    }
    return app.PluginStorage;
  }

  function valueOf(id) {
    var element = document.getElementById(id);
    return element && "value" in element ? String(element.value).trim() : "";
  }

  function setValue(id, value) {
    var element = document.getElementById(id);
    if (element && "value" in element) {
      element.value = value;
    }
  }

  function resetForm() {
    setValue("company", "");
    setValue("dept1", "");
    setValue("dept2", "");
    setValue("startDate", "");
    setValue("endDate", "");
    setValue("queryDirection", DEFAULT_DIRECTION);
  }

  function closeDialog() {
    if (typeof window.close === "function") {
      window.close();
    }
  }

  function submitResult(action, state) {
    var storage = getStorage();
    var token = getToken();
    if (!storage || !token) {
      alert("查询弹窗缺少会话标识，请关闭后重新打开。");
      return;
    }

    storage.setItem(
      RESULT_KEY,
      JSON.stringify({
        token: token,
        action: action,
        state: state || {}
      })
    );
    closeDialog();
  }

  document.getElementById("queryForm").addEventListener("submit", function (event) {
    event.preventDefault();
    submitResult("query", {
      company: valueOf("company"),
      dept1: valueOf("dept1"),
      dept2: valueOf("dept2"),
      startDate: valueOf("startDate"),
      endDate: valueOf("endDate"),
      queryDirection: valueOf("queryDirection") || DEFAULT_DIRECTION
    });
  });

  document.getElementById("btnClear").addEventListener("click", resetForm);
  document.getElementById("btnCancel").addEventListener("click", function () {
    submitResult("cancel", {});
  });

  resetForm();
})();
