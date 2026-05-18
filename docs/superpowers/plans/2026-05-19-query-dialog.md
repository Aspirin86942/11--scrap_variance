# Query Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile ribbon editBox query inputs with a fresh query dialog opened from `查询当前页`, where blank fields mean all and the submitted dialog state is the only source of query filters. Add a WPS real-machine test entry that runs button actions programmatically without depending on mouse clicks.

**Architecture:** Add a small dialog state module, make current-sheet query accept explicit `RibbonQueryState`, then add a WPS `ShowDialog` bridge that exchanges the dialog result through `Application.PluginStorage`. Move WPS global registration into `src/entry.ts`, introduce a `buttonActions` registry that powers ribbon dispatch and manual WPS action tests, and keep business comparison logic unchanged.

**Tech Stack:** TypeScript, esbuild IIFE bundle, static HTML/JS under `ui/`, WPS JS API `Application.ShowDialog` and `Application.PluginStorage`, Vitest.

---

## File Structure

- Create `src/query-dialog/state.ts`
  - Owns default dialog state and normalization from raw dialog payload to `RibbonQueryState`.
  - Performs pre-query validation through existing `parseFilters()`.
- Create `src/query-dialog/open-query-dialog.ts`
  - Owns WPS dialog opening, result polling, PluginStorage key handling, and calling `runCurrentSheetQueryWithState()`.
  - Does not contain comparison logic.
- Create `tests/query-dialog/state.test.ts`
  - Covers blank-as-all, trimming, direction defaulting, and date validation.
- Create `tests/query-dialog/open-query-dialog.test.ts`
  - Covers URL construction, `ShowDialog()` call, PluginStorage result handling, and cancel/no-result behavior.
- Create `ui/query-dialog.html`
  - Static query form shown by WPS dialog.
- Create `ui/query-dialog.js`
  - Static browser-side form logic: default state, clear, submit to PluginStorage, cancel.
- Create `src/actions/button-actions.ts`
  - Owns the `buttonActions` registry shape, button-id lookup, and `runAllButtonActionTests()`.
  - Provides a non-GUI test action for `查询当前页` so the runner does not block on a dialog.
- Create `tests/actions/button-actions.test.ts`
  - Covers structured result output, failure capture, and Node-only registry behavior.
- Create `src/entry.ts`
  - Official WPS global entry: registers `window.ribbon`, `window.buttonActions`, and `window.__WPS_RUN_ALL_BUTTON_TESTS__`.
  - This repo currently uses `src/main.ts` as the esbuild entry; implementation changes the bundle entry to `src/entry.ts`.
- Modify `src/macros/current-sheet-query.ts`
  - Add `runCurrentSheetQueryWithState(root, queryState)`.
  - Keep `runCurrentSheetQuery(root)` as compatibility wrapper.
  - Stop legacy detail query from reading `getRibbonState(root)` internally.
- Modify `src/main.ts`
  - Export runtime wiring helpers used by `src/entry.ts`.
  - Keep `reportRuntimeError()` testable without global side effects.
- Modify `src/ribbon/handlers.ts`
  - Dispatch through `buttonActions`.
  - Remove formal dependency on ribbon editBox callbacks for query behavior.
  - Keep unknown-button reporting.
- Modify `src/types/wps.ts`
  - Add WPS `ShowDialog()` and `PluginStorage` type surface.
  - Add `buttonActions` and `__WPS_RUN_ALL_BUTTON_TESTS__` global type surface.
- Modify `package.json`
  - Change esbuild entry from `src/main.ts` to `src/entry.ts`.
- Modify `ribbon.xml`
  - Remove formal query editBox/dropDown controls.
  - Keep query button and other business buttons.
- Modify `tests/ribbon/main-entry.test.ts`
  - Update tests to assert query button dispatches dialog opener and no longer treats editBoxes as official query entry.
- Modify `tests/build/build-output.test.ts`
  - Assert `ribbon.xml` no longer exposes query editBoxes.
  - Assert `ui/query-dialog.html` and `ui/query-dialog.js` exist and contain required controls/buttons.
- Modify `docs/wps-js-usage.md`
  - Replace ribbon-input instructions with dialog instructions.
- Create `MANUAL_TEST.md`
  - Documents the real WPS manual test command and GUI smoke-test boundary.
- Regenerate `main.js`
  - Committed bundle remains part of the deliverable.

---

### Task 1: Add Dialog State Normalization

**Files:**
- Create: `src/query-dialog/state.ts`
- Create: `tests/query-dialog/state.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/query-dialog/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { QUERY_DIRECTIONS } from "../../src/core/query-direction";
import { buildDefaultQueryDialogState, normalizeQueryDialogState } from "../../src/query-dialog/state";

describe("query dialog state", () => {
  it("defaults to blank filters and the OA-to-ERP direction", () => {
    expect(buildDefaultQueryDialogState()).toEqual({
      company: "",
      dept1: "",
      dept2: "",
      startDate: "",
      endDate: "",
      queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp
    });
  });

  it("normalizes blank fields as all and trims text", () => {
    expect(
      normalizeQueryDialogState({
        company: " 数控 ",
        dept1: " ",
        dept2: "",
        startDate: "",
        endDate: undefined,
        queryDirection: ""
      })
    ).toEqual({
      company: "数控",
      dept1: "",
      dept2: "",
      startDate: "",
      endDate: "",
      queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp
    });
  });

  it("preserves a supported explicit query direction", () => {
    expect(
      normalizeQueryDialogState({
        queryDirection: QUERY_DIRECTIONS.erpSourceToOa
      })
    ).toEqual({
      company: "",
      dept1: "",
      dept2: "",
      startDate: "",
      endDate: "",
      queryDirection: QUERY_DIRECTIONS.erpSourceToOa
    });
  });

  it("rejects invalid date ranges before query output is cleared", () => {
    expect(() =>
      normalizeQueryDialogState({
        startDate: "2026/5/31",
        endDate: "2026/5/1"
      })
    ).toThrow("开始日期不能晚于结束日期：2026-05-31 > 2026-05-01");
  });

  it("rejects invalid date text before query output is cleared", () => {
    expect(() =>
      normalizeQueryDialogState({
        startDate: "not-a-date"
      })
    ).toThrow("日期格式不正确：not-a-date");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/query-dialog/state.test.ts --reporter=dot
```

