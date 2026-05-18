# Query Dialog State Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the query dialog open with the current output sheet's last saved query conditions while keeping `清空` as empty-condition reset.

**Architecture:** The TypeScript WPS bridge reads the active output sheet's hidden query state and writes it to a token-scoped `PluginStorage` key before opening the dialog. The static dialog script reads that token-scoped initial state, fills the form when present, and still returns submitted values through the existing result key. Core query and output metadata behavior remain unchanged.

**Tech Stack:** TypeScript, WPS JS `Application.ShowDialog`, WPS JS `Application.PluginStorage`, static browser JavaScript, esbuild, Vitest.

---

## Workspace Guard

The current checkout already has unstaged changes in files this feature will touch, including `src/query-dialog/open-query-dialog.ts`, `ui/query-dialog.js`, `ui/query-dialog.html`, `tests/query-dialog/open-query-dialog.test.ts`, `tests/build/build-output.test.ts`, `docs/wps-js-usage.md`, and `main.js`.

Implementation workers must:

- Not revert or overwrite pre-existing unstaged changes.
- Check `git diff -- <file>` before editing a dirty target file.
- Use `apply_patch` or normal editor edits only for the scoped changes below.
- Avoid task-level commits in this dirty workspace unless the worker can stage only its own hunks safely. Report changed files instead.
- Keep generated `main.js` synchronized after source changes.

## File Structure

- Modify `src/query-dialog/open-query-dialog.ts`
  - Owns token-scoped initial-state key creation, reading current sheet hidden query state, writing initial state to `PluginStorage`, and clearing it after query/cancel/timeout.
- Modify `tests/query-dialog/open-query-dialog.test.ts`
  - Covers initial-state write, no-state fallback, and cleanup on query/cancel/timeout.
- Modify `ui/query-dialog.js`
  - Owns static dialog form initialization from token-scoped initial state.
- Modify `tests/build/build-output.test.ts`
  - Guards static dialog script shipping the initial-state logic.
- Modify `docs/wps-js-usage.md`
  - Documents that the dialog defaults to the current output sheet's last query conditions and that `清空` clears to all.
- Modify `main.js`
  - Generated bundle refreshed by `npm run build`.

---

### Task 1: Add Token-Scoped Initial State in the WPS Bridge

**Files:**
- Modify: `src/query-dialog/open-query-dialog.ts`
- Modify: `tests/query-dialog/open-query-dialog.test.ts`

- [ ] **Step 1: Read current dirty diff for the target files**

Run:

```bash
git diff -- src/query-dialog/open-query-dialog.ts tests/query-dialog/open-query-dialog.test.ts
```

Expected: output may show existing local edits. Do not revert them. Keep the already-present `outputKind` behavior intact.

- [ ] **Step 2: Write failing tests for initial-state storage and cleanup**

Update `tests/query-dialog/open-query-dialog.test.ts` with these additions.

Add this import near the existing imports:

```ts
import { createFakeSheet } from "../wps-api/fakes";
```

Add this helper after `makeRoot()`:

```ts
function readTokenFromShowDialog(root: ReturnType<typeof makeRoot>): string {
  const [url] = root.Application.ShowDialog.mock.calls[0] ?? [];
  return new URL(String(url)).searchParams.get("token") ?? "";
}

function initialStateStorageKey(token: string): string {
  return `ScrapVarianceQueryDialogInitialState:${token}`;
}
```

Add these tests inside `describe("query dialog bridge", () => { ... })`:

