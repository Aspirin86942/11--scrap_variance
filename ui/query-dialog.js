(function () {
  var RESULT_KEY = "ScrapVarianceQueryDialogResult";
  var DEFAULT_DIRECTION = "OA金蝶单号查ERP";
  var REVERSE_DIRECTION = "ERP源单查OA";
  var MAX_VISIBLE_OPTIONS = 30;
  var hasSubmitted = false;
  var autocompleteDropdowns = [];

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

  function readInitialPayload() {
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

    if (!parsed || parsed.token !== token) {
      return null;
    }
    return parsed;
  }

  function readInitialState() {
    var payload = readInitialPayload();
    return payload && payload.state ? payload.state : null;
  }

  function normalizeSuggestions(input) {
    var normalized = [];
    var seen = {};
    var index;
    var value;

    if (!input || typeof input.length !== "number") {
      return [];
    }

    for (index = 0; index < input.length; index += 1) {
      if (input[index] == null) {
        continue;
      }
      value = String(input[index]).trim();
      if (value && !seen[value]) {
        seen[value] = true;
        normalized.push(value);
      }
    }
    return normalized;
  }

  function readSuggestions() {
    var payload = readInitialPayload();
    var suggestions = payload && payload.suggestions ? payload.suggestions : {};

    return {
      company: normalizeSuggestions(suggestions.company),
      dept1: normalizeSuggestions(suggestions.dept1),
      dept2: normalizeSuggestions(suggestions.dept2)
    };
  }

  function getMatchedOptions(value, suggestions) {
    var query = String(value || "").trim();
    var options = normalizeSuggestions(suggestions);
    var matched = [];
    var index;

    for (index = 0; index < options.length; index += 1) {
      if (!query || options[index].indexOf(query) !== -1) {
        matched.push(options[index]);
      }
      if (matched.length >= MAX_VISIBLE_OPTIONS) {
        break;
      }
    }
    return matched;
  }

  function createAutocompleteDropdown() {
    var dropdown = document.createElement("div");
    dropdown.className = "autocomplete-menu";
    dropdown.setAttribute("role", "listbox");
    document.body.appendChild(dropdown);
    autocompleteDropdowns.push(dropdown);
    return dropdown;
  }

  function hideOtherAutocompleteDropdowns(activeDropdown) {
    var index;

    for (index = 0; index < autocompleteDropdowns.length; index += 1) {
      if (autocompleteDropdowns[index] !== activeDropdown) {
        hideAutocompleteDropdown(autocompleteDropdowns[index]);
      }
    }
  }

  function positionAutocompleteDropdown(input, dropdown) {
    var rect = input.getBoundingClientRect();
    var pageX = window.pageXOffset || 0;
    var pageY = window.pageYOffset || 0;
    dropdown.style.left = rect.left + pageX + "px";
    dropdown.style.top = rect.bottom + pageY + "px";
    dropdown.style.width = rect.width + "px";
  }

  function hideAutocompleteDropdown(dropdown) {
    dropdown.style.display = "none";
    while (dropdown.children && dropdown.children.length) {
      dropdown.removeChild(dropdown.children[0]);
    }
  }

  function renderAutocompleteOptions(dropdown, input, options) {
    var index;
    var option;

    hideOtherAutocompleteDropdowns(dropdown);
    hideAutocompleteDropdown(dropdown);
    if (!options.length) {
      return;
    }

    for (index = 0; index < options.length; index += 1) {
      option = document.createElement("div");
      option.className = "autocomplete-option";
      option.setAttribute("role", "option");
      option.textContent = options[index];
      option.addEventListener("mousedown", (function (selected) {
        return function (event) {
          event.preventDefault();
          input.value = selected;
          hideAutocompleteDropdown(dropdown);
        };
      })(options[index]));
      dropdown.appendChild(option);
    }
    positionAutocompleteDropdown(input, dropdown);
    dropdown.style.display = "block";
  }

  function attachAutocomplete(inputId, suggestions) {
    var input = document.getElementById(inputId);
    var options = normalizeSuggestions(suggestions);
    var dropdown;

    if (!input) {
      return;
    }

    dropdown = createAutocompleteDropdown();
    input.addEventListener("input", function () {
      renderAutocompleteOptions(dropdown, input, getMatchedOptions(input.value, options));
    });
    input.addEventListener("focus", function () {
      renderAutocompleteOptions(dropdown, input, getMatchedOptions(input.value, options));
    });
    input.addEventListener("blur", function () {
      window.setTimeout(function () {
        hideAutocompleteDropdown(dropdown);
      }, 120);
    });
  }

  function initializeAutocomplete() {
    var suggestions = readSuggestions();
    attachAutocomplete("company", suggestions.company);
    attachAutocomplete("dept1", suggestions.dept1);
    attachAutocomplete("dept2", suggestions.dept2);
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
    initializeAutocomplete();
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

  if (window.__SCRAP_VARIANCE_QUERY_DIALOG_TESTS__) {
    window.__SCRAP_VARIANCE_QUERY_DIALOG_TESTS__.normalizeSuggestions = normalizeSuggestions;
    window.__SCRAP_VARIANCE_QUERY_DIALOG_TESTS__.getMatchedOptions = getMatchedOptions;
    window.__SCRAP_VARIANCE_QUERY_DIALOG_TESTS__.attachAutocomplete = attachAutocomplete;
  }

  initializeForm();
})();