Expected: FAIL because `src/query-dialog/state.ts` does not exist.

- [ ] **Step 3: Implement minimal state module**

Create `src/query-dialog/state.ts`:

```ts
import { parseFilters } from "../core/build-oa-rows";
import { DEFAULT_QUERY_DIRECTION, parseQueryDirection } from "../core/query-direction";
import type { RibbonQueryState } from "../types/scrap";
import { normalizeText } from "../utils/text";

export type QueryDialogStateInput = Partial<Record<keyof RibbonQueryState, unknown>> | null | undefined;

export function buildDefaultQueryDialogState(): RibbonQueryState {
  return {
    company: "",
    dept1: "",
    dept2: "",
    startDate: "",
    endDate: "",
    queryDirection: DEFAULT_QUERY_DIRECTION
  };
}

export function normalizeQueryDialogState(input: QueryDialogStateInput = {}): RibbonQueryState {
  const source = input ?? {};
  const queryState: RibbonQueryState = {
    company: normalizeText(source.company),
    dept1: normalizeText(source.dept1),
    dept2: normalizeText(source.dept2),
    startDate: normalizeText(source.startDate),
    endDate: normalizeText(source.endDate),
    queryDirection: parseQueryDirection(normalizeText(source.queryDirection) || DEFAULT_QUERY_DIRECTION)
  };

  // Validate before the query layer clears any previous output.
  parseFilters(queryState);
  return queryState;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- tests/query-dialog/state.test.ts --reporter=dot
```

Expected: PASS, 5 tests passing.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/query-dialog/state.ts tests/query-dialog/state.test.ts
git commit -m "feat: add query dialog state normalization"
```

---

### Task 2: Add Explicit Current-Sheet Query State

**Files:**
- Modify: `src/macros/current-sheet-query.ts`
- Test: `tests/macros/current-sheet-query.test.ts`

- [ ] **Step 1: Write failing tests for explicit state**

Add these tests to `tests/macros/current-sheet-query.test.ts` after the existing company-only test:

```ts
  it("runCurrentSheetQueryWithState ignores stale global ribbon filters", () => {
    const oaSheet = makeOaSheet([
      validOaRow(),
      ["OA-002", "ERP-999", "2026/4/1", "装备", "其他一级", "其他二级", "MAT-B", "物料B", 2, 20]
    ]);
    const erpSheet = makeErpSheet([
      validErpRow(),
      ["ERP-999", "2026/4/2", "OA-002", "装备", "其他一级", "其他二级", "MAT-B", "物料B", 2, 20]
    ]);
    const detailSheet = makeOutputSheet(SHEET_NAMES.detailOutput);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    root.ScrapVarianceRibbonState = {
      company: "不存在公司",
      dept1: "旧一级部门",
      dept2: "旧二级部门",
      startDate: "2099/1/1",
      endDate: "2099/12/31"
    };
    setActiveSheet(root, oaCompareSheet);

    runCurrentSheetQueryWithState(root, {
      company: "数控",
      dept1: "",
      dept2: "",
      startDate: "",
      endDate: "",
      queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp
    });

    const output = flattenWrites(oaCompareSheet);
    expect(output).toContain("数控");
    expect(output).toContain("OA-001");
    expect(output).not.toContain("查询条件没有匹配到 OA 数据。");
    expect(oaCompareSheet.writes).toContainEqual({
      address: "CB2:CG2",
      value: [["数控", "", "", "", "", QUERY_DIRECTIONS.oaKingdeeToErp]]
    });
  });

  it("runCurrentSheetQueryWithState applies explicit direction to legacy detail output", () => {
    const oaSheet = makeOaSheet([
      ["OA-001", "ERP-778", "2026/4/1", "其他公司", "其他部门", "其他二级", "MAT-A", "物料A", 10, 100]
    ]);
    const erpSheet = makeErpSheet();
    const detailSheet = makeOutputSheet(SHEET_NAMES.detailOutput);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, detailSheet, oaCompareSheet, erpCompareSheet]);
    root.ScrapVarianceRibbonState = {
      queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp
    };
    setActiveSheet(root, detailSheet);

    runCurrentSheetQueryWithState(root, {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31",
      queryDirection: QUERY_DIRECTIONS.erpSourceToOa
    });

    const output = flattenWrites(detailSheet);
    expect(output).toContain("OA和ERP都有，但数量不同");
    expect(output).toContain("OA-001");
    expect(output).not.toContain("查询条件没有匹配到 OA 数据。");
  });
