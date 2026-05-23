# Candidate Search And Lookup Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared n-gram candidate-search helper for both WPS query dialogs, make document lookup output follow the queried side, and show completion/failure alerts with elapsed milliseconds.

**Architecture:** Keep WPS static dialog code dependency-free by adding one shared ES5-style `ui/candidate-search.js` global helper loaded before both dialog scripts. Keep core lookup data in OA/ERP fields and make only the worksheet matrix conversion choose left/right side by lookup type. Add a small TypeScript query-feedback helper at the macro boundary so result/error writes finish before `alert()` reports elapsed time.

**Tech Stack:** TypeScript, ES5-style static browser JavaScript, WPS JS object model, Vitest, esbuild, npm.

---

## File Structure

- Create `ui/candidate-search.js`
  - Shared static helper for candidate normalization, 2-gram indexing, and capped search.
  - Exposes `window.__SCRAP_VARIANCE_CANDIDATE_SEARCH__`.
  - Exposes test hooks through `window.__SCRAP_VARIANCE_CANDIDATE_SEARCH_TESTS__`.
- Create `tests/query-dialog/candidate-search-static.test.ts`
  - VM-based tests for the shared static helper.
- Modify `ui/query-dialog.html`
  - Load `candidate-search.js` before `query-dialog.js`.
- Modify `ui/query-dialog.js`
  - Use the shared helper to build an index once per autocomplete input.
  - Keep free-text behavior and existing token/state behavior.
- Modify `tests/query-dialog/static-autocomplete.test.ts`
  - Load the shared helper before `query-dialog.js`.
  - Add regression coverage for n-gram middle-substring matching.
- Modify `ui/document-lookup-dialog.html`
  - Load `candidate-search.js` before `document-lookup-dialog.js`.
- Modify `ui/document-lookup-dialog.js`
  - Use the shared helper to index only `docNumber`.
  - Keep `label` as display-only context.
- Modify `tests/query-dialog/document-lookup-static.test.ts`
  - Load the shared helper before `document-lookup-dialog.js`.
  - Lock doc-number-only search behavior.
- Modify `src/constants.ts`
  - Split document lookup headers into OA-left and ERP-left variants.
  - Keep `DOCUMENT_LOOKUP_HEADERS` as the OA-left alias if needed by existing callers.
- Modify `src/core/document-lookup.ts`
  - Choose headers and side value order by `lookupType`.
  - Display diff as left side minus right side.
- Modify `tests/core/document-lookup.test.ts`
  - Assert OA-left and ERP-left worksheet headers and row values.
- Modify `tests/macros/document-lookup.test.ts`
  - Assert the macro writes the new ERP-left output for ERP lookup.
- Create `src/macros/query-feedback.ts`
  - Format elapsed milliseconds and show success/failure messages through `alert()` with `console.error` fallback.
- Modify `src/macros/current-sheet-query.ts`
  - Time `runCurrentSheetQueryWithState()` after the dialog submits and notify success/failure after result/error write.
- Modify `src/macros/document-lookup.ts`
  - Time `runDocumentLookupWithSelection()` after the user selects a document and notify success/failure after result/error write.
- Modify `tests/macros/current-sheet-query.test.ts`
  - Assert success and failure alerts with elapsed milliseconds.
- Modify `tests/macros/document-lookup.test.ts`
  - Assert success and failure alerts with elapsed milliseconds.
- Modify `tests/build/build-output.test.ts`
  - Assert both static pages load `candidate-search.js`.
  - Assert the helper avoids Node-only and modern URL APIs.
- Modify `docs/wps-js-usage.md`
  - Document doc-number-only lookup search, dynamic left/right output, and completion/failure alerts.
- Regenerate `main.js`
  - Required because TypeScript macro behavior changes.

---

### Task 1: Shared Static Candidate Search Helper

**Files:**
- Create: `ui/candidate-search.js`
- Create: `tests/query-dialog/candidate-search-static.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `tests/query-dialog/candidate-search-static.test.ts`:

```ts
/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "..", "..");

interface CandidateSearchApi {
  normalizeStringValues(input: unknown): string[];
  buildIndex<T>(values: T[], getSearchText: (value: T) => string): unknown;
  searchIndex<T>(index: unknown, query: string, limit: number): T[];
}

function loadCandidateSearch(): CandidateSearchApi {
  const tests = {} as CandidateSearchApi;
  const windowObject = {
    __SCRAP_VARIANCE_CANDIDATE_SEARCH_TESTS__: tests
  };
  const context = vm.createContext({
    window: windowObject
  });

  vm.runInContext(readFileSync(resolve(repoRoot, "ui/candidate-search.js"), "utf-8"), context);

  return tests;
}