```ts
  it("writes the current output sheet saved query state for the dialog token", () => {
    vi.useFakeTimers();
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    const sheet = createFakeSheet(SHEET_NAMES.oaDocCompare);
    sheet.rangeValues.set("CB2:CG2", [
      ["数控", "生产运营中心", "仓储部", "2026-01-01", "2026-04-27", QUERY_DIRECTIONS.oaKingdeeToErp]
    ]);
    root.Application.ActiveSheet = sheet;

    openQueryDialogAndRun(root, runQuery, reportError);

    const token = readTokenFromShowDialog(root);
    expect(JSON.parse(String(root.Application.PluginStorage.values.get(initialStateStorageKey(token))))).toEqual({
      token,
      state: {
        company: "数控",
        dept1: "生产运营中心",
        dept2: "仓储部",
        startDate: "2026-01-01",
        endDate: "2026-04-27",
        queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp
      }
    });
    vi.clearAllTimers();
  });

  it("does not write initial state when the current output sheet has no saved query state", () => {
    vi.useFakeTimers();
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    root.Application.ActiveSheet = createFakeSheet(SHEET_NAMES.oaDocCompare);

    openQueryDialogAndRun(root, runQuery, reportError);

    const token = readTokenFromShowDialog(root);
    expect(root.Application.PluginStorage.values.get(initialStateStorageKey(token))).toBeUndefined();
    vi.clearAllTimers();
  });

  it("clears initial state after a submitted query result is consumed", () => {
    vi.useFakeTimers();
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    const sheet = createFakeSheet(SHEET_NAMES.oaDocCompare);
    sheet.rangeValues.set("CB2:CG2", [
      ["数控", "", "", "2026-01-01", "2026-04-27", QUERY_DIRECTIONS.oaKingdeeToErp]
    ]);
    root.Application.ActiveSheet = sheet;

    openQueryDialogAndRun(root, runQuery, reportError);
    const token = readTokenFromShowDialog(root);
    root.Application.PluginStorage.setItem(
      QUERY_DIALOG_RESULT_KEY,
      JSON.stringify({
        token,
        action: "query",
        state: {
          company: "数控",
          queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp
        }
      })
    );

    expect(pollQueryDialogResult(root, token, runQuery, reportError)).toBe(true);

    expect(root.Application.PluginStorage.values.get(initialStateStorageKey(token))).toBe("");
    expect(runQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        company: "数控",
        queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp
      })
    );
    vi.clearAllTimers();
  });

  it("clears initial state after a cancel result is consumed", () => {
    vi.useFakeTimers();
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    const sheet = createFakeSheet(SHEET_NAMES.oaDocCompare);
    sheet.rangeValues.set("CB2:CG2", [
      ["数控", "", "", "2026-01-01", "2026-04-27", QUERY_DIRECTIONS.oaKingdeeToErp]
    ]);
    root.Application.ActiveSheet = sheet;

    openQueryDialogAndRun(root, runQuery, reportError);
    const token = readTokenFromShowDialog(root);
    root.Application.PluginStorage.setItem(QUERY_DIALOG_RESULT_KEY, JSON.stringify({ token, action: "cancel" }));

    expect(pollQueryDialogResult(root, token, runQuery, reportError)).toBe(true);

    expect(root.Application.PluginStorage.values.get(initialStateStorageKey(token))).toBe("");
    expect(runQuery).not.toHaveBeenCalled();
    vi.clearAllTimers();
  });

  it("clears initial state when the opened dialog times out", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-19T00:00:00Z"));
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();
    const sheet = createFakeSheet(SHEET_NAMES.oaDocCompare);
    sheet.rangeValues.set("CB2:CG2", [
      ["数控", "", "", "2026-01-01", "2026-04-27", QUERY_DIRECTIONS.oaKingdeeToErp]
    ]);
    root.Application.ActiveSheet = sheet;

    openQueryDialogAndRun(root, runQuery, reportError);
    const token = readTokenFromShowDialog(root);
    vi.advanceTimersByTime(5 * 60 * 1000 + 250);

    expect(root.Application.PluginStorage.values.get(initialStateStorageKey(token))).toBe("");
    expect(reportError).toHaveBeenCalledOnce();
  });
```

- [ ] **Step 3: Run focused tests and verify they fail**

Run:

```bash
npm test -- tests/query-dialog/open-query-dialog.test.ts --reporter=dot
```

Expected: FAIL because `openQueryDialogAndRun()` does not write `ScrapVarianceQueryDialogInitialState:<token>` and `pollQueryDialogResult()` does not clear it yet.

- [ ] **Step 4: Implement the bridge changes**

Update `src/query-dialog/open-query-dialog.ts`.

