# WPS Addin Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the existing WPS JS scrap variance scripts as a lightweight WPS add-in with ribbon buttons, keeping the OA/ERP business logic unchanged.

**Architecture:** Add a minimal `wpsjs` project shell at the repository root and expose existing actions through `ribbon.xml` and `ribbon.js`. Move the query and precheck business scripts into `src/macros/`, add small `src/utils/` and `src/wps-api/` runtime helpers, and keep Node-only code confined to tests.

**Tech Stack:** JavaScript, WPS JS add-in runtime, `wpsjs`, Node.js `node:test`.

---

## Scope Check

This migration is not a new business system. It only changes how the existing WPS workbook logic is launched: from pasted macro functions to add-in ribbon buttons. It keeps the current workbook-only behavior and does not add external import, backend services, sidebars, or web UI.

## File Structure

- Create: `package.json`
  - Provides `npm run dev`, `npm test`, and a `wpsjs` dev dependency.
- Create: `main.js`
  - Loads runtime helpers, macro modules, and ribbon entrypoints.
- Create: `ribbon.xml`
  - Defines one tab/group for the scrap variance tool.
- Create: `ribbon.js`
  - Defines WPS ribbon callbacks and routes button IDs to macro entrypoints.
- Create: `src/macros/scrap-variance-query.js`
  - Holds the current query macro logic and exposes `window.ScrapVarianceQuery`.
- Create: `src/macros/scrap-variance-precheck.js`
  - Holds the current precheck macro logic and exposes `window.ScrapVariancePrecheck`.
- Create: `src/utils/runtime.js`
  - Holds small runtime helpers that do not touch WPS objects.
- Create: `src/wps-api/runtime.js`
  - Holds small WPS runtime error helpers for add-in entrypoints.
- Modify: `tests/scrap_variance_query.test.js`
  - Load the query macro from `src/macros/scrap-variance-query.js`.
- Modify: `tests/scrap_variance_precheck.test.js`
  - Load the precheck macro from `src/macros/scrap-variance-precheck.js`.
- Create: `tests/addin_structure.test.js`
  - Verifies add-in files, ribbon buttons, runtime entry dispatch, and absence of Node-only APIs in runtime files.
- Modify: `docs/wps-js-usage.md`
  - Document `npm run dev` and WPS button verification.

## Task 1: Add Failing Add-in Tests

**Files:**
- Create: `tests/addin_structure.test.js`

- [ ] **Step 1: Write tests for add-in structure and ribbon dispatch**

The test should verify:

- `package.json`, `main.js`, `ribbon.xml`, and `ribbon.js` exist.
- `src/macros`, `src/wps-api`, and `src/utils` exist.
- `ribbon.xml` contains the labels `报废差异工具`, `预验证数据`, `初始化查询面板`, and `执行差异查询`.
- `ribbon.js` exposes `window.ribbon.OnAction`.
- `OnAction` dispatches button IDs to `ScrapVariancePrecheck.runScrapVariancePrecheck`, `ScrapVarianceQuery.setupQueryPanel`, and `ScrapVarianceQuery.runScrapVarianceQuery`.
- Runtime files do not use `require(`, `fs`, `path`, `process`, or `child_process`.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/addin_structure.test.js
```

Expected: FAIL because add-in files do not exist yet.

## Task 2: Add Minimal Add-in Shell

**Files:**
- Create: `package.json`
- Create: `main.js`
- Create: `ribbon.xml`
- Create: `ribbon.js`
- Create: `src/utils/runtime.js`
- Create: `src/wps-api/runtime.js`

- [ ] **Step 1: Implement package and runtime shell**

Use `wpsjs` as a dev dependency and define:

```json
{
  "scripts": {
    "dev": "wpsjs debug",
    "test": "node --test tests/*.test.js"
  }
}
```

Add `main.js` imports for helpers, macro modules, and `ribbon.js`.

- [ ] **Step 2: Implement ribbon dispatch**

Use a generic `window.ribbon.OnAction(control)` callback and route by button ID. Each route must use `try/catch`; failures call a small add-in error reporter that prefers `alert`.

- [ ] **Step 3: Run add-in structure tests**

Run:

```bash
node --test tests/addin_structure.test.js
```

Expected: still fail until macro modules are migrated.

## Task 3: Move Existing Scripts Into Macro Modules

**Files:**
- Move: `src/scrap_variance_query.js` -> `src/macros/scrap-variance-query.js`
- Move: `src/scrap_variance_precheck.js` -> `src/macros/scrap-variance-precheck.js`
- Modify: `tests/scrap_variance_query.test.js`
- Modify: `tests/scrap_variance_precheck.test.js`

- [ ] **Step 1: Move files mechanically**

Use `git mv` so history remains traceable.

- [ ] **Step 2: Expose macro namespaces**

At the bottom of the query file, expose:

```js
if (typeof window !== "undefined") {
  window.ScrapVarianceQuery = {
    setupQueryPanel: setupQueryPanel,
    runScrapVarianceQuery: runScrapVarianceQuery,
    查询_Click: 查询_Click
  };
}
```

At the bottom of the precheck file, expose:

```js
if (typeof window !== "undefined") {
  window.ScrapVariancePrecheck = {
    runScrapVariancePrecheck: runScrapVariancePrecheck,
    预验证_Click: 预验证_Click
  };
}
```

- [ ] **Step 3: Update tests to load new paths**

Change test source paths to `src/macros/scrap-variance-query.js` and `src/macros/scrap-variance-precheck.js`.

- [ ] **Step 4: Run focused macro tests**

Run:

```bash
node --test tests/scrap_variance_query.test.js tests/scrap_variance_precheck.test.js
```

Expected: PASS.

## Task 4: Document Dev Verification

**Files:**
- Modify: `docs/wps-js-usage.md`

- [ ] **Step 1: Add add-in usage instructions**

Document:

- `npm install`
- `npm run dev`
- Open WPS and verify the `报废差异工具` tab/group.
- Click `预验证数据`, `初始化查询面板`, and `执行差异查询`.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm test
git diff --check
```

Expected: PASS and no whitespace errors.

## 伪代码草案

```js
// ribbon.js
// 目标：加载项功能区只提供按钮入口，不承载 OA/ERP 对账业务。
function onRibbonAction(control) {
  var id = getControlId(control);

  try {
    if (id === "btnPrecheck") {
      window.ScrapVariancePrecheck.runScrapVariancePrecheck();
      return;
    }

    if (id === "btnInitQueryPanel") {
      window.ScrapVarianceQuery.setupQueryPanel();
      return;
    }

    if (id === "btnRunQuery") {
      window.ScrapVarianceQuery.runScrapVarianceQuery();
      return;
    }

    throw new Error("未知功能区按钮：" + id);
  } catch (error) {
    // 为什么在入口层兜底：加载项按钮失败不能静默，否则用户不知道是表结构问题还是加载项没加载。
    window.ScrapVarianceAddinRuntime.showError(error);
  }
}
```
