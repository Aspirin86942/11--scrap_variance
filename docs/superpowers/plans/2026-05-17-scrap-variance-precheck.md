# Scrap Variance Precheck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent WPS JS precheck macro that validates the OA and ERP source sheets before running the existing scrap variance query.

**Architecture:** Keep the precheck in `src/scrap_variance_precheck.js` so the existing query macro stays untouched. Use pure validation helpers plus a thin WPS worksheet adapter, matching the conservative WPS-compatible style already used by `src/scrap_variance_query.js`.

**Tech Stack:** WPS JS macro syntax, JavaScript, Node.js `node:test`, `vm` source loading.

---

## Scope Check

This is one small subsystem: a standalone precheck macro. It does not change query matching, grouping, result writing, or button behavior in `src/scrap_variance_query.js`.

## File Structure

- Create: `src/scrap_variance_precheck.js`
  - Defines required OA and ERP headers.
  - Reads `查询OA-存货报废申请单` and `查询ERP-报废明细表`.
  - Validates table existence, required headers, dates, numeric fields, required key cells, duplicate business keys, and ERP source OA references.
  - Writes results to `预验证结果`.
  - Exposes `runScrapVariancePrecheck()` and `预验证_Click()`.
- Create: `tests/scrap_variance_precheck.test.js`
  - Loads the macro source with `vm`.
  - Verifies WPS-compatible source constraints.
  - Tests pure validation helpers and fake workbook output.

## Task 1: Precheck Tests

**Files:**
- Create: `tests/scrap_variance_precheck.test.js`

- [ ] **Step 1: Write failing tests**

Add tests that expect:

- `预验证_Click()` delegates to `runScrapVariancePrecheck()`.
- The source avoids IIFE, `module.exports`, top-level executable wrappers, and trailing commas.
- Missing headers become `错误`.
- Invalid dates and invalid numbers become `错误`.
- Blank key cells become `错误`.
- Duplicate OA/ERP business keys become `提醒`.
- ERP `源单单号` not found in full OA form numbers becomes `提醒`.
- `runScrapVariancePrecheck()` writes a `预验证结果` sheet through `Value2`.

- [ ] **Step 2: Verify the tests fail**

Run:

```bash
node --test tests/scrap_variance_precheck.test.js
```

Expected: FAIL because `src/scrap_variance_precheck.js` does not exist.

## Task 2: Precheck Macro

**Files:**
- Create: `src/scrap_variance_precheck.js`

- [ ] **Step 1: Implement the smallest macro that satisfies the tests**

Use only WPS-safe syntax:

- `function` declarations and `var`.
- No IIFE.
- No `module.exports`.
- No trailing commas before `]` or `}`.
- No top-level object/array constants that have caused WPS parser issues.

- [ ] **Step 2: Run focused tests**

Run:

```bash
node --test tests/scrap_variance_precheck.test.js
```

Expected: PASS.

## Task 3: Regression Check

**Files:**
- Existing query files remain unchanged by this task.

- [ ] **Step 1: Run query macro tests to verify the new file did not disturb existing behavior**

Run:

```bash
node --test tests/scrap_variance_query.test.js
```

Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
node --test tests/*.test.js
```

Expected: PASS.

## 伪代码草案

```js
function runScrapVariancePrecheck() {
  // 输入：
  // - 当前 WPS 工作簿
  // - OA 表：查询OA-存货报废申请单，表头第 3 行
  // - ERP 表：查询ERP-报废明细表，表头第 1 行
  // 输出：
  // - 预验证结果 工作表
  // - 错误和提醒明细；没有问题时输出“未发现预验证问题”

  var issues = [];

  try {
    var oaSheet = getSheetByName("查询OA-存货报废申请单");
    var erpSheet = getSheetByName("查询ERP-报废明细表");
    var oaTable = readSheetTable(oaSheet, 3);
    var erpTable = readSheetTable(erpSheet, 1);

    issues = issues.concat(validateRequiredHeaders("OA", oaTable, getOaRequiredHeaders()));
    issues = issues.concat(validateRequiredHeaders("ERP", erpTable, getErpRequiredHeaders()));

    if (!hasBlockingHeaderErrors(issues)) {
      issues = issues.concat(validateDateColumn("OA", oaTable.rows, "申请日期"));
      issues = issues.concat(validateDateColumn("ERP", erpTable.rows, "日期"));
      issues = issues.concat(validateNumberColumn("OA", oaTable.rows, "数量"));
      issues = issues.concat(validateNumberColumn("OA", oaTable.rows, "实际预算金额mx"));
      issues = issues.concat(validateNumberColumn("ERP", erpTable.rows, "实发数量"));
      issues = issues.concat(validateNumberColumn("ERP", erpTable.rows, "总成本"));
      issues = issues.concat(validateRequiredCell("OA", oaTable.rows, "表单编号"));
      issues = issues.concat(validateRequiredCell("OA", oaTable.rows, "物料代码"));
      issues = issues.concat(validateRequiredCell("ERP", erpTable.rows, "源单单号"));
      issues = issues.concat(validateRequiredCell("ERP", erpTable.rows, "物料编码"));
      issues = issues.concat(validateDuplicateKeys("OA", oaTable.rows, ["表单编号", "物料代码"]));
      issues = issues.concat(validateDuplicateKeys("ERP", erpTable.rows, ["源单单号", "物料编码"]));
      issues = issues.concat(validateErpSourceFormExists(erpTable.rows, collectOaFormNumbers(oaTable.rows)));
    }

    writePrecheckResults(issues);
  } catch (error) {
    // 不静默失败；即使预验证本身出错，也写入结果表供用户排查。
    writePrecheckResults([
      buildIssue("错误", "系统", "", "", "", "预验证执行失败", error.message || String(error), "检查工作簿、工作表名称或宏运行环境")
    ]);
  }
}

function 预验证_Click() {
  runScrapVariancePrecheck();
}
```