describe("static candidate search helper", () => {
  it("normalizes strings by trimming blanks and preserving first occurrence order", () => {
    const api = loadCandidateSearch();

    expect(api.normalizeStringValues([" 数控 ", "", "数控", null, "装备", "  ", "售后"])).toEqual([
      "数控",
      "装备",
      "售后"
    ]);
  });

  it("uses 2-gram search for middle substring matches while preserving original order", () => {
    const api = loadCandidateSearch();
    const index = api.buildIndex(["生产部门1", "质量中心", "生产部门2", "售后服务"], (value) => value);

    expect(api.searchIndex<string>(index, "产部", 30)).toEqual(["生产部门1", "生产部门2"]);
    expect(api.searchIndex<string>(index, "量中", 30)).toEqual(["质量中心"]);
  });

  it("caps empty and single-character searches without ranking or reordering", () => {
    const api = loadCandidateSearch();
    const values = Array.from({ length: 35 }, (_, index) => `生产部门${index + 1}`);
    const index = api.buildIndex(values, (value) => value);

    expect(api.searchIndex<string>(index, "", 30)).toEqual(values.slice(0, 30));
    expect(api.searchIndex<string>(index, "部", 30)).toEqual(values.slice(0, 30));
  });

  it("indexes only the caller-provided search text for object candidates", () => {
    const api = loadCandidateSearch();
    const values = [
      { docNumber: "OA-001", label: "OA-001 | 2026-05-01 | 数控 | ERP: ERP-778" },
      { docNumber: "OA-002", label: "OA-002 | 2026-05-02 | 装备 | ERP: ERP-999" }
    ];
    const index = api.buildIndex(values, (value) => value.docNumber);

    expect(api.searchIndex<typeof values[number]>(index, "A-00", 30).map((item) => item.docNumber)).toEqual([
      "OA-001",
      "OA-002"
    ]);
    expect(api.searchIndex<typeof values[number]>(index, "数控", 30)).toEqual([]);
    expect(api.searchIndex<typeof values[number]>(index, "ERP-778", 30)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the helper tests to verify they fail**

Run:

```bash
npm test -- tests/query-dialog/candidate-search-static.test.ts
```

Expected: FAIL because `ui/candidate-search.js` does not exist.

- [ ] **Step 3: Create the static helper**

Create `ui/candidate-search.js`:

```js
(function () {
  function normalizeSearchText(value) {
    if (value == null) {
      return "";
    }
    return String(value).trim();
  }

  function normalizeStringValues(input) {
    var normalized = [];
    var seen = {};
    var index;
    var value;

    if (!input || typeof input.length !== "number") {
      return [];
    }

    for (index = 0; index < input.length; index += 1) {
      value = normalizeSearchText(input[index]);
      if (value && !seen[value]) {
        seen[value] = true;
        normalized.push(value);
      }
    }
    return normalized;
  }

  function uniqueTwoGrams(text) {
    var grams = [];
    var seen = {};
    var index;
    var gram;

    for (index = 0; index < text.length - 1; index += 1) {
      gram = text.slice(index, index + 2);
      if (!seen[gram]) {
        seen[gram] = true;
        grams.push(gram);
      }
    }
    return grams;
  }

  function buildIndex(values, getSearchText) {
    var items = [];
    var gramToIndexes = {};
    var valueIndex;
    var searchText;
    var itemIndex;
    var grams;
    var gramIndex;
    var gram;

    if (!values || typeof values.length !== "number") {
      return {
        items: [],
        gramToIndexes: {}
      };
    }

    for (valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
      searchText = normalizeSearchText(getSearchText(values[valueIndex]));
      if (!searchText) {
        continue;
      }
      itemIndex = items.length;
      items.push({
        value: values[valueIndex],
        searchText: searchText
      });
      grams = uniqueTwoGrams(searchText);
      for (gramIndex = 0; gramIndex < grams.length; gramIndex += 1) {
        gram = grams[gramIndex];
        if (!gramToIndexes[gram]) {
          gramToIndexes[gram] = [];
        }
        gramToIndexes[gram].push(itemIndex);
      }
    }

    return {
      items: items,
      gramToIndexes: gramToIndexes
    };
  }

  function singleCharacterSearch(items, query, limit) {
    var result = [];
    var index;

    for (index = 0; index < items.length; index += 1) {
      if (items[index].searchText.indexOf(query) !== -1) {
        result.push(items[index].value);
      }
      if (result.length >= limit) {
        break;
      }
    }
    return result;
  }

  function candidateCountsFor(postings) {
    var counts = {};
    var postingIndex;
    var list;
    var index;
    var itemIndex;

    for (postingIndex = 0; postingIndex < postings.length; postingIndex += 1) {
      list = postings[postingIndex];
      if (!list.length) {
        return null;
      }
      for (index = 0; index < list.length; index += 1) {
        itemIndex = list[index];
        counts[itemIndex] = (counts[itemIndex] || 0) + 1;
      }
    }
    return counts;
  }

  function searchIndex(index, rawQuery, limit) {
    var query = normalizeSearchText(rawQuery);
    var max = typeof limit === "number" && limit > 0 ? limit : 30;
    var items = index && index.items ? index.items : [];
    var gramToIndexes = index && index.gramToIndexes ? index.gramToIndexes : {};
    var grams;
    var postings = [];
    var gramIndex;
    var counts;
    var result = [];
    var itemIndex;
    var item;

    if (!query) {
      for (itemIndex = 0; itemIndex < items.length && result.length < max; itemIndex += 1) {
        result.push(items[itemIndex].value);
      }
      return result;
    }

    if (query.length === 1) {
      return singleCharacterSearch(items, query, max);
    }

    grams = uniqueTwoGrams(query);
    for (gramIndex = 0; gramIndex < grams.length; gramIndex += 1) {
      postings.push(gramToIndexes[grams[gramIndex]] || []);
    }
    counts = candidateCountsFor(postings);
    if (!counts) {
      return [];
    }

    for (itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      if (counts[itemIndex] !== postings.length) {
        continue;
      }
      item = items[itemIndex];
      if (item.searchText.indexOf(query) !== -1) {
        result.push(item.value);
      }
      if (result.length >= max) {
        break;
      }
    }
    return result;
  }

  window.__SCRAP_VARIANCE_CANDIDATE_SEARCH__ = {
    normalizeSearchText: normalizeSearchText,
    normalizeStringValues: normalizeStringValues,
    buildIndex: buildIndex,
    searchIndex: searchIndex
  };

  if (window.__SCRAP_VARIANCE_CANDIDATE_SEARCH_TESTS__) {
    window.__SCRAP_VARIANCE_CANDIDATE_SEARCH_TESTS__.normalizeStringValues = normalizeStringValues;
    window.__SCRAP_VARIANCE_CANDIDATE_SEARCH_TESTS__.buildIndex = buildIndex;
    window.__SCRAP_VARIANCE_CANDIDATE_SEARCH_TESTS__.searchIndex = searchIndex;
  }
})();
```

- [ ] **Step 4: Run the helper tests to verify they pass**

Run:

```bash
npm test -- tests/query-dialog/candidate-search-static.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add ui/candidate-search.js tests/query-dialog/candidate-search-static.test.ts
git commit -m "feat: add static candidate search index"
```

Expected: commit succeeds.

---

### Task 2: Query Condition Dialog Uses Candidate Index

**Files:**
- Modify: `ui/query-dialog.html`
- Modify: `ui/query-dialog.js`
- Modify: `tests/query-dialog/static-autocomplete.test.ts`
- Modify: `tests/build/build-output.test.ts`

- [ ] **Step 1: Write failing query-dialog tests**

In `tests/query-dialog/static-autocomplete.test.ts`, update `loadQueryDialog()` so it loads the helper before the dialog script:

```ts
  vm.runInContext(readFileSync(resolve(repoRoot, "ui/candidate-search.js"), "utf-8"), context);
  vm.runInContext(readFileSync(resolve(repoRoot, "ui/query-dialog.js"), "utf-8"), context);
```

Replace the single existing `vm.runInContext(readFileSync(resolve(repoRoot, "ui/query-dialog.js"), "utf-8"), context);` line with the two lines above.

Add this test inside `describe("static query dialog autocomplete", () => { ... })`:

```ts
  it("uses the shared n-gram index for middle substring autocomplete", () => {
    const { hooks } = loadQueryDialog();
    const suggestions = ["生产部门1", "质量中心", "生产部门2", "售后服务"];

    expect(hooks.getMatchedOptions("产部", suggestions)).toEqual(["生产部门1", "生产部门2"]);
    expect(hooks.getMatchedOptions("量中", suggestions)).toEqual(["质量中心"]);
  });
```

In `tests/build/build-output.test.ts`, inside `ships the static query dialog pages`, add:

```ts
    const candidateSearchScript = readText("ui/candidate-search.js");
```

Add these assertions near the query HTML assertions:

```ts
    expect(queryHtml).toContain('src="./candidate-search.js"');
    expect(queryHtml.indexOf('src="./candidate-search.js"')).toBeLessThan(queryHtml.indexOf('src="./query-dialog.js"'));
```

Add these assertions near the static script assertions:

```ts
    expect(candidateSearchScript).toContain("__SCRAP_VARIANCE_CANDIDATE_SEARCH__");
    expect(candidateSearchScript).not.toContain("URLSearchParams");
    expect(candidateSearchScript).not.toContain("require(");
    expect(candidateSearchScript).not.toContain("process.");
```

- [ ] **Step 2: Run query-dialog tests to verify they fail**

Run:

```bash
npm test -- tests/query-dialog/static-autocomplete.test.ts tests/build/build-output.test.ts
```

Expected: FAIL because `query-dialog.html` does not load `candidate-search.js`, and `query-dialog.js` still searches with per-call normalization and linear scanning.

- [ ] **Step 3: Load the helper in query dialog HTML**

In `ui/query-dialog.html`, replace:

```html
    <script src="./query-dialog.js"></script>
```

with:

```html
    <script src="./candidate-search.js"></script>
    <script src="./query-dialog.js"></script>
```

- [ ] **Step 4: Use the helper from `ui/query-dialog.js`**

In `ui/query-dialog.js`, after `var autocompleteDropdowns = [];`, add:

```js
  var candidateSearch = window.__SCRAP_VARIANCE_CANDIDATE_SEARCH__;
```

Replace the existing `normalizeSuggestions(input)` body with:

```js
  function normalizeSuggestions(input) {
    if (candidateSearch && typeof candidateSearch.normalizeStringValues === "function") {
      return candidateSearch.normalizeStringValues(input);
    }

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
```

Add these functions below `readSuggestions()`:

```js
  function buildAutocompleteSource(suggestions) {
    var options = normalizeSuggestions(suggestions);

    if (candidateSearch && typeof candidateSearch.buildIndex === "function") {
      return {
        options: options,
        index: candidateSearch.buildIndex(options, function (option) {
          return option;
        })
      };
    }

    return {
      options: options,
      index: null
    };
  }

  function getMatchedOptionsFromSource(value, source) {
    var query = String(value || "").trim();
    var matched = [];
    var index;

    if (source.index && candidateSearch && typeof candidateSearch.searchIndex === "function") {
      return candidateSearch.searchIndex(source.index, query, MAX_VISIBLE_OPTIONS);
    }

    for (index = 0; index < source.options.length; index += 1) {
      if (!query || source.options[index].indexOf(query) !== -1) {
        matched.push(source.options[index]);
      }
      if (matched.length >= MAX_VISIBLE_OPTIONS) {
        break;
      }
    }
    return matched;
  }
```

Replace the existing `getMatchedOptions(value, suggestions)` body with:

```js
  function getMatchedOptions(value, suggestions) {
    return getMatchedOptionsFromSource(value, buildAutocompleteSource(suggestions));
  }
```

In `attachAutocomplete(inputId, suggestions)`, replace:

```js
    var options = normalizeSuggestions(suggestions);
    var dropdown;
```

with:

```js
    var source = buildAutocompleteSource(suggestions);
    var dropdown;
```

In the `input` and `focus` event handlers, replace `getMatchedOptions(input.value, options)` with:

```js
getMatchedOptionsFromSource(input.value, source)
```

- [ ] **Step 5: Run query-dialog tests to verify they pass**

Run:

```bash
npm test -- tests/query-dialog/static-autocomplete.test.ts tests/build/build-output.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add ui/query-dialog.html ui/query-dialog.js tests/query-dialog/static-autocomplete.test.ts tests/build/build-output.test.ts
git commit -m "feat: index query dialog candidates"
```

Expected: commit succeeds.

---

### Task 3: Document Lookup Dialog Searches Only Doc Numbers

**Files:**
- Modify: `ui/document-lookup-dialog.html`
- Modify: `ui/document-lookup-dialog.js`
- Modify: `tests/query-dialog/document-lookup-static.test.ts`
- Modify: `tests/build/build-output.test.ts`

- [ ] **Step 1: Write failing document lookup dialog tests**

In `tests/query-dialog/document-lookup-static.test.ts`, update `loadDocumentLookupDialog()` so it loads the helper before the dialog script:

```ts
  vm.runInContext(readFileSync(resolve(repoRoot, "ui/candidate-search.js"), "utf-8"), context);
  vm.runInContext(readFileSync(resolve(repoRoot, "ui/document-lookup-dialog.js"), "utf-8"), context);
```

Replace the single existing `vm.runInContext(readFileSync(resolve(repoRoot, "ui/document-lookup-dialog.js"), "utf-8"), context);` line with the two lines above.

Replace the test named `filters matched suggestions by substring` with:

```ts
  it("filters matched suggestions by docNumber substring only", () => {
    const { hooks } = loadDocumentLookupDialog();
    const suggestions = [
      { label: "OA 报废申请 OA-001 | 2026-05-01 | 数控 | ERP: ERP-001", docNumber: "OA-001" },
      { label: "ERP 入库单 | 数控", docNumber: "ERP-001" },
      { label: "OA 报废申请 OA-002 | 2026-05-02 | 装备 | ERP: ERP-002", docNumber: "OA-002" }
    ];

    expect(hooks.getMatchedSuggestions("001", suggestions)).toEqual([
      { label: "OA 报废申请 OA-001 | 2026-05-01 | 数控 | ERP: ERP-001", docNumber: "OA-001" },
      { label: "ERP 入库单 | 数控", docNumber: "ERP-001" }
    ]);
    expect(hooks.getMatchedSuggestions("A-00", suggestions).map((item) => item.docNumber)).toEqual([
      "OA-001",
      "OA-002"
    ]);
    expect(hooks.getMatchedSuggestions("数控", suggestions)).toEqual([]);
    expect(hooks.getMatchedSuggestions("2026-05-01", suggestions)).toEqual([]);
    expect(hooks.getMatchedSuggestions("ERP-002", suggestions)).toEqual([]);
  });
```

In `tests/build/build-output.test.ts`, add these assertions near lookup HTML assertions:

```ts
    expect(lookupHtml).toContain('src="./candidate-search.js"');
    expect(lookupHtml.indexOf('src="./candidate-search.js"')).toBeLessThan(
      lookupHtml.indexOf('src="./document-lookup-dialog.js"')
    );
```

- [ ] **Step 2: Run document lookup static tests to verify they fail**

Run:

```bash
npm test -- tests/query-dialog/document-lookup-static.test.ts tests/build/build-output.test.ts
```

Expected: FAIL because `document-lookup-dialog.html` does not load `candidate-search.js`, and the script still matches `label`.

- [ ] **Step 3: Load the helper in document lookup HTML**

In `ui/document-lookup-dialog.html`, replace:

```html
    <script src="./document-lookup-dialog.js"></script>
```

with:

```html
    <script src="./candidate-search.js"></script>
    <script src="./document-lookup-dialog.js"></script>
```

- [ ] **Step 4: Use doc-number-only indexes in `ui/document-lookup-dialog.js`**

After `var dropdown = null;`, add:

```js
  var candidateSearch = window.__SCRAP_VARIANCE_CANDIDATE_SEARCH__;
```

Replace `suggestionsByMode` with:

```js
  var suggestionSourcesByMode = {
    oa: { options: [], index: null },
    erp: { options: [], index: null }
  };
```

Add these functions below `readSuggestions()`:

```js
  function buildSuggestionSource(suggestions) {
    var options = normalizeSuggestions(suggestions);

    if (candidateSearch && typeof candidateSearch.buildIndex === "function") {
      return {
        options: options,
        index: candidateSearch.buildIndex(options, function (suggestion) {
          return suggestion.docNumber;
        })
      };
    }

    return {
      options: options,
      index: null
    };
  }

  function getMatchedSuggestionsFromSource(value, source) {
    var query = String(value || "").trim();
    var matched = [];
    var index;
    var suggestion;

    if (source.index && candidateSearch && typeof candidateSearch.searchIndex === "function") {
      return candidateSearch.searchIndex(source.index, query, MAX_VISIBLE_OPTIONS);
    }

    for (index = 0; index < source.options.length; index += 1) {
      suggestion = source.options[index];
      if (!query || suggestion.docNumber.indexOf(query) !== -1) {
        matched.push(suggestion);
      }
      if (matched.length >= MAX_VISIBLE_OPTIONS) {
        break;
      }
    }
    return matched;
  }
```

Replace the existing `getMatchedSuggestions(value, suggestions)` body with:

```js
  function getMatchedSuggestions(value, suggestions) {
    return getMatchedSuggestionsFromSource(value, buildSuggestionSource(suggestions));
  }
```

Replace `suggestionsForMode(mode)` with:

```js
  function suggestionsForMode(mode) {
    return mode === MODE_ERP ? suggestionSourcesByMode.erp : suggestionSourcesByMode.oa;
  }
```

In `renderSuggestions()`, replace:

```js
    options = getMatchedSuggestions(input.value, suggestionsForMode(getLookupMode()));
```

with:

```js
    options = getMatchedSuggestionsFromSource(input.value, suggestionsForMode(getLookupMode()));
```

In `initializeForm()`, replace:

```js
    suggestionsByMode = readSuggestions();
```

with:

```js
    suggestionsByMode = readSuggestions();
    suggestionSourcesByMode = {
      oa: buildSuggestionSource(suggestionsByMode.oa),
      erp: buildSuggestionSource(suggestionsByMode.erp)
    };
```

Keep `var suggestionsByMode` as a local variable in `initializeForm()`:

```js
    var suggestionsByMode;
```

Add that local variable with the other `initializeForm()` declarations.

- [ ] **Step 5: Run document lookup static tests to verify they pass**

Run:

```bash
npm test -- tests/query-dialog/document-lookup-static.test.ts tests/build/build-output.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add ui/document-lookup-dialog.html ui/document-lookup-dialog.js tests/query-dialog/document-lookup-static.test.ts tests/build/build-output.test.ts
git commit -m "feat: search document candidates by number"
```

Expected: commit succeeds.

---

### Task 4: Dynamic Document Lookup Worksheet Sides

**Files:**
- Modify: `src/constants.ts`
- Modify: `src/core/document-lookup.ts`
- Modify: `tests/core/document-lookup.test.ts`
- Modify: `tests/macros/document-lookup.test.ts`

- [ ] **Step 1: Write failing core output tests**

In `tests/core/document-lookup.test.ts`, keep the OA header test and add this test below it:

```ts
  it("converts ERP lookup rows with ERP fields on the left and left-minus-right differences", () => {
    const result = buildDocumentLookupResult({
      mode: "erp_doc_number",
      docNumber: "ERP-001",
      oaRows: [oaRow({ 数量: 1, 实际预算金额mx: 10 })],
      erpRows: [erpRow({ 实发数量: 4, 总成本: 40 })]
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const values = documentLookupRowsToValues(result.rows);

      expect(values[0]).toEqual([
        "行类型",
        "查询类型",
        "命中单号",
        "ERP单据编号",
        "ERP记录的OA单号",
        "ERP日期",
        "ERP公司简称",
        "ERP一级部门",
        "ERP二级部门",
        "ERP物料编码",
        "ERP物料名称",
        "ERP数量",
        "ERP金额",
        "OA表单编号",
        "OA记录的ERP单号",
        "OA申请日期",
        "OA公司简称",
        "OA一级部门",
        "OA二级部门",
        "OA物料编码",
        "OA物料名称",
        "OA数量",
        "OA金额",
        "数量差额",
        "金额差额",
        "备注"
      ]);
      expect(values[1]).toEqual([
        "物料",
        "查ERP单据编号",
        "ERP-001",
        "ERP-001",
        "OA-001",
        "2026-05-02",
        "数控",
        "生产",
        "仓储",
        "MAT-A",
        "物料A",
        4,
        40,
        "OA-001",
        "ERP-001",
        "2026-05-01",
        "数控",
        "生产",
        "仓储",
        "MAT-A",
        "物料A",
        1,
        10,
        3,
        30,
        "数量不同"
      ]);
    }
  });
```

In `tests/macros/document-lookup.test.ts`, update the ERP macro test `reuses fixed result sheet and clears previous document_lookup metadata range` by replacing the row assertion with:

```ts
    expect(outputMatrix(resultSheet)[0]?.slice(3, 13)).toEqual([
      "ERP单据编号",
      "ERP记录的OA单号",
      "ERP日期",
      "ERP公司简称",
      "ERP一级部门",
      "ERP二级部门",
      "ERP物料编码",
      "ERP物料名称",
      "ERP数量",
      "ERP金额"
    ]);
    expect(outputMatrix(resultSheet)[1]?.slice(3, 13)).toEqual([
      "ERP-778",
      "OA-001",
      "2026-05-02",
      "数控",
      "生产",
      "仓储",
      "MAT-A",
      "物料A",
      9,
      91
    ]);
```

- [ ] **Step 2: Run document lookup tests to verify they fail**

Run:

```bash
npm test -- tests/core/document-lookup.test.ts tests/macros/document-lookup.test.ts
```

Expected: FAIL because ERP lookups still use OA-left headers and old difference signs.

- [ ] **Step 3: Split document lookup headers**

In `src/constants.ts`, replace `DOCUMENT_LOOKUP_HEADERS` with:

```ts
export const DOCUMENT_LOOKUP_OA_LEFT_HEADERS = [
  "行类型",
  "查询类型",
  "命中单号",
  "OA表单编号",
  "OA记录的ERP单号",
  "OA申请日期",
  "OA公司简称",
  "OA一级部门",
  "OA二级部门",
  "OA物料编码",
  "OA物料名称",
  "OA数量",
  "OA金额",
  "ERP单据编号",
  "ERP记录的OA单号",
  "ERP日期",
  "ERP公司简称",
  "ERP一级部门",
  "ERP二级部门",
  "ERP物料编码",
  "ERP物料名称",
  "ERP数量",
  "ERP金额",
  "数量差额",
  "金额差额",
  "备注"
] as const;

export const DOCUMENT_LOOKUP_ERP_LEFT_HEADERS = [
  "行类型",
  "查询类型",
  "命中单号",
  "ERP单据编号",
  "ERP记录的OA单号",
  "ERP日期",
  "ERP公司简称",
  "ERP一级部门",
  "ERP二级部门",
  "ERP物料编码",
  "ERP物料名称",
  "ERP数量",
  "ERP金额",
  "OA表单编号",
  "OA记录的ERP单号",
  "OA申请日期",
  "OA公司简称",
  "OA一级部门",
  "OA二级部门",
  "OA物料编码",
  "OA物料名称",
  "OA数量",
  "OA金额",
  "数量差额",
  "金额差额",
  "备注"
] as const;

export const DOCUMENT_LOOKUP_HEADERS = DOCUMENT_LOOKUP_OA_LEFT_HEADERS;
```

- [ ] **Step 4: Make `documentLookupRowsToValues()` dynamic**

In `src/core/document-lookup.ts`, replace the import:

```ts
import { DOCUMENT_LOOKUP_HEADERS } from "../constants";
```

with:

```ts
import { DOCUMENT_LOOKUP_ERP_LEFT_HEADERS, DOCUMENT_LOOKUP_OA_LEFT_HEADERS } from "../constants";
```

Add these helpers above `documentLookupRowsToValues()`:

```ts
function oaSideValues(row: DocumentLookupRow): OutputMatrix[number] {
  return [
    row.oaFormNumber,
    row.oaRecordedErpDocNumber,
    row.oaDate,
    row.oaCompany,
    row.oaDept1,
    row.oaDept2,
    row.oaItemCode,
    row.oaItemName,
    row.oaQuantity,
    row.oaAmount
  ];
}

function erpSideValues(row: DocumentLookupRow): OutputMatrix[number] {
  return [
    row.erpDocNumber,
    row.erpRecordedOaFormNumber,
    row.erpDate,
    row.erpCompany,
    row.erpDept1,
    row.erpDept2,
    row.erpItemCode,
    row.erpItemName,
    row.erpQuantity,
    row.erpAmount
  ];
}

function numberDiff(left: number, right: number, fieldName: string): number {
  return decimalToNumber2(subtractDecimal(parseDecimal(left, fieldName), parseDecimal(right, fieldName)));
}

function displayedQuantityDiff(row: DocumentLookupRow): number {
  if (row.lookupType === "查ERP单据编号") {
    return numberDiff(row.erpQuantity, row.oaQuantity, "数量差额");
  }
  return row.quantityDiff;
}

function displayedAmountDiff(row: DocumentLookupRow): number {
  if (row.lookupType === "查ERP单据编号") {
    return numberDiff(row.erpAmount, row.oaAmount, "金额差额");
  }
  return row.amountDiff;
}
```

Replace `documentLookupRowsToValues()` with:

```ts
export function documentLookupRowsToValues(rows: DocumentLookupRow[] | null | undefined): OutputMatrix {
  const activeRows = rows ?? [];
  const erpLeft = activeRows[0]?.lookupType === "查ERP单据编号";
  const headers = erpLeft ? DOCUMENT_LOOKUP_ERP_LEFT_HEADERS : DOCUMENT_LOOKUP_OA_LEFT_HEADERS;

  return [
    [...headers],
    ...activeRows.map((row) => [
      row.rowType,
      row.lookupType,
      row.matchedDocNumber,
      ...(erpLeft ? erpSideValues(row) : oaSideValues(row)),
      ...(erpLeft ? oaSideValues(row) : erpSideValues(row)),
      displayedQuantityDiff(row),
      displayedAmountDiff(row),
      row.remark
    ])
  ];
}
```

- [ ] **Step 5: Run document lookup tests to verify they pass**

Run:

```bash
npm test -- tests/core/document-lookup.test.ts tests/macros/document-lookup.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/constants.ts src/core/document-lookup.ts tests/core/document-lookup.test.ts tests/macros/document-lookup.test.ts
git commit -m "feat: mirror document lookup output by mode"
```

Expected: commit succeeds.

---

### Task 5: Query Completion And Failure Alerts

**Files:**
- Create: `src/macros/query-feedback.ts`
- Modify: `src/macros/current-sheet-query.ts`
- Modify: `src/macros/document-lookup.ts`
- Modify: `tests/macros/current-sheet-query.test.ts`
- Modify: `tests/macros/document-lookup.test.ts`

- [ ] **Step 1: Write failing feedback tests for current sheet query**

In `tests/macros/current-sheet-query.test.ts`, add this helper below `makeRoot()`:

```ts
function makeTimedRoot(sheets: FakeSheet[], times: number[]): ScrapVarianceGlobal & {
  alert: ReturnType<typeof vi.fn>;
  performance: { now: () => number };
} {
  const root = makeRoot(sheets) as ScrapVarianceGlobal & {
    alert: ReturnType<typeof vi.fn>;
    performance: { now: () => number };
  };
  root.alert = vi.fn();
  root.performance = {
    now: vi.fn(() => {
      const next = times.shift();
      return typeof next === "number" ? next : 0;
    })
  };
  return root;
}
```

Update the import line from:

```ts
import { describe, expect, it } from "vitest";
```

to:

```ts
import { describe, expect, it, vi } from "vitest";
```

Add these tests inside `describe("current sheet query macro", () => { ... })`:

```ts
  it("alerts when current sheet query completes with elapsed milliseconds", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const summarySheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeTimedRoot([oaSheet, erpSheet, summarySheet, oaCompareSheet, erpCompareSheet], [100, 123.456]);
    setActiveSheet(root, oaCompareSheet);

    runCurrentSheetQueryWithState(root, { company: "数控" });

    expect(root.alert).toHaveBeenCalledWith("查询已完成\n耗时：23.46 ms\n结果已写入：OA视角单据对比");
  });

  it("alerts when current sheet query fails after writing the error row", () => {
    const erpSheet = makeErpSheet();
    const summarySheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeTimedRoot([erpSheet, summarySheet, oaCompareSheet, erpCompareSheet], [200, 287.321]);
    setActiveSheet(root, oaCompareSheet);

    runCurrentSheetQueryWithState(root, { company: "数控" });

    expect(root.alert).toHaveBeenCalledWith(
      `查询已失败\n耗时：87.32 ms\n错误：找不到工作表：${SHEET_NAMES.oa}`
    );
    expect(visibleWrites(oaCompareSheet)).toEqual([
      {
        address: "A1:B1",
        value: [["错误", `找不到工作表：${SHEET_NAMES.oa}`]]
      }
    ]);
  });
```

- [ ] **Step 2: Write failing feedback tests for document lookup**

In `tests/macros/document-lookup.test.ts`, add this helper below `makeRoot()`:

```ts
function makeTimedRoot(sheets: FakeSheet[], times: number[]): ReturnType<typeof makeRoot> & {
  alert: ReturnType<typeof vi.fn>;
  performance: { now: () => number };
} {
  const root = makeRoot(sheets) as ReturnType<typeof makeRoot> & {
    alert: ReturnType<typeof vi.fn>;
    performance: { now: () => number };
  };
  root.alert = vi.fn();
  root.performance = {
    now: vi.fn(() => {
      const next = times.shift();
      return typeof next === "number" ? next : 0;
    })
  };
  return root;
}
```

Add these tests inside `describe("document lookup macro", () => { ... })`:

```ts
  it("alerts when document lookup completes with elapsed milliseconds", () => {
    const root = makeTimedRoot([makeOaSheet(), makeErpSheet()], [50, 95.678]);

    runDocumentLookupWithSelection(root, { mode: "oa_form_number", docNumber: "OA-001" });

    expect(root.alert).toHaveBeenCalledWith("单号查询已完成\n耗时：45.68 ms\n结果已写入：单号查询结果");
  });

  it("alerts when document lookup fails after writing the error row", () => {
    const resultSheet = createFakeSheet(SHEET_NAMES.documentLookup);
    resultSheet.rangeValues.set("CB1:CC1", [["document_lookup", "A1:Z9"]]);
    const root = makeTimedRoot([
      makeOaSheet([["OA-001", "ERP-778", "2026/5/1", "数控", "生产", "仓储", "MAT-A", "物料A", "坏数量", 100]]),
      makeErpSheet(),
      resultSheet
    ], [10, 32.345]);

    runDocumentLookupWithSelection(root, { mode: "oa_form_number", docNumber: "OA-001" });

    expect(root.alert).toHaveBeenCalledWith(
      expect.stringMatching(/^单号查询已失败\n耗时：22\.35 ms\n错误：.*数量数值格式不正确/)
    );
    expect(visibleWrites(resultSheet)).toEqual([
      {
        address: "A1:B1",
        value: [["错误", expect.stringContaining("数量数值格式不正确")]]
      }
    ]);
  });
```

- [ ] **Step 3: Run feedback tests to verify they fail**

Run:

```bash
npm test -- tests/macros/current-sheet-query.test.ts tests/macros/document-lookup.test.ts
```

Expected: FAIL because no completion/failure alerts are emitted.

- [ ] **Step 4: Add the feedback helper**

Create `src/macros/query-feedback.ts`:

```ts
import { nowMs } from "../perf/timer";
import type { ScrapVarianceGlobal } from "../types/wps";

export function queryFeedbackErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatElapsedMs(value: number): string {
  return Math.max(0, value).toFixed(2);
}

export function showUserMessage(root: ScrapVarianceGlobal | undefined, message: string): void {
  const runtimeRoot = root ?? (globalThis as ScrapVarianceGlobal);
  if (typeof runtimeRoot.alert === "function") {
    runtimeRoot.alert(message);
    return;
  }

  if (typeof runtimeRoot.console?.error === "function") {
    runtimeRoot.console.error(message);
  }
}

export function queryStartedAt(root: ScrapVarianceGlobal | undefined): number {
  return nowMs(root ?? globalThis);
}

export function notifyQueryCompleted(
  root: ScrapVarianceGlobal | undefined,
  label: string,
  outputSheetName: string,
  startedAt: number
): void {
  const runtimeRoot = root ?? (globalThis as ScrapVarianceGlobal);
  const elapsed = nowMs(runtimeRoot) - startedAt;
  showUserMessage(runtimeRoot, `${label}已完成\n耗时：${formatElapsedMs(elapsed)} ms\n结果已写入：${outputSheetName}`);
}

export function notifyQueryFailed(
  root: ScrapVarianceGlobal | undefined,
  label: string,
  error: unknown,
  startedAt: number
): void {
  const runtimeRoot = root ?? (globalThis as ScrapVarianceGlobal);
  const elapsed = nowMs(runtimeRoot) - startedAt;
  showUserMessage(
    runtimeRoot,
    `${label}已失败\n耗时：${formatElapsedMs(elapsed)} ms\n错误：${queryFeedbackErrorMessage(error)}`
  );
}
```

- [ ] **Step 5: Wire feedback into current sheet query**

In `src/macros/current-sheet-query.ts`, add this import:

```ts
import { notifyQueryCompleted, notifyQueryFailed, queryStartedAt } from "./query-feedback";
```

In `runCurrentSheetQueryWithState`, after `const kind = detectOutputSheetKind(activeSheet.Name);` and the unsupported-kind guard, add:

```ts
  const startedAt = queryStartedAt(root);
```

After the successful `writeOutputWithMetadata(...)` call, add:

```ts
    notifyQueryCompleted(root, "查询", activeSheet.Name, startedAt);
```

Replace the catch block with:

```ts
  } catch (error) {
    try {
      safeWriteCurrentSheetError(activeSheet, kind, errorMessage(error), queryState);
      notifyQueryFailed(root, "查询", error, startedAt);
    } catch (writeError) {
      notifyQueryFailed(root, "查询", writeError, startedAt);
      throw writeError;
    }
  }
```

- [ ] **Step 6: Wire feedback into document lookup**

In `src/macros/document-lookup.ts`, add this import:

```ts
import { notifyQueryCompleted, notifyQueryFailed, queryStartedAt } from "./query-feedback";
```

At the beginning of `runDocumentLookupWithSelection`, add:

```ts
  const startedAt = queryStartedAt(root);
```

After `writeOutputWithMetadata(sheet, values);`, add:

```ts
    notifyQueryCompleted(root, "单号查询", SHEET_NAMES.documentLookup, startedAt);
```

Replace the catch block with:

```ts
  } catch (error) {
    try {
      safeWriteLookupError(root, error);
      notifyQueryFailed(root, "单号查询", error, startedAt);
    } catch (writeError) {
      notifyQueryFailed(root, "单号查询", writeError, startedAt);
      throw writeError;
    }
  }
```

- [ ] **Step 7: Run feedback tests to verify they pass**

Run:

```bash
npm test -- tests/macros/current-sheet-query.test.ts tests/macros/document-lookup.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/macros/query-feedback.ts src/macros/current-sheet-query.ts src/macros/document-lookup.ts tests/macros/current-sheet-query.test.ts tests/macros/document-lookup.test.ts
git commit -m "feat: alert query completion timing"
```

Expected: commit succeeds.

---

### Task 6: Documentation, Bundle Sync, And Full Verification

**Files:**
- Modify: `docs/wps-js-usage.md`
- Modify: `main.js`

- [ ] **Step 1: Update user documentation**

In `docs/wps-js-usage.md`, in the `## 查询` section after the paragraph ending with `只按公司筛选数控。`, add:

```md
点击 `查询` 后，查询弹窗会关闭。查询完成后会弹出提示，显示 `查询已完成`、本次耗时和结果写入的输出表；查询失败时会弹出 `查询已失败`、耗时和错误原因。失败原因仍会写入目标输出表，便于之后复查。
```

Add a new subsection before `## 性能与输出约束`:

```md
## 单号查询

点击 `查单号` 会打开专用弹窗。先选择 `查 OA 表单编号` 或 `查 ERP 单据编号`，再输入单号的任意连续片段，从下拉候选中选择完整单号。

候选只按当前查询类型的本侧单号匹配：

- `查 OA 表单编号` 只匹配 OA `表单编号`。
- `查 ERP 单据编号` 只匹配 ERP `单据编号`。

候选行里显示的日期、公司、部门和对方单号只用于人工确认，不参与候选匹配。只输入片段但不点击候选时，工具会提示先从下拉候选中选择一个单号。

`单号查询结果` 会把当前查询侧放在左边：

- 查 OA 时，OA 字段在左，ERP 字段在右，数量差额和金额差额按 `OA - ERP` 展示。
- 查 ERP 时，ERP 字段在左，OA 字段在右，数量差额和金额差额按 `ERP - OA` 展示。

查询完成后会弹出提示，显示 `单号查询已完成`、本次耗时和 `单号查询结果`；查询失败时会弹出失败提示，并且错误仍会写入 `单号查询结果`。
```

- [ ] **Step 2: Run focused tests before bundle sync**

Run:

```bash
npm test -- tests/query-dialog/candidate-search-static.test.ts tests/query-dialog/static-autocomplete.test.ts tests/query-dialog/document-lookup-static.test.ts tests/core/document-lookup.test.ts tests/macros/current-sheet-query.test.ts tests/macros/document-lookup.test.ts tests/build/build-output.test.ts
```

Expected: PASS.

- [ ] **Step 3: Build and sync `main.js`**

Run:

```bash
npm run build
```

Expected: `npm run typecheck` passes and esbuild regenerates `main.js`.

- [ ] **Step 4: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output and exit code 0.

- [ ] **Step 6: Run generated bundle red-flag scan**

Run:

```bash
rg -n "document\\.write|src/macros|ribbon\\.js|require\\(|process\\.|child_process|fs\\b|path\\b|URLSearchParams" main.js ui/*.js
```

Expected: no matches for forbidden runtime strings. If `ui/*.js` produces intentional matches from tests hooks or static code, inspect each line and remove any Node-only or `URLSearchParams` usage before continuing.

- [ ] **Step 7: Commit final docs and bundle**

Run:

```bash
git add docs/wps-js-usage.md main.js
git commit -m "docs: document lookup search feedback"
```

Expected: commit succeeds if those files changed. If `docs/wps-js-usage.md` and `main.js` were already committed by earlier tasks, run `git status --short` and confirm there is nothing left to commit.

- [ ] **Step 8: Final status check**

Run:

```bash
git status --short
```

Expected: clean worktree.
