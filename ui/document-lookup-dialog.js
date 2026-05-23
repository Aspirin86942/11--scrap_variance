(function () {
  var RESULT_KEY = "ScrapVarianceDocumentLookupDialogResult";
  var INITIAL_KEY_PREFIX = "ScrapVarianceDocumentLookupInitialState:";
  var MODE_OA = "oa_form_number";
  var MODE_ERP = "erp_doc_number";
  var MAX_VISIBLE_OPTIONS = 30;
  var candidateSearch = window.__SCRAP_VARIANCE_CANDIDATE_SEARCH__;
  var hasSubmitted = false;
  var selectedCandidate = null;
  var dropdown = null;
  var suggestionSourcesByMode = {
    oa: { options: [], index: null },
    erp: { options: [], index: null }
  };

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
    return INITIAL_KEY_PREFIX + getToken();
  }

  function getStorage(showAlert) {
    var app = window.Application;
    if (!app || !app.PluginStorage) {
      if (showAlert !== false) {
        alert("当前 WPS 环境不支持 PluginStorage，无法提交查询。");
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

  function normalizeSuggestion(item) {
    var label;
    var docNumber;

    if (!item) {
      return null;
    }

    docNumber = item.docNumber == null ? "" : String(item.docNumber).trim();
    label = item.label == null ? "" : String(item.label).trim();
    if (!docNumber) {
      return null;
    }

    return {
      label: label || docNumber,
      docNumber: docNumber
    };
  }

  function normalizeSuggestions(input) {
    var normalized = [];
    var seen = {};
    var index;
    var suggestion;

    if (!input || typeof input.length !== "number") {
      return [];
    }

    for (index = 0; index < input.length; index += 1) {
      suggestion = normalizeSuggestion(input[index]);
      if (!suggestion || seen[suggestion.docNumber]) {
        continue;
      }
      seen[suggestion.docNumber] = true;
      normalized.push(suggestion);
    }
    return normalized;
  }

  function readInitialPayload() {
    var storage = getStorage(false);
    var token = getToken();
    var raw;
    var parsed;

    if (!storage || !token) {
      return null;
    }

    try {
      raw = storage.getItem(getInitialStateKey());
    } catch (error) {
      return null;
    }
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

  function buildSuggestionSource(suggestions) {
    var options = normalizeSuggestions(suggestions);
    var source = {
      options: options,
      index: null
    };

    if (candidateSearch && typeof candidateSearch.buildIndex === "function") {
      source.index = candidateSearch.buildIndex(options, function (suggestion) {
        return suggestion.docNumber;
      });
    }
    return source;
  }

  function readSuggestionSources() {
    var payload = readInitialPayload();
    var suggestions = payload && payload.suggestions ? payload.suggestions : {};

    return {
      oa: buildSuggestionSource(suggestions.oa),
      erp: buildSuggestionSource(suggestions.erp)
    };
  }

  function getMatchedSuggestionsFromSource(value, source) {
    var query = String(value || "").trim();
    var options = source && source.options && typeof source.options.length === "number" ? source.options : [];
    var matched = [];
    var index;
    var suggestion;

    if (
      source &&
      source.index &&
      candidateSearch &&
      typeof candidateSearch.searchIndex === "function"
    ) {
      return candidateSearch.searchIndex(source.index, query, MAX_VISIBLE_OPTIONS);
    }

    for (index = 0; index < options.length; index += 1) {
      suggestion = options[index];
      if (
        !query ||
        suggestion.docNumber.indexOf(query) !== -1
      ) {
        matched.push(suggestion);
      }
      if (matched.length >= MAX_VISIBLE_OPTIONS) {
        break;
      }
    }
    return matched;
  }

  function getMatchedSuggestions(value, suggestions) {
    return getMatchedSuggestionsFromSource(value, buildSuggestionSource(suggestions));
  }

  function getModeInputs() {
    return document.querySelectorAll('input[name="lookupMode"]');
  }

  function getLookupMode() {
    var inputs = getModeInputs();
    var index;
    for (index = 0; index < inputs.length; index += 1) {
      if (inputs[index].checked && inputs[index].value === MODE_ERP) {
        return MODE_ERP;
      }
    }
    return MODE_OA;
  }

  function suggestionsForMode(mode) {
    return mode === MODE_ERP ? suggestionSourcesByMode.erp : suggestionSourcesByMode.oa;
  }

  function createDropdown() {
    var element = document.createElement("div");
    element.className = "autocomplete-menu";
    element.setAttribute("role", "listbox");
    document.body.appendChild(element);
    return element;
  }

  function getDropdown() {
    if (!dropdown) {
      dropdown = createDropdown();
    }
    return dropdown;
  }

  function hideDropdown() {
    var element = getDropdown();
    element.style.display = "none";
    while (element.children && element.children.length) {
      element.removeChild(element.children[0]);
    }
  }

  function positionDropdown(input, element) {
    var rect = input.getBoundingClientRect();
    var pageX = window.pageXOffset || 0;
    var pageY = window.pageYOffset || 0;
    element.style.left = rect.left + pageX + "px";
    element.style.top = rect.bottom + pageY + "px";
    element.style.width = rect.width + "px";
  }

  function rememberSelectedCandidate(suggestion) {
    selectedCandidate = {
      mode: getLookupMode(),
      docNumber: suggestion.docNumber
    };
  }

  function renderSuggestions() {
    var input = document.getElementById("documentKeyword");
    var element;
    var options;
    var index;
    var option;

    if (!input) {
      return;
    }

    element = getDropdown();
    hideDropdown();
    options = getMatchedSuggestionsFromSource(input.value, suggestionsForMode(getLookupMode()));
    if (!options.length) {
      return;
    }

    for (index = 0; index < options.length; index += 1) {
      option = document.createElement("div");
      option.className = "autocomplete-option";
      option.setAttribute("role", "option");
      option.textContent = options[index].label;
      option.addEventListener("mousedown", (function (suggestion) {
        return function (event) {
          event.preventDefault();
          input.value = suggestion.docNumber;
          rememberSelectedCandidate(suggestion);
          hideDropdown();
        };
      })(options[index]));
      element.appendChild(option);
    }
    positionDropdown(input, element);
    element.style.display = "block";
  }

  function clearSelection() {
    selectedCandidate = null;
  }

  function isSelectedCandidateValid() {
    return (
      selectedCandidate &&
      selectedCandidate.mode === getLookupMode() &&
      selectedCandidate.docNumber === valueOf("documentKeyword")
    );
  }

  function writeResult(storage, payload, showAlert) {
    try {
      storage.setItem(RESULT_KEY, JSON.stringify(payload));
      return true;
    } catch (error) {
      if (showAlert !== false) {
        alert("单号查询结果写入失败，请关闭后重试。");
      }
      return false;
    }
  }

  function closeDialog() {
    if (typeof window.close === "function") {
      window.close();
    }
  }

  function submitResult(action, selection) {
    var storage = getStorage();
    var token = getToken();
    if (!storage) {
      return;
    }
    if (!token) {
      alert("查询弹窗缺少会话标识，请关闭后重新打开。");
      return;
    }

    if (!writeResult(
      storage,
      {
        token: token,
        action: action,
        selection: selection
      },
      true
    )) {
      return;
    }
    hasSubmitted = true;
    closeDialog();
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

    if (!writeResult(
      storage,
      {
        token: token,
        action: "cancel",
        selection: null
      },
      false
    )) {
      return;
    }
    hasSubmitted = true;
  }

  function initializeForm() {
    var input = document.getElementById("documentKeyword");
    var form = document.getElementById("lookupForm");
    var clear = document.getElementById("btnClear");
    var cancel = document.getElementById("btnCancel");
    var modeInputs = getModeInputs();
    var index;

    suggestionSourcesByMode = readSuggestionSources();

    if (input) {
      input.addEventListener("input", function () {
        clearSelection();
        renderSuggestions();
      });
      input.addEventListener("focus", renderSuggestions);
      input.addEventListener("blur", function () {
        window.setTimeout(function () {
          hideDropdown();
        }, 120);
      });
    }

    for (index = 0; index < modeInputs.length; index += 1) {
      modeInputs[index].addEventListener("change", function () {
        clearSelection();
        setValue("documentKeyword", "");
        hideDropdown();
      });
    }

    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!isSelectedCandidateValid()) {
          alert("请先从下拉候选中选择一个单号。");
          return;
        }
        submitResult("query", {
          mode: getLookupMode(),
          docNumber: selectedCandidate.docNumber
        });
      });
    }

    if (clear) {
      clear.addEventListener("click", function () {
        clearSelection();
        setValue("documentKeyword", "");
        hideDropdown();
      });
    }

    if (cancel) {
      cancel.addEventListener("click", function () {
        submitResult("cancel", null);
      });
    }

    window.addEventListener("beforeunload", writeCancelIfNeeded);
  }

  if (window.__SCRAP_VARIANCE_DOCUMENT_LOOKUP_DIALOG_TESTS__) {
    window.__SCRAP_VARIANCE_DOCUMENT_LOOKUP_DIALOG_TESTS__.getMatchedSuggestions = getMatchedSuggestions;
  }

  initializeForm();
})();
