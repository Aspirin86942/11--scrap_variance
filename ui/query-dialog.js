(function () {
  var RESULT_KEY = "ScrapVarianceQueryDialogResult";
  var DEFAULT_DIRECTION = "OA金蝶单号查ERP";
  var REVERSE_DIRECTION = "ERP源单查OA";
  var hasSubmitted = false;

  function decodeQueryPart(value) {
    try {
      return decodeURIComponent(String(value).replace(/\+/g, " "));
    } catch (error) {
      return "";
    }
  }

  function getQueryParam(name) {
    var search = window.location && window.location.search ? String(window.location.search) : "";
    var query = search.charAt(0) === "?" ? search.slice(1) : search;
    var parts;
    var index;
    var pair;
    var key;

    if (!query) {
      return "";
    }

    parts = query.split("&");
    for (index = 0; index < parts.length; index += 1) {
      pair = parts[index].split("=");
      key = decodeQueryPart(pair[0]);
      if (key === name) {
        return decodeQueryPart(pair.slice(1).join("="));
      }
    }
    return "";
  }

  function getToken() {
    return getQueryParam("token");
  }

  function getInitialStateKey() {
    return "ScrapVarianceQueryDialogInitialState:" + getToken();
  }

  function getOutputKind() {
    return getQueryParam("outputKind");
  }

  function getStorage(showAlert) {
    var app = window.Application;
    if (!app || !app.PluginStorage) {
      if (showAlert !== false) {
        alert("当前 WPS 环境不支持 PluginStorage，无法提交查询条件。");
      }
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

  function stateValue(state, key) {
    if (!state || !Object.prototype.hasOwnProperty.call(state, key) || state[key] == null) {
      return "";
    }
    return String(state[key]);
  }

  function normalizeDirectionValue(value) {
    return value === REVERSE_DIRECTION ? REVERSE_DIRECTION : DEFAULT_DIRECTION;
  }

  function readInitialState() {
    var storage = getStorage(false);
    var token = getToken();
    var raw;
    var parsed;

    if (!storage || !token) {
      return null;
    }

    raw = storage.getItem(getInitialStateKey());
    if (typeof raw !== "string" || !raw.trim()) {
      return null;
    }

    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return null;
    }

    if (!parsed || parsed.token !== token || !parsed.state) {
      return null;
    }
    return parsed.state;
  }

  function getDirectionInputs() {
    return document.querySelectorAll('input[name="queryDirection"]');
  }

  function setQueryDirection(value) {
    var inputs = getDirectionInputs();
    var index;
    for (index = 0; index < inputs.length; index += 1) {
      inputs[index].checked = inputs[index].value === value;
    }
  }

  function getQueryDirection() {
    var inputs = getDirectionInputs();
    var index;
    for (index = 0; index < inputs.length; index += 1) {
      if (inputs[index].checked) {
        return inputs[index].value;
      }
    }
    return DEFAULT_DIRECTION;
  }

  function setDirectionEnabled(enabled) {
    var group = document.getElementById("queryDirectionGroup");
    var inputs = getDirectionInputs();
    var index;
    if (group) {
      if (enabled) {
        group.removeAttribute("disabled");
        group.className = "direction-group";
      } else {
        group.setAttribute("disabled", "disabled");
        group.className = "direction-group disabled";
      }
    }
    for (index = 0; index < inputs.length; index += 1) {
      inputs[index].disabled = !enabled;
    }
  }

  function isDirectionEditable() {
    var outputKind = getOutputKind();
    return !outputKind || outputKind === "legacy_detail";
  }

  function resetForm() {
    setValue("company", "");
    setValue("dept1", "");
    setValue("dept2", "");
    setValue("startDate", "");
    setValue("endDate", "");
    setQueryDirection(DEFAULT_DIRECTION);
  }

  function applyInitialState(state) {
    if (!state) {
      return;
    }

    setValue("company", stateValue(state, "company"));
    setValue("dept1", stateValue(state, "dept1"));
    setValue("dept2", stateValue(state, "dept2"));
    setValue("startDate", stateValue(state, "startDate"));
    setValue("endDate", stateValue(state, "endDate"));
    setQueryDirection(normalizeDirectionValue(stateValue(state, "queryDirection")));
  }

  function initializeForm() {
    resetForm();
    applyInitialState(readInitialState());
    setDirectionEnabled(isDirectionEditable());
  }

  function closeDialog() {
    if (typeof window.close === "function") {
      window.close();
    }
  }

  function writeCancelIfNeeded() {
    var storage;
    var token;
    if (hasSubmitted) {
      return;
    }

    storage = getStorage(false);
    token = getToken();
    if (!storage || !token) {
      return;
    }

    storage.setItem(
      RESULT_KEY,
      JSON.stringify({
        token: token,
        action: "cancel",
        state: {}
      })
    );
    hasSubmitted = true;
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
    hasSubmitted = true;
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
      queryDirection: getQueryDirection() || DEFAULT_DIRECTION
    });
  });

  document.getElementById("btnClear").addEventListener("click", resetForm);
  document.getElementById("btnCancel").addEventListener("click", function () {
    submitResult("cancel", {});
  });
  window.addEventListener("beforeunload", writeCancelIfNeeded);

  initializeForm();
})();