```

Update the import at the top:

```ts
import { runCurrentSheetQuery, runCurrentSheetQueryWithState, toggleMaterialRows } from "../../src/macros/current-sheet-query";
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/macros/current-sheet-query.test.ts --reporter=dot
```

Expected: FAIL because `runCurrentSheetQueryWithState` is not exported.

- [ ] **Step 3: Implement explicit query entry**

In `src/macros/current-sheet-query.ts`, change `buildLegacyDetailValues` signature and pipeline call:

```ts
function buildLegacyDetailValues(
  oaRows: RawRow[],
  erpRows: RawRow[],
  filters: QueryFilters,
  queryDirection: RibbonQueryState["queryDirection"]
):
  | { values: OutputMatrix; noResultMessage: null }
  | { values: null; noResultMessage: string } {
  const pipeline = runQueryCorePipeline(oaRows, erpRows, filters, undefined, queryDirection);
```

Replace the existing `runCurrentSheetQuery` body with a wrapper and new explicit entry:

```ts
export function runCurrentSheetQuery(root?: ScrapVarianceGlobal): void {
  runCurrentSheetQueryWithState(root, getRibbonState(root));
}

export function runCurrentSheetQueryWithState(root: ScrapVarianceGlobal | undefined, queryState: RibbonQueryState): void {
  setupOutputSheets(root);

  const activeSheet = getActiveSheet(root);
  const kind = detectOutputSheetKind(activeSheet.Name);
  if (!kind) {
    throw new Error(unsupportedOutputSheetMessage());
  }

  try {
    const filters = parseFilters(queryState);
    const { oaRows, erpRows } = readSourceRows(root);
    const result =
      kind === "legacy_detail"
        ? buildLegacyDetailValues(oaRows, erpRows, filters, queryState.queryDirection)
        : kind === "oa_doc_compare"
          ? buildOaDocCompareValues(oaRows, erpRows, filters)
          : buildErpDocCompareValues(oaRows, erpRows, filters);

    clearPreviousToolOutput(activeSheet, kind);
    writeOutputWithMetadata(activeSheet, kind, result.values ?? [[result.noResultMessage]], queryState);
  } catch (error) {
    safeWriteCurrentSheetError(activeSheet, kind, errorMessage(error), root);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- tests/macros/current-sheet-query.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/macros/current-sheet-query.ts tests/macros/current-sheet-query.test.ts
git commit -m "feat: query current sheet with explicit state"
```

---

### Task 3: Add WPS Dialog Bridge

**Files:**
- Create: `src/query-dialog/open-query-dialog.ts`
- Create: `tests/query-dialog/open-query-dialog.test.ts`
- Modify: `src/types/wps.ts`

- [ ] **Step 1: Write failing tests for bridge behavior**

Create `tests/query-dialog/open-query-dialog.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { QUERY_DIRECTIONS } from "../../src/core/query-direction";
import {
  QUERY_DIALOG_RESULT_KEY,
  openQueryDialogAndRun,
  pollQueryDialogResult
} from "../../src/query-dialog/open-query-dialog";
import type { ScrapVarianceGlobal } from "../../src/types/wps";

function makeRoot(): ScrapVarianceGlobal & {
  Application: NonNullable<ScrapVarianceGlobal["Application"]> & {
    PluginStorage: {
      values: Map<string, unknown>;
      getItem(key: string): unknown;
      setItem(key: string, value: unknown): void;
    };
    ShowDialog: ReturnType<typeof vi.fn>;
  };
} {
  const values = new Map<string, unknown>();
  return {
    Application: {
      PluginStorage: {
        values,
        getItem(key: string): unknown {
          return values.get(key);
        },
        setItem(key: string, value: unknown): void {
          values.set(key, value);
        }
      },
      ShowDialog: vi.fn()
    }
  };
}

describe("query dialog bridge", () => {
  it("opens the WPS query dialog with a tokenized URL", () => {
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();

    openQueryDialogAndRun(root, runQuery, reportError);

    expect(root.Application.ShowDialog).toHaveBeenCalledOnce();
    const [url, title, width, height, modal] = root.Application.ShowDialog.mock.calls[0] ?? [];
    expect(String(url)).toContain("ui/query-dialog.html");
    expect(String(url)).toContain("token=");
    expect(title).toBe("报废差异查询条件");
    expect(width).toBeGreaterThanOrEqual(480);
    expect(height).toBeGreaterThanOrEqual(360);
    expect(modal).toBe(false);
    expect(runQuery).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("pollQueryDialogResult runs a submitted matching-token query and clears storage", () => {
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    root.Application.PluginStorage.setItem(
      QUERY_DIALOG_RESULT_KEY,
      JSON.stringify({
        token: "token-1",
        action: "query",
        state: {
          company: " 数控 ",
          queryDirection: QUERY_DIRECTIONS.erpSourceToOa
        }
      })
    );

    expect(pollQueryDialogResult(root, "token-1", runQuery, reportError)).toBe(true);

    expect(runQuery).toHaveBeenCalledWith({
      company: "数控",
      dept1: "",
      dept2: "",
      startDate: "",
      endDate: "",
      queryDirection: QUERY_DIRECTIONS.erpSourceToOa
    });
    expect(root.Application.PluginStorage.values.get(QUERY_DIALOG_RESULT_KEY)).toBe("");
    expect(reportError).not.toHaveBeenCalled();
  });

  it("pollQueryDialogResult ignores stale tokens and canceled dialogs", () => {
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    root.Application.PluginStorage.setItem(
      QUERY_DIALOG_RESULT_KEY,
      JSON.stringify({ token: "other-token", action: "query", state: { company: "数控" } })
    );

    expect(pollQueryDialogResult(root, "token-1", runQuery, reportError)).toBe(false);
    expect(runQuery).not.toHaveBeenCalled();

    root.Application.PluginStorage.setItem(
      QUERY_DIALOG_RESULT_KEY,
      JSON.stringify({ token: "token-1", action: "cancel" })
    );
    expect(pollQueryDialogResult(root, "token-1", runQuery, reportError)).toBe(true);
    expect(runQuery).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("pollQueryDialogResult reports invalid submitted input without running query", () => {
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    root.Application.PluginStorage.setItem(
      QUERY_DIALOG_RESULT_KEY,
      JSON.stringify({
        token: "token-1",
        action: "query",
        state: {
          startDate: "2026/5/31",
          endDate: "2026/5/1"
        }
      })
    );

    expect(pollQueryDialogResult(root, "token-1", runQuery, reportError)).toBe(true);

    expect(runQuery).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ message: expect.stringContaining("开始日期不能晚于结束日期") })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/query-dialog/open-query-dialog.test.ts --reporter=dot
```

Expected: FAIL because bridge module and WPS types are missing.

- [ ] **Step 3: Add WPS API types**

In `src/types/wps.ts`, add:

```ts
export interface WpsPluginStorage {
  getItem(key: string): unknown;
  setItem(key: string, value: unknown): void;
}
```

Extend `WpsApplication`:

```ts
export interface WpsApplication {
  ActiveWorkbook?: WpsWorkbook;
  ActiveSheet?: WpsSheet;
  Selection?: WpsRange;
  Worksheets?: WpsSheets;
  Sheets?: WpsSheets;
  PluginStorage?: WpsPluginStorage;
  ShowDialog?: (url: string, title: string, width: number, height: number, modal: boolean) => unknown;
}
```

- [ ] **Step 4: Implement bridge module**

Create `src/query-dialog/open-query-dialog.ts`:

```ts
import { runCurrentSheetQueryWithState } from "../macros/current-sheet-query";
import type { RibbonQueryState } from "../types/scrap";
import type { ScrapVarianceGlobal } from "../types/wps";
import { normalizeQueryDialogState } from "./state";

export const QUERY_DIALOG_RESULT_KEY = "ScrapVarianceQueryDialogResult";
const QUERY_DIALOG_TIMEOUT_MS = 5 * 60 * 1000;
const QUERY_DIALOG_POLL_MS = 250;

type DialogAction = "query" | "cancel";

interface QueryDialogResult {
  token: string;
  action: DialogAction;
  state?: Partial<RibbonQueryState>;
}

type RunQuery = (state: RibbonQueryState) => void;
type ReportError = (error: unknown) => void;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getStorage(root: ScrapVarianceGlobal) {
  const storage = root.Application?.PluginStorage;
  if (!storage) {
    throw new Error("当前 WPS 环境不支持 PluginStorage，无法打开查询弹窗。");
  }
  return storage;
}

function clearDialogResult(root: ScrapVarianceGlobal): void {
  getStorage(root).setItem(QUERY_DIALOG_RESULT_KEY, "");
}

function readDialogResult(root: ScrapVarianceGlobal): QueryDialogResult | null {
  const raw = getStorage(root).getItem(QUERY_DIALOG_RESULT_KEY);
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<QueryDialogResult>;
    if (typeof parsed.token !== "string" || (parsed.action !== "query" && parsed.action !== "cancel")) {
      return null;
    }
    return {
      token: parsed.token,
      action: parsed.action,
      state: parsed.state
    };
  } catch {
    return null;
  }
}

function createDialogToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildDialogUrl(token: string): string {
  const base = typeof globalThis.location?.href === "string" ? globalThis.location.href : "http://127.0.0.1:3889/index.html";
  const url = new URL("ui/query-dialog.html", base);
  url.searchParams.set("token", token);
  return url.toString();
}

export function pollQueryDialogResult(
  root: ScrapVarianceGlobal,
  token: string,
  runQuery: RunQuery,
  reportError: ReportError
): boolean {
  const result = readDialogResult(root);
  if (!result || result.token !== token) {
    return false;
  }

  clearDialogResult(root);
  if (result.action === "cancel") {
    return true;
  }

  try {
    runQuery(normalizeQueryDialogState(result.state));
  } catch (error) {
    reportError(error instanceof Error ? error : new Error(errorMessage(error)));
  }
  return true;
}

export function openQueryDialogAndRun(
  root: ScrapVarianceGlobal,
  runQuery: RunQuery = (state) => runCurrentSheetQueryWithState(root, state),
  reportError: ReportError
): void {
  try {
    const showDialog = root.Application?.ShowDialog;
    if (typeof showDialog !== "function") {
      throw new Error("当前 WPS 环境不支持 ShowDialog，无法打开查询弹窗。");
    }

    const token = createDialogToken();
    clearDialogResult(root);
    showDialog(buildDialogUrl(token), "报废差异查询条件", 560, 430, false);

    const startedAt = Date.now();
    const timer = globalThis.setInterval(() => {
      if (pollQueryDialogResult(root, token, runQuery, reportError) || Date.now() - startedAt > QUERY_DIALOG_TIMEOUT_MS) {
        globalThis.clearInterval(timer);
      }
    }, QUERY_DIALOG_POLL_MS);
  } catch (error) {
    reportError(error);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm test -- tests/query-dialog/open-query-dialog.test.ts tests/query-dialog/state.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/types/wps.ts src/query-dialog/open-query-dialog.ts tests/query-dialog/open-query-dialog.test.ts
git commit -m "feat: add WPS query dialog bridge"
```

---

### Task 4: Add Static Dialog UI and Wire Ribbon Button

**Files:**
- Create: `ui/query-dialog.html`
- Create: `ui/query-dialog.js`
- Modify: `src/main.ts`
- Modify: `ribbon.xml`
- Modify: `src/ribbon/handlers.ts`
- Modify: `tests/build/build-output.test.ts`
- Modify: `tests/ribbon/main-entry.test.ts`

- [ ] **Step 1: Write failing build and ribbon tests**

In `tests/build/build-output.test.ts`, update `keeps ribbon.xml pointed at the bundled ribbon object`:

```ts
    expect(xml).not.toContain("<editBox");
    expect(xml).not.toContain('id="company"');
    expect(xml).not.toContain('id="dept1"');
    expect(xml).not.toContain('id="dept2"');
    expect(xml).not.toContain('id="startDate"');
    expect(xml).not.toContain('id="endDate"');
    expect(xml).not.toContain('id="queryDirection"');
    expect(xml).toContain('id="btnQueryCurrentSheet"');
```

Remove the previous expectations for `onChange="ribbon.OnCompanyChange"` and `onAction="ribbon.OnQueryDirectionChange"`.

Add this test to `tests/build/build-output.test.ts`:

```ts
  it("ships the static query dialog page", () => {
    const html = readText("ui/query-dialog.html");
    const script = readText("ui/query-dialog.js");

    expect(html).toContain('id="company"');
    expect(html).toContain('id="dept1"');
    expect(html).toContain('id="dept2"');
    expect(html).toContain('id="startDate"');
    expect(html).toContain('id="endDate"');
    expect(html).toContain('id="queryDirection"');
    expect(html).toContain('id="btnQuery"');
    expect(html).toContain('id="btnClear"');
    expect(html).toContain('id="btnCancel"');
    expect(html).toContain('src="./query-dialog.js"');
    expect(script).toContain("ScrapVarianceQueryDialogResult");
    expect(script).toContain("OA金蝶单号查ERP");
    expect(script).toContain("ERP源单查OA");
  });
```

In `tests/ribbon/main-entry.test.ts`, update the dispatch test to keep button assertions and remove reliance on editBox callbacks as official query input. Add:

```ts
    ribbon.OnAction({ ID: "btnQueryCurrentSheet" });
    expect(queryCurrentSheet).toHaveBeenCalledOnce();
```

Remove tests whose sole purpose is official editBox query input behavior:

- `createRibbonHandlers accepts input values carried on the WPS control object`
- `createRibbonHandlers exposes dedicated editBox callbacks when WPS only passes text`
- `createRibbonHandlers clears stale filters before accepting a fresh company-only query`
- `createRibbonHandlers accepts direction selection carried on the WPS control object`
- `createRibbonHandlers exposes a dedicated direction callback when WPS only passes selection`

Keep `getControlId`, button dispatch, unknown button, dependency error, `OnAddinLoad`, and runtime error tests.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/build/build-output.test.ts tests/ribbon/main-entry.test.ts --reporter=dot
```

Expected: FAIL because dialog files do not exist and `ribbon.xml` still contains editBoxes.

- [ ] **Step 3: Add static dialog HTML**

Create `ui/query-dialog.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <title>报废差异查询条件</title>
    <style>
      body {
        box-sizing: border-box;
        margin: 0;
        padding: 18px;
        font-family: "Microsoft YaHei", Arial, sans-serif;
        color: #1f2933;
        background: #f7f8fa;
      }
      .grid {
        display: grid;
        grid-template-columns: 88px 1fr;
        gap: 10px 12px;
        align-items: center;
      }
      label {
        font-size: 14px;
        text-align: right;
      }
      input,
      select {
        box-sizing: border-box;
        width: 100%;
        height: 30px;
        border: 1px solid #c9d1d9;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 14px;
        background: #fff;
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 18px;
      }
      button {
        min-width: 72px;
        height: 30px;
        border: 1px solid #9aa4b2;
        border-radius: 4px;
        background: #fff;
        cursor: pointer;
      }
      button.primary {
        border-color: #087f5b;
        background: #099268;
        color: #fff;
      }
    </style>
  </head>
  <body>
    <form id="queryForm">
      <div class="grid">
        <label for="company">公司简称</label>
        <input id="company" name="company" autocomplete="off">
        <label for="dept1">一级部门</label>
        <input id="dept1" name="dept1" autocomplete="off">
        <label for="dept2">二级部门</label>
        <input id="dept2" name="dept2" autocomplete="off">
        <label for="startDate">开始日期</label>
        <input id="startDate" name="startDate" placeholder="2026/5/1" autocomplete="off">
        <label for="endDate">结束日期</label>
        <input id="endDate" name="endDate" placeholder="2026/5/31" autocomplete="off">
        <label for="queryDirection">查询方向</label>
        <select id="queryDirection" name="queryDirection">
          <option value="OA金蝶单号查ERP">OA金蝶单号查ERP</option>
          <option value="ERP源单查OA">ERP源单查OA</option>
        </select>
      </div>
      <div class="actions">
        <button id="btnQuery" class="primary" type="submit">查询</button>
        <button id="btnClear" type="button">清空</button>
        <button id="btnCancel" type="button">取消</button>
      </div>
    </form>
    <script src="./query-dialog.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Add static dialog script**

Create `ui/query-dialog.js`:

```js
(function () {
  var RESULT_KEY = "ScrapVarianceQueryDialogResult";
  var DEFAULT_DIRECTION = "OA金蝶单号查ERP";

  function getToken() {
    return new URLSearchParams(window.location.search).get("token") || "";
  }

  function getApplication() {
    return window.Application;
  }

  function getStorage() {
    var app = getApplication();
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
```

- [ ] **Step 5: Wire main entry to dialog opener**

Modify `src/main.ts`:

```ts
import { openQueryDialogAndRun } from "./query-dialog/open-query-dialog";
```

Change the `queryCurrentSheet` dependency:

```ts
  queryCurrentSheet: () => openQueryDialogAndRun(root, (state) => runCurrentSheetQueryWithState(root, state), reportRuntimeError),
```

Update the current import from `current-sheet-query`:

```ts
import { runCurrentSheetQueryWithState, toggleMaterialRows } from "./macros/current-sheet-query";
```

- [ ] **Step 6: Remove query input controls from ribbon XML**

In `ribbon.xml`, remove:

```xml
          <editBox id="company" label="公司简称" onChange="ribbon.OnCompanyChange" />
          <editBox id="dept1" label="一级部门" onChange="ribbon.OnDept1Change" />
          <editBox id="dept2" label="二级部门" onChange="ribbon.OnDept2Change" />
          <editBox id="startDate" label="开始日期" onChange="ribbon.OnStartDateChange" />
          <editBox id="endDate" label="结束日期" onChange="ribbon.OnEndDateChange" />
          <dropDown id="queryDirection" label="查询方向" getItemCount="ribbon.GetDirectionCount" getItemLabel="ribbon.GetDirectionLabel" getSelectedItemIndex="ribbon.GetDirectionSelectedIndex" onAction="ribbon.OnQueryDirectionChange" />
```

Leave the button block:

```xml
          <button id="btnPrecheck" label="预验证数据" size="large" onAction="ribbon.OnAction" />
          <button id="btnSetupOutputSheets" label="初始化输出表" size="large" onAction="ribbon.OnAction" />
          <button id="btnQueryCurrentSheet" label="查询当前页" size="large" onAction="ribbon.OnAction" />
          <button id="btnToggleMaterialRows" label="展开物料" size="large" onAction="ribbon.OnAction" />
          <button id="btnPerformanceDiagnostics" label="性能诊断" size="large" onAction="ribbon.OnAction" />
```

- [ ] **Step 7: Remove obsolete formal query callbacks**

In `src/types/wps.ts`, replace `RibbonApi` with only the callbacks that remain in `ribbon.xml`:

```ts
export interface RibbonApi {
  OnAddinLoad(ribbonUi: unknown): void;
  OnAction(control: RibbonControl): void;
}
```

Remove these obsolete query input methods from `RibbonApi`:

```ts
OnInputChange
OnDirectionChange
OnCompanyChange
OnDept1Change
OnDept2Change
OnStartDateChange
OnEndDateChange
OnQueryDirectionChange
GetDirectionCount
GetDirectionLabel
GetDirectionSelectedIndex
```

In `src/ribbon/handlers.ts`, remove imports and helpers used only by the old ribbon editBox/dropDown state:

```ts
QUERY_DIRECTIONS import
getRibbonState import
resetRibbonState import
updateRibbonState import
DIRECTION_LABELS
getControlText
getDirectionSelection
updateInput
updateDirection
```

Keep `normalizeText`, `isRecord`, `getControlId`, `OnAddinLoad`, and `OnAction`.

The resulting `createRibbonHandlers()` shape is:

```ts
export function createRibbonHandlers(dependencies: RibbonDependencies): RibbonApi {
  const root = dependencies.root ?? (globalThis as ScrapVarianceGlobal);

  return {
    OnAddinLoad(ribbonUi: unknown): void {
      root.ScrapVarianceRibbonUi = ribbonUi;
    },
    OnAction(control: RibbonControl): void {
      // existing switch remains unchanged
    },
  };
}
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
npm test -- tests/build/build-output.test.ts tests/ribbon/main-entry.test.ts tests/query-dialog/open-query-dialog.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

```bash
git add ui/query-dialog.html ui/query-dialog.js src/main.ts ribbon.xml src/ribbon/handlers.ts src/types/wps.ts tests/build/build-output.test.ts tests/ribbon/main-entry.test.ts
git commit -m "feat: open query dialog from ribbon button"
```

---

### Task 5: Add Button Action Registry and WPS Manual Test Entry

**Files:**
- Create: `src/actions/button-actions.ts`
- Create: `tests/actions/button-actions.test.ts`
- Create: `src/entry.ts`
- Create: `MANUAL_TEST.md`
- Modify: `src/main.ts`
- Modify: `src/ribbon/handlers.ts`
- Modify: `src/types/wps.ts`
- Modify: `tests/ribbon/main-entry.test.ts`
- Modify: `tests/build/build-output.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing action registry tests**

Create `tests/actions/button-actions.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { getButtonAction, runAllButtonActionTests, type ButtonActionRegistry } from "../../src/actions/button-actions";

describe("button action registry", () => {
  it("runs every registered test action and returns structured results", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const actions: ButtonActionRegistry = {
      btnFirst: { name: "runFirst", run: first },
      btnSecond: { name: "runSecond", run: vi.fn(), test: second }
    };

    await expect(runAllButtonActionTests(actions)).resolves.toEqual([
      { name: "runFirst", ok: true, message: "完成" },
      { name: "runSecond", ok: true, message: "完成" }
    ]);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it("captures action failures without converting them into fake success", async () => {
    const actions: ButtonActionRegistry = {
      btnFail: {
        name: "runFail",
        run: () => {
          throw new Error("真实 WPS 上下文缺失");
        }
      }
    };

    await expect(runAllButtonActionTests(actions)).resolves.toEqual([
      { name: "runFail", ok: false, message: "真实 WPS 上下文缺失" }
    ]);
  });

  it("looks up actions by ribbon button id", () => {
    const action = { name: "runCheck", run: vi.fn() };
    expect(getButtonAction({ btnCheck: action }, "btnCheck")).toBe(action);
    expect(() => getButtonAction({ btnCheck: action }, "missing")).toThrow("未知功能区按钮：missing");
  });
});
```

Update `tests/build/build-output.test.ts` with a source-level registration test:

```ts
  it("registers every ribbon onAction callback through the WPS entrypoint", () => {
    const xml = readText("ribbon.xml");
    const entry = readText("src/entry.ts");
    const types = readText("src/types/wps.ts");
    const actions = [...xml.matchAll(/onAction="ribbon\.([A-Za-z0-9_]+)"/g)].map((match) => match[1]);

    expect(actions.length).toBeGreaterThan(0);
    expect(new Set(actions)).toEqual(new Set(["OnAction"]));
    expect(entry).toContain("root.ribbon = createRibbonHandlers");
    expect(entry).toContain("root.buttonActions = buttonActions");
    expect(entry).toContain("root.__WPS_RUN_ALL_BUTTON_TESTS__");
    for (const action of actions) {
      expect(types).toContain(`${action}(control: RibbonControl): void`);
    }
  });
```

Add a build sync assertion that `package.json` bundles from `src/entry.ts` and update the existing esbuild test entry point from `src/main.ts` to `src/entry.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/actions/button-actions.test.ts tests/build/build-output.test.ts --reporter=dot
```

Expected: FAIL because the action registry and `src/entry.ts` do not exist yet.

- [ ] **Step 3: Implement the action registry**

Create `src/actions/button-actions.ts`:

```ts
export interface ButtonActionTestResult {
  name: string;
  ok: boolean;
  message: string;
}

export interface ButtonAction {
  name: string;
  run(): unknown | Promise<unknown>;
  test?: () => unknown | Promise<unknown>;
}

export type ButtonActionRegistry = Record<string, ButtonAction>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getButtonAction(actions: ButtonActionRegistry, buttonId: string): ButtonAction {
  const action = actions[buttonId];
  if (!action) {
    throw new Error(`未知功能区按钮：${buttonId}`);
  }
  return action;
}

export async function runAllButtonActionTests(actions: ButtonActionRegistry): Promise<ButtonActionTestResult[]> {
  const results: ButtonActionTestResult[] = [];

  for (const action of Object.values(actions)) {
    try {
      await (action.test ?? action.run)();
      results.push({ name: action.name, ok: true, message: "完成" });
    } catch (error) {
      results.push({ name: action.name, ok: false, message: errorMessage(error) });
    }
  }

  return results;
}
```

- [ ] **Step 4: Refactor runtime wiring into explicit globals**

Modify `src/main.ts` so it exports wiring helpers but does not register globals as a module side effect:

```ts
import type { ButtonActionRegistry } from "./actions/button-actions";
import { runPerformanceDiagnostics } from "./macros/performance-diagnostics";
import { runCurrentSheetQueryWithState, toggleMaterialRows } from "./macros/current-sheet-query";
import { setupOutputSheets } from "./macros/output-sheets";
import { runScrapVariancePrecheck } from "./macros/scrap-variance-precheck";
import { buildDefaultQueryDialogState } from "./query-dialog/state";
import { openQueryDialogAndRun } from "./query-dialog/open-query-dialog";
import { createRibbonHandlers } from "./ribbon/handlers";
import type { ScrapVarianceGlobal } from "./types/wps";

export function reportRuntimeError(error: unknown): void {
  // existing implementation remains unchanged
}

export function createDefaultButtonActions(root: ScrapVarianceGlobal): ButtonActionRegistry {
  return {
    btnPrecheck: {
      name: "runPrecheck",
      run: () => runScrapVariancePrecheck(root)
    },
    btnSetupOutputSheets: {
      name: "setupOutputSheets",
      run: () => setupOutputSheets(root)
    },
    btnQueryCurrentSheet: {
      name: "queryCurrentSheet",
      run: () => openQueryDialogAndRun(root, (state) => runCurrentSheetQueryWithState(root, state), reportRuntimeError),
      test: () => runCurrentSheetQueryWithState(root, buildDefaultQueryDialogState())
    },
    btnToggleMaterialRows: {
      name: "toggleMaterialRows",
      run: () => toggleMaterialRows(root)
    },
    btnPerformanceDiagnostics: {
      name: "runDiagnostics",
      run: () => runPerformanceDiagnostics(root)
    }
  };
}

export function createWpsRibbon(root: ScrapVarianceGlobal, buttonActions: ButtonActionRegistry) {
  return createRibbonHandlers({
    root,
    buttonActions,
    reportError: reportRuntimeError
  });
}
```

The `btnQueryCurrentSheet.test` path is intentionally non-GUI: it runs the same query macro with default blank state instead of opening a modal dialog. The dialog bridge itself remains covered by adapter mock tests, and real WPS results are only produced by `__WPS_RUN_ALL_BUTTON_TESTS__()` inside WPS.

Create `src/entry.ts`:

```ts
import { runAllButtonActionTests } from "./actions/button-actions";
import { createDefaultButtonActions, createWpsRibbon } from "./main";
import type { ScrapVarianceGlobal } from "./types/wps";

const root = globalThis as ScrapVarianceGlobal;
const buttonActions = createDefaultButtonActions(root);

root.buttonActions = buttonActions;
root.ribbon = createWpsRibbon(root, buttonActions);
root.__WPS_RUN_ALL_BUTTON_TESTS__ = () => runAllButtonActionTests(buttonActions);
```

- [ ] **Step 5: Dispatch ribbon buttons through the registry**

Modify `src/ribbon/handlers.ts`:

```ts
import { getButtonAction, type ButtonActionRegistry } from "../actions/button-actions";
```

Change `RibbonDependencies`:

```ts
export interface RibbonDependencies {
  buttonActions: ButtonActionRegistry;
  reportError(error: unknown): void;
  root?: ScrapVarianceGlobal;
}
```

Change `OnAction` dispatch:

```ts
const controlId = getControlId(control);
getButtonAction(dependencies.buttonActions, controlId).run();
```

Update `tests/ribbon/main-entry.test.ts` so button dispatch uses mock `buttonActions` instead of individual dependency callbacks. Keep the unknown button and dependency error tests.

- [ ] **Step 6: Add WPS global types**

Modify `src/types/wps.ts`:

```ts
import type { ButtonActionRegistry, ButtonActionTestResult } from "../actions/button-actions";
```

Extend `ScrapVarianceGlobal`:

```ts
  buttonActions?: ButtonActionRegistry;
  __WPS_RUN_ALL_BUTTON_TESTS__?: () => Promise<ButtonActionTestResult[]>;
```

- [ ] **Step 7: Update build entry and bundle tests**

Modify `package.json`:

```json
"bundle": "esbuild src/entry.ts --bundle --format=iife --target=es2018 --main-fields=module,main --legal-comments=none --minify-whitespace --line-limit=160 --outfile=main.js",
"bundle:prod": "esbuild src/entry.ts --bundle --format=iife --target=es2018 --main-fields=module,main --legal-comments=none --minify --outfile=main.js",
```

Update `tests/build/build-output.test.ts`:

```ts
const entry = readText("src/entry.ts");
const main = readText("src/main.ts");
expect(entry).toContain("__WPS_RUN_ALL_BUTTON_TESTS__");
expect(entry).toContain("root.buttonActions");
expect(main).toContain("createDefaultButtonActions");
```

Update the committed-bundle esbuild test to use:

```ts
entryPoints: [resolve(repoRoot, "src/entry.ts")]
```

- [ ] **Step 8: Add manual WPS test instructions**

Create `MANUAL_TEST.md`:

```md
# WPS 真机测试

## 按钮 action 真机测试入口

这个入口只在 WPS 真实运行环境里产生真机测试结果。Node/Vitest 只能验证 core、注册表和 WPS adapter mock，不允许把 Node 输出当成 WPS 真机结果。

1. 启动本地加载项服务：

   ```bash
   npm run dev
   ```

2. 在 WPS 中打开测试工作簿，确保 OA/ERP 源数据工作表存在。

3. 在 WPS 中按 `ALT + F12` 打开 JS 调试器，执行：

   ```js
   await window.__WPS_RUN_ALL_BUTTON_TESTS__()
   ```

4. 返回值是数组，每项结构为：

   ```js
   {
     name: "runPrecheck",
     ok: true,
     message: "完成"
   }
   ```

`ok: false` 表示该 action 在当前 WPS 工作簿、当前活动工作表或当前选区下真实失败，`message` 是失败原因。不要手工改写为通过。

## GUI 点击冒烟测试

GUI 点击只用于冒烟，不作为主要验证方式。

- X11：可以使用 `xdotool` 激活 WPS 窗口并点击一个代表性按钮，然后检查日志或单元格结果。
- Wayland：不默认使用 `xdotool`；使用桌面环境支持的自动化工具，或手工点击一个代表性按钮后检查日志或单元格结果。
```

- [ ] **Step 9: Run focused tests**

Run:

```bash
npm test -- tests/actions/button-actions.test.ts tests/ribbon/main-entry.test.ts tests/build/build-output.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 10: Commit Task 5**

```bash
git add src/actions/button-actions.ts tests/actions/button-actions.test.ts src/entry.ts src/main.ts src/ribbon/handlers.ts src/types/wps.ts tests/ribbon/main-entry.test.ts tests/build/build-output.test.ts package.json MANUAL_TEST.md
git commit -m "feat: add WPS button action test entry"
```

---

### Task 6: Documentation, Bundle Sync, and Final Verification

**Files:**
- Modify: `docs/wps-js-usage.md`
- Modify: `main.js`

- [ ] **Step 1: Update usage documentation**

In `docs/wps-js-usage.md`, replace the section that says query input is in ribbon controls with:

```md
点击 `查询当前页` 会打开 `报废差异查询条件` 弹窗。弹窗包含：

- `公司简称`
- `一级部门`
- `二级部门`
- `开始日期`
- `结束日期`
- `查询方向`

弹窗每次打开默认空白，空白表示 `all`，不限制该字段。只填写 `公司简称=数控` 时，一级部门、二级部门和日期都不限制，只按公司筛选数控。

按钮行为：

- `查询`：按弹窗当前条件刷新当前激活输出表。
- `清空`：清空弹窗里的公司、部门、日期，并把查询方向恢复为 `OA金蝶单号查ERP`。
- `取消`：关闭弹窗，不刷新输出表。
```

Update validation steps:

```md
4. 切换到要刷新的输出表，点击 `查询当前页`。
5. 在弹窗中填写本次查询条件；空白字段表示 all。
6. 点击 `查询`，确认只刷新当前激活的输出表。
7. 在 `OA视角单据对比` 或 `ERP视角单据对比` 选中 `行类型=汇总` 的单据行，点击 `展开物料` 查看物料级数量和金额；再次点击同一汇总行会收起。
```

- [ ] **Step 2: Build bundle**

Run:

```bash
npm run build
```

Expected: `tsc --noEmit` passes and esbuild refreshes `main.js`.

- [ ] **Step 3: Run full test suite**

Run:

```bash
npm test -- --reporter=dot
```

Expected: all Vitest files pass.

- [ ] **Step 4: Run whitespace and bundle red-flag checks**

Run:

```bash
git diff --check
rg -n "document\\.write|src/macros|ribbon\\.js|require\\(|process\\.|child_process|fs\\b|path\\b" main.js
```

Expected:

- `git diff --check` exits 0.
- `rg ... main.js` exits 1 with no matches.

- [ ] **Step 5: Commit Task 6**

```bash
git add docs/wps-js-usage.md main.js
git commit -m "docs: document query dialog workflow"
```

- [ ] **Step 6: Restart local debug server for manual WPS testing**

Find current server:

```bash
pgrep -af "npm run build && wpsjs debug|wpsjs debug"
```

If a previous server is running, stop only those PIDs:

```bash
kill <shell-pid> <node-pid>
```

Start fresh:

```bash
npm run dev
```

Expected output includes:

```text
启动本地web服务(http://127.0.0.1:3889)成功
```

Manual smoke checklist in WPS:

- Close and reopen the workbook to avoid cached ribbon XML.
- Click `查询当前页`; the query dialog opens.
- Leave all fields blank and click `查询`; current output page shows all matching rows.
- Click `查询当前页`; enter `公司简称=数控`, leave other fields blank, click `查询`; output is filtered to `数控`.
- Click `查询当前页`; enter an invalid date such as `abc`, click `查询`; existing output is not cleared and an error is shown.
- In `OA视角单据对比`, select a `汇总` row and click `展开物料`; material rows appear below the summary row.

---

## Plan Self-Review

Spec coverage:

- Fresh query dialog opened from `查询当前页`: Task 3 and Task 4.
- Default blank conditions and blank-as-all semantics: Task 1 and Task 2.
- Query direction in dialog: Task 1, Task 4 static UI.
- Buttons `查询 / 清空 / 取消`: Task 4 static UI and script.
- Query uses submitted state only, not ribbon/global state: Task 2 and Task 3.
- Three output sheets remain non-linked: Task 2 keeps current active-sheet dispatch.
- Hidden query state remains for material expansion: Task 2 asserts `CB2:CG2`.
- Input errors before output clearing: Task 1 validates, Task 3 reports validation errors before running query.
- WPS button action registry and real-machine runner: Task 5.
- Node does not fake WPS real-machine results: Task 5 tests and `MANUAL_TEST.md`.
- GUI click testing is only documented as smoke, with X11 and Wayland separated: Task 5.
- Docs and build/bundle sync: Task 6.

Placeholder scan:

- No `TBD`, `TODO`, or open implementation placeholders remain.
- Obsolete ribbon input callbacks are explicitly removed in Task 4.

Type consistency:

- `RibbonQueryState`, `QueryDialogStateInput`, `runCurrentSheetQueryWithState`, `openQueryDialogAndRun`, and `QUERY_DIALOG_RESULT_KEY` are introduced before later tasks use them.
- PluginStorage and ShowDialog type additions are planned before bridge implementation depends on them.
- `ButtonActionRegistry`, `buttonActions`, and `__WPS_RUN_ALL_BUTTON_TESTS__` are introduced before bundle entrypoint tests depend on them.