Add this import:

```ts
import { readOutputQueryState } from "../wps-api/output-metadata";
```

Add this constant next to `QUERY_DIALOG_RESULT_KEY`:

```ts
const QUERY_DIALOG_INITIAL_STATE_KEY_PREFIX = "ScrapVarianceQueryDialogInitialState:";
```

Add these helpers near the existing storage helpers:

```ts
function buildDialogInitialStateKey(token: string): string {
  return `${QUERY_DIALOG_INITIAL_STATE_KEY_PREFIX}${token}`;
}

function clearDialogInitialState(root: ScrapVarianceGlobal, token: string): void {
  getStorage(root).setItem(buildDialogInitialStateKey(token), "");
}

function writeDialogInitialState(
  root: ScrapVarianceGlobal,
  token: string,
  outputKind: OutputSheetKind | null
): void {
  if (!outputKind) {
    return;
  }

  const activeSheet = root.Application?.ActiveSheet;
  if (!activeSheet) {
    return;
  }

  const state = readOutputQueryState(activeSheet);
  if (!state) {
    return;
  }

  getStorage(root).setItem(
    buildDialogInitialStateKey(token),
    JSON.stringify({
      token,
      state
    })
  );
}
```

Change `pollQueryDialogResult()` so a matching result clears both the initial-state key and the result key before handling `cancel` or `query`:

```ts
  clearDialogInitialState(root, token);
  clearDialogResult(root);
  if (result.action === "cancel") {
    return true;
  }
```

Change `openQueryDialogAndRun()` so `outputKind` is computed once, the initial state is written before `ShowDialog()`, and timeout clears it:

```ts
  const token = createDialogToken();
  const outputKind = getActiveOutputKind(root);
  clearDialogResult(root);
  writeDialogInitialState(root, token, outputKind);
  application.ShowDialog(buildDialogUrl(token, outputKind), "报废差异查询条件", 560, 430, false);
```

In the timeout branch, add:

```ts
      clearDialogInitialState(root, token);
      clearDialogResult(root);
```

The timeout branch should not leave the previous single `clearDialogResult(root)` duplicated.

- [ ] **Step 5: Run focused tests and verify they pass**

Run:

```bash
npm test -- tests/query-dialog/open-query-dialog.test.ts --reporter=dot
```

Expected: PASS for all query-dialog bridge tests.

- [ ] **Step 6: Check task diff**

Run:

```bash
git diff -- src/query-dialog/open-query-dialog.ts tests/query-dialog/open-query-dialog.test.ts
```

Expected: diff only adds token-scoped initial-state behavior and tests. Existing `outputKind` behavior remains.

---

### Task 2: Fill the Static Dialog from Initial State and Update User Docs

**Files:**
- Modify: `ui/query-dialog.js`
- Modify: `tests/build/build-output.test.ts`
- Modify: `docs/wps-js-usage.md`
- Modify: `main.js`

- [ ] **Step 1: Read current dirty diff for the target files**

Run:

```bash
git diff -- ui/query-dialog.js tests/build/build-output.test.ts docs/wps-js-usage.md main.js
```

Expected: output may show existing local edits. Do not revert them. Keep current `outputKind` and disabled direction behavior intact.

- [ ] **Step 2: Write the failing static-shipping test**

Update the `ships the static query dialog page` test in `tests/build/build-output.test.ts` by adding these expectations after the existing result-key expectation:

```ts
    expect(script).toContain("ScrapVarianceQueryDialogInitialState:");
    expect(script).toContain("readInitialState");
    expect(script).toContain("initializeForm");
```

- [ ] **Step 3: Run the focused build-output test and verify it fails**

Run:

```bash
npm test -- tests/build/build-output.test.ts --reporter=dot
```

Expected: FAIL because `ui/query-dialog.js` does not contain the initial-state read functions yet.

- [ ] **Step 4: Implement initial-state form filling in the static dialog script**

Update `ui/query-dialog.js`.

Add this function after `getToken()`:

```js
  function getInitialStateKey() {
    return "ScrapVarianceQueryDialogInitialState:" + getToken();
  }
```

Add these helpers after `setValue()`:

```js
  function stateValue(state, key) {
    if (!state || !Object.prototype.hasOwnProperty.call(state, key) || state[key] == null) {
      return "";
    }
    return String(state[key]);
  }

  function normalizeDirectionValue(value) {
    return value === REVERSE_DIRECTION ? REVERSE_DIRECTION : DEFAULT_DIRECTION;
  }
```

Add these functions after `getStorage()` or near the other state helpers:

```js
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
```

Replace the bottom initialization:

```js
  resetForm();
  setDirectionEnabled(isDirectionEditable());
```

with:

```js
  initializeForm();
```

Keep `btnClear` wired to `resetForm`, so `清空` still clears to empty conditions.

- [ ] **Step 5: Update user-facing documentation**

Update the query section of `docs/wps-js-usage.md`.

Replace this sentence if present:

```md
弹窗每次打开默认空白。空白表示 `all`，不限制该字段。只填写 `公司简称=数控` 时，一级部门、二级部门和日期都不限制，只按公司筛选数控。
```

with:

```md
弹窗打开时会优先带入当前输出表上次查询保存的条件；如果当前输出表还没有查询记录，则默认空白。空白表示 `all`，不限制该字段。只填写 `公司简称=数控` 时，一级部门、二级部门和日期都不限制，只按公司筛选数控。
```

In the button behavior list, make the `清空` bullet read:

```md
- `清空`：清空弹窗里的公司、部门、日期，并把查询方向恢复为 `OA金蝶单号查ERP`；不会恢复上次条件，适合快速改成查全部。
```

Add this paragraph after the `查询当前页` only-refreshes-current-sheet sentence:

```md
每张输出表的弹窗初始条件彼此独立。切换到另一张输出表再点 `查询当前页` 时，弹窗带入的是那张输出表自己的上次查询条件，不会带入前一张输出表的条件。
```

- [ ] **Step 6: Run focused tests before rebuilding bundle**

Run:

```bash
npm test -- tests/build/build-output.test.ts tests/query-dialog/open-query-dialog.test.ts --reporter=dot
```

Expected: `tests/build/build-output.test.ts` may still fail at the `main.js` sync assertion until `npm run build` refreshes the bundle. Other assertions should pass.

- [ ] **Step 7: Rebuild committed bundle**

Run:

```bash
npm run build
```

Expected: PASS. `main.js` is updated by esbuild.

- [ ] **Step 8: Run focused tests after bundle sync**

Run:

```bash
npm test -- tests/build/build-output.test.ts tests/query-dialog/open-query-dialog.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 9: Check task diff**

Run:

```bash
git diff -- ui/query-dialog.js tests/build/build-output.test.ts docs/wps-js-usage.md main.js
```

Expected: diff shows initial-state reading in `ui/query-dialog.js`, static-shipping assertions, docs update, and synchronized bundle output. `清空` still calls `resetForm`.

---

### Task 3: Final Verification and Runtime Red-Flag Scan

**Files:**
- Verify: all changed files

- [ ] **Step 1: Run full project tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run full build**

Run:

```bash
npm run build
```

Expected: PASS, and no unexpected source changes except a synchronized `main.js` if esbuild normalizes output.

- [ ] **Step 3: Check whitespace errors**

Run:

```bash
git diff --check
```

Expected: no output and exit code 0.

- [ ] **Step 4: Scan generated bundle for runtime red flags**

Run:

```bash
rg -n "document\\.write|require\\(|process\\.|child_process|\\bfs\\b|\\bpath\\b|src/macros|ribbon\\.js" main.js
```

Expected: no output. If there is output, inspect it before reporting success; do not ignore a WPS runtime red flag.

- [ ] **Step 5: Summarize dirty worktree without committing unrelated changes**

Run:

```bash
git status --short
```

Expected: target feature files may be modified, and pre-existing unrelated files may still be present. Do not stage or commit unrelated dirty changes from before this plan.

Report:

- Files changed for query dialog state persistence.
- Verification commands and results.
- Any pre-existing dirty files left untouched.
