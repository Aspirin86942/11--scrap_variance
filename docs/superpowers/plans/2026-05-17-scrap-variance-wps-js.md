# Scrap Variance WPS JS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight WPS JS macro that compares OA scrap applications with ERP scrap outbound records by company, department, date range, OA form, and material.

**Architecture:** Keep one hand-editable macro file with pure comparison functions plus a thin WPS worksheet adapter. Test the pure functions with Node's built-in test runner, then manually verify the worksheet adapter inside WPS because the local environment cannot execute WPS macros.

**Tech Stack:** JavaScript, WPS JS macro API, Node.js `node:test`, Git.

---

## Scope Check

The approved spec describes one subsystem: a WPS workbook macro for scrap variance query. It does not need separate plans. The implementation keeps the code intentionally small and avoids external packages.

## File Structure

- Create: `src/scrap_variance_query.js`
  - One WPS macro file.
  - Contains pure core functions for filtering, grouping, comparing, and rendering results.
  - Contains thin WPS-specific functions for reading sheets and writing the `查询面板`.
  - Exposes `runScrapVarianceQuery()` and `setupQueryPanel()` globally for WPS.
  - Exports `ScrapVarianceCore` under Node for tests.
- Create: `tests/scrap_variance_query.test.js`
  - Node tests for date parsing, filters, grouping, comparison, summary, and output table rendering.
- Create: `docs/wps-js-usage.md`
  - Short Chinese usage guide for pasting the macro into WPS, running the query, and binding a button.

## Task 1: Core Data Preparation

**Files:**
- Create: `src/scrap_variance_query.js`
- Create: `tests/scrap_variance_query.test.js`

- [ ] **Step 1: Write failing tests for date parsing, filters, and OA/ERP grouping**

Create `tests/scrap_variance_query.test.js` with this content:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const { ScrapVarianceCore: core } = require("../src/scrap_variance_query.js");

test("buildOaRows filters OA rows and groups by OA form plus material", () => {
  const filters = core.parseFilters({
    company: "数控",
    dept1: "生产运营中心",
    dept2: "仓储部",
    startDate: "2026-05-01",
    endDate: "2026-05-31",
  });

  const oaRows = [
    {
      表单编号: "CHBF2026050001",
      申请日期: "2026/5/1",
      公司简称: "数控",
      一级部门: "生产运营中心",
      二级部门: "仓储部",
      物料代码: "MAT-A",
      物料名称: "物料A",
      数量: 2,
      实际预算金额mx: 10,
    },
    {
      表单编号: "CHBF2026050001",
      申请日期: "2026/5/1",
      公司简称: "数控",
      一级部门: "生产运营中心",
      二级部门: "仓储部",
      物料代码: "MAT-A",
      物料名称: "物料A",
      数量: "3",
      实际预算金额mx: "15",
    },
    {
      表单编号: "CHBF2026060001",
      申请日期: "2026/6/1",
      公司简称: "数控",
      一级部门: "生产运营中心",
      二级部门: "仓储部",
      物料代码: "MAT-B",
      物料名称: "物料B",
      数量: 9,
      实际预算金额mx: 90,
    },
  ];

  const grouped = core.buildOaRows(oaRows, filters);

  assert.deepEqual(Object.keys(grouped), ["CHBF2026050001||MAT-A"]);
  assert.equal(grouped["CHBF2026050001||MAT-A"].quantity, 5);
  assert.equal(grouped["CHBF2026050001||MAT-A"].amount, 25);
});

test("buildErpRowsForOa groups ERP rows only for selected OA forms", () => {
  const oaGrouped = {
    "CHBF2026050001||MAT-A": {
      formNumber: "CHBF2026050001",
      itemCode: "MAT-A",
    },
  };

  const erpRows = [
    {
      单据编号: "QOUT1",
      日期: "2026/5/3",
      源单单号: "CHBF2026050001",
      区分公司简称: "数控",
      一级部门: "生产运营中心",
      二级部门: "仓储部",
      物料编码: "MAT-A",
      物料名称: "物料A",
      实发数量: 2,
      总成本: 20,
    },
    {
      单据编号: "QOUT2",
      日期: "2026/5/4",
      源单单号: "CHBF2026050001",
      区分公司简称: "数控",
      一级部门: "生产运营中心",
      二级部门: "仓储部",
      物料编码: "MAT-A",
      物料名称: "物料A",
      实发数量: 3,
      总成本: 30,
    },
    {
      单据编号: "QOUT999",
      日期: "2026/5/4",
      源单单号: "CHBF9999999999",
      区分公司简称: "数控",
      一级部门: "生产运营中心",
      二级部门: "仓储部",
      物料编码: "MAT-Z",
      物料名称: "物料Z",
      实发数量: 7,
      总成本: 70,
    },
  ];

  const grouped = core.buildErpRowsForOa(erpRows, oaGrouped);

  assert.deepEqual(Object.keys(grouped), ["CHBF2026050001||MAT-A"]);
  assert.equal(grouped["CHBF2026050001||MAT-A"].quantity, 5);
  assert.equal(grouped["CHBF2026050001||MAT-A"].cost, 50);
  assert.deepEqual(grouped["CHBF2026050001||MAT-A"].erpDocNumbers, ["QOUT1", "QOUT2"]);
});

test("buildErpOnlyRows keeps ERP rows whose source OA is not in the full OA export", () => {
  const filters = core.parseFilters({
    company: "数控",
    dept1: "生产运营中心",
    dept2: "仓储部",
    startDate: "2026-05-01",
    endDate: "2026-05-31",
  });

  const allOaFormNumbers = { CHBF2026050001: true };
  const erpRows = [
    {
      单据编号: "QOUT999",
      日期: "2026/5/4",
      源单单号: "CHBF9999999999",
      区分公司简称: "数控",
      一级部门: "生产运营中心",
      二级部门: "仓储部",
      物料编码: "MAT-Z",
      物料名称: "物料Z",
      实发数量: 7,
      总成本: 70,
    },
    {
      单据编号: "QOUT_OLD",
      日期: "2026/4/30",
      源单单号: "CHBF8888888888",
      区分公司简称: "数控",
      一级部门: "生产运营中心",
      二级部门: "仓储部",
      物料编码: "MAT-X",
      物料名称: "物料X",
      实发数量: 8,
      总成本: 80,
    },
  ];

  const grouped = core.buildErpOnlyRows(erpRows, allOaFormNumbers, filters);

  assert.deepEqual(Object.keys(grouped), ["CHBF9999999999||MAT-Z"]);
  assert.equal(grouped["CHBF9999999999||MAT-Z"].quantity, 7);
  assert.equal(grouped["CHBF9999999999||MAT-Z"].cost, 70);
});
```

- [ ] **Step 2: Run the tests to verify they fail before implementation**

Run:

```bash
node --test tests/scrap_variance_query.test.js
```

Expected: FAIL with an error like `Cannot find module '../src/scrap_variance_query.js'`.

- [ ] **Step 3: Create the core preparation implementation**

Create `src/scrap_variance_query.js` with this content:

```js
(function attachScrapVarianceMacro(root) {
  "use strict";

  const CONFIG = {
    sheets: {
      oa: "查询OA-存货报废申请单",
      erp: "查询ERP-报废明细表",
      panel: "查询面板",
    },
    oaHeaders: {
      formNumber: "表单编号",
      date: "申请日期",
      company: "公司简称",
      dept1: "一级部门",
      dept2: "二级部门",
      itemCode: "物料代码",
      itemName: "物料名称",
      quantity: "数量",
      amount: "实际预算金额mx",
    },
    erpHeaders: {
      erpDocNumber: "单据编号",
      date: "日期",
      sourceFormNumber: "源单单号",
      company: "区分公司简称",
      dept1: "一级部门",
      dept2: "二级部门",
      itemCode: "物料编码",
      itemName: "物料名称",
      quantity: "实发数量",
      cost: "总成本",
    },
  };

  function normalizeText(value) {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value).trim();
  }

  function normalizeNumber(value) {
    if (value === null || value === undefined || value === "") {
      return 0;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }
    const cleaned = String(value).replace(/,/g, "").trim();
    if (cleaned === "") {
      return 0;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function normalizeDateKey(value) {
    if (value === null || value === undefined || value === "") {
      return "";
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      const milliseconds = Math.round((value - 25569) * 86400 * 1000);
      const date = new Date(milliseconds);
      return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
    }

    const text = normalizeText(value).replace(/\./g, "-").replace(/\//g, "-");
    const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!match) {
      throw new Error(`日期格式不正确：${value}`);
    }
    return `${match[1]}-${pad2(match[2])}-${pad2(match[3])}`;
  }

  function parseFilters(input) {
    return {
      company: normalizeText(input.company),
      dept1: normalizeText(input.dept1),
      dept2: normalizeText(input.dept2),
      startDate: normalizeDateKey(input.startDate),
      endDate: normalizeDateKey(input.endDate),
    };
  }

  function isDateInRange(dateKey, filters) {
    if (!dateKey) {
      return false;
    }
    if (filters.startDate && dateKey < filters.startDate) {
      return false;
    }
    if (filters.endDate && dateKey > filters.endDate) {
      return false;
    }
    return true;
  }

  function matchesOrgFilters(row, filters, headers) {
    const company = normalizeText(row[headers.company]);
    const dept1 = normalizeText(row[headers.dept1]);
    const dept2 = normalizeText(row[headers.dept2]);

    if (filters.company && company !== filters.company) {
      return false;
    }
    if (filters.dept1 && dept1 !== filters.dept1) {
      return false;
    }
    if (filters.dept2 && dept2 !== filters.dept2) {
      return false;
    }
    return true;
  }

  function makeDetailKey(formNumber, itemCode) {
    return `${normalizeText(formNumber)}||${normalizeText(itemCode)}`;
  }

  function uniquePush(list, value) {
    const text = normalizeText(value);
    if (text && list.indexOf(text) === -1) {
      list.push(text);
    }
  }

  function buildAllOaFormNumberSet(oaRows) {
    const result = {};
    for (const row of oaRows) {
      const formNumber = normalizeText(row[CONFIG.oaHeaders.formNumber]);
      if (formNumber) {
        result[formNumber] = true;
      }
    }
    return result;
  }

  function buildOaRows(oaRows, filters) {
    const result = {};
    const headers = CONFIG.oaHeaders;

    for (const row of oaRows) {
      const dateKey = normalizeDateKey(row[headers.date]);
      if (!isDateInRange(dateKey, filters)) {
        continue;
      }
      if (!matchesOrgFilters(row, filters, headers)) {
        continue;
      }

      const formNumber = normalizeText(row[headers.formNumber]);
      const itemCode = normalizeText(row[headers.itemCode]);
      if (!formNumber || !itemCode) {
        continue;
      }

      const key = makeDetailKey(formNumber, itemCode);
      if (!result[key]) {
        result[key] = {
          formNumber,
          itemCode,
          itemName: normalizeText(row[headers.itemName]),
          company: normalizeText(row[headers.company]),
          dept1: normalizeText(row[headers.dept1]),
          dept2: normalizeText(row[headers.dept2]),
          quantity: 0,
          amount: 0,
        };
      }

      result[key].quantity += normalizeNumber(row[headers.quantity]);
      result[key].amount += normalizeNumber(row[headers.amount]);
    }

    return result;
  }

  function buildSelectedOaFormNumberSet(oaGroupedRows) {
    const result = {};
    for (const key of Object.keys(oaGroupedRows)) {
      result[oaGroupedRows[key].formNumber] = true;
    }
    return result;
  }

  function addErpRowToGroup(result, row) {
    const headers = CONFIG.erpHeaders;
    const sourceFormNumber = normalizeText(row[headers.sourceFormNumber]);
    const itemCode = normalizeText(row[headers.itemCode]);
    const key = makeDetailKey(sourceFormNumber, itemCode);

    if (!result[key]) {
      result[key] = {
        sourceFormNumber,
        formNumber: sourceFormNumber,
        itemCode,
        itemName: normalizeText(row[headers.itemName]),
        company: normalizeText(row[headers.company]),
        dept1: normalizeText(row[headers.dept1]),
        dept2: normalizeText(row[headers.dept2]),
        quantity: 0,
        cost: 0,
        erpDocNumbers: [],
      };
    }

    result[key].quantity += normalizeNumber(row[headers.quantity]);
    result[key].cost += normalizeNumber(row[headers.cost]);
    uniquePush(result[key].erpDocNumbers, row[headers.erpDocNumber]);
  }

  function buildErpRowsForOa(erpRows, oaGroupedRows) {
    const result = {};
    const selectedOaFormNumbers = buildSelectedOaFormNumberSet(oaGroupedRows);
    const headers = CONFIG.erpHeaders;

    for (const row of erpRows) {
      const sourceFormNumber = normalizeText(row[headers.sourceFormNumber]);
      const itemCode = normalizeText(row[headers.itemCode]);
      if (!sourceFormNumber || !itemCode || !selectedOaFormNumbers[sourceFormNumber]) {
        continue;
      }
      addErpRowToGroup(result, row);
    }

    return result;
  }

  function buildErpOnlyRows(erpRows, allOaFormNumbers, filters) {
    const result = {};
    const headers = CONFIG.erpHeaders;

    for (const row of erpRows) {
      const sourceFormNumber = normalizeText(row[headers.sourceFormNumber]);
      const itemCode = normalizeText(row[headers.itemCode]);
      const dateKey = normalizeDateKey(row[headers.date]);

      if (!itemCode || allOaFormNumbers[sourceFormNumber]) {
        continue;
      }
      if (!isDateInRange(dateKey, filters)) {
        continue;
      }
      if (!matchesOrgFilters(row, filters, headers)) {
        continue;
      }

      addErpRowToGroup(result, row);
    }

    return result;
  }

  function setupQueryPanel() {
    throw new Error("当前版本只包含核心计算；执行 Task 3 后再在 WPS 中运行查询面板。");
  }

  function runScrapVarianceQuery() {
    throw new Error("当前版本只包含核心计算；执行 Task 3 后再在 WPS 中运行查询入口。");
  }

  const ScrapVarianceCore = {
    CONFIG,
    normalizeText,
    normalizeNumber,
    normalizeDateKey,
    parseFilters,
    makeDetailKey,
    buildAllOaFormNumberSet,
    buildOaRows,
    buildErpRowsForOa,
    buildErpOnlyRows,
  };

  root.ScrapVarianceCore = ScrapVarianceCore;
  root.setupQueryPanel = setupQueryPanel;
  root.runScrapVarianceQuery = runScrapVarianceQuery;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ScrapVarianceCore };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
```

- [ ] **Step 4: Run the tests to verify Task 1 passes**

Run:

```bash
node --test tests/scrap_variance_query.test.js
```

Expected: PASS for all three tests.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add src/scrap_variance_query.js tests/scrap_variance_query.test.js
git commit -m "feat: add scrap variance data preparation"
```

Expected: commit succeeds.

## Task 2: Difference Comparison and Summary

**Files:**
- Modify: `src/scrap_variance_query.js`
- Modify: `tests/scrap_variance_query.test.js`

- [ ] **Step 1: Add failing tests for difference types and summary aggregation**

Append this content to `tests/scrap_variance_query.test.js`:

```js
test("compareRows emits missing shipment, material mismatch, quantity mismatch, and ERP-only rows", () => {
  const oaGrouped = {
    "CHBF1||MAT-A": {
      formNumber: "CHBF1",
      itemCode: "MAT-A",
      itemName: "物料A",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      quantity: 5,
      amount: 50,
    },
    "CHBF2||MAT-B": {
      formNumber: "CHBF2",
      itemCode: "MAT-B",
      itemName: "物料B",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      quantity: 3,
      amount: 30,
    },
    "CHBF3||MAT-C": {
      formNumber: "CHBF3",
      itemCode: "MAT-C",
      itemName: "物料C",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      quantity: 4,
      amount: 40,
    },
  };

  const erpForOa = {
    "CHBF1||MAT-A": {
      sourceFormNumber: "CHBF1",
      formNumber: "CHBF1",
      itemCode: "MAT-A",
      itemName: "物料A",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      quantity: 4,
      cost: 44,
      erpDocNumbers: ["QOUT1"],
    },
    "CHBF2||MAT-X": {
      sourceFormNumber: "CHBF2",
      formNumber: "CHBF2",
      itemCode: "MAT-X",
      itemName: "物料X",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      quantity: 3,
      cost: 33,
      erpDocNumbers: ["QOUT2"],
    },
  };

  const erpOnlyRows = {
    "CHBF999||MAT-Z": {
      sourceFormNumber: "CHBF999",
      formNumber: "CHBF999",
      itemCode: "MAT-Z",
      itemName: "物料Z",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      quantity: 7,
      cost: 77,
      erpDocNumbers: ["QOUT999"],
    },
  };

  const details = core.compareRows(oaGrouped, erpForOa, erpOnlyRows);

  assert.equal(
    details.find((row) => row.formNumber === "CHBF1").differenceType,
    "OA和ERP都有，但数量不同",
  );
  assert.equal(
    details.find((row) => row.formNumber === "CHBF2" && row.itemCode === "MAT-B").differenceType,
    "OA和ERP都有，但物料明细不一致",
  );
  assert.equal(
    details.find((row) => row.formNumber === "CHBF2" && row.itemCode === "MAT-X").differenceType,
    "OA和ERP都有，但物料明细不一致",
  );
  assert.equal(
    details.find((row) => row.formNumber === "CHBF3").differenceType,
    "OA有申请，ERP无出库",
  );
  assert.equal(
    details.find((row) => row.formNumber === "CHBF999").differenceType,
    "ERP出库对应OA未在当前OA数据中找到",
  );
});

test("buildSummaryRows aggregates quantities, amounts, costs, and difference type summaries", () => {
  const detailRows = [
    {
      differenceType: "OA和ERP都有，但数量不同",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      oaQuantity: 5,
      erpQuantity: 4,
      oaAmount: 50,
      erpCost: 44,
    },
    {
      differenceType: "OA有申请，ERP无出库",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      oaQuantity: 3,
      erpQuantity: 0,
      oaAmount: 30,
      erpCost: 0,
    },
  ];

  const summary = core.buildSummaryRows(detailRows);

  assert.equal(summary.length, 1);
  assert.equal(summary[0].company, "数控");
  assert.equal(summary[0].oaQuantity, 8);
  assert.equal(summary[0].erpQuantity, 4);
  assert.equal(summary[0].quantityDiff, 4);
  assert.equal(summary[0].oaAmount, 80);
  assert.equal(summary[0].erpCost, 44);
  assert.equal(summary[0].amountDiff, 36);
  assert.equal(summary[0].differenceSummary, "OA和ERP都有，但数量不同、OA有申请，ERP无出库");
});
```

- [ ] **Step 2: Run the tests to verify the new comparison tests fail**

Run:

```bash
node --test tests/scrap_variance_query.test.js
```

Expected: FAIL with an error like `core.compareRows is not a function`.

- [ ] **Step 3: Add comparison and summary functions**

In `src/scrap_variance_query.js`, insert this block immediately before `function setupQueryPanel()`:

```js
  function round2(value) {
    return Math.round((normalizeNumber(value) + Number.EPSILON) * 100) / 100;
  }

  function unionKeys(left, right) {
    const result = {};
    for (const key of Object.keys(left || {})) {
      result[key] = true;
    }
    for (const key of Object.keys(right || {})) {
      result[key] = true;
    }
    return Object.keys(result);
  }

  function buildFormNumberSet(groupedRows) {
    const result = {};
    for (const key of Object.keys(groupedRows || {})) {
      const row = groupedRows[key];
      if (row && row.formNumber) {
        result[row.formNumber] = true;
      }
    }
    return result;
  }

  function buildDifference(differenceType, oa, erp) {
    const formNumber = oa ? oa.formNumber : erp.formNumber;
    const itemCode = oa ? oa.itemCode : erp.itemCode;
    const itemName = oa ? oa.itemName : erp.itemName;
    const company = oa ? oa.company : erp.company;
    const dept1 = oa ? oa.dept1 : erp.dept1;
    const dept2 = oa ? oa.dept2 : erp.dept2;
    const oaQuantity = oa ? round2(oa.quantity) : 0;
    const erpQuantity = erp ? round2(erp.quantity) : 0;
    const oaAmount = oa ? round2(oa.amount) : 0;
    const erpCost = erp ? round2(erp.cost) : 0;

    return {
      differenceType,
      formNumber,
      erpDocNumbers: erp ? erp.erpDocNumbers.join(",") : "",
      itemCode,
      itemName,
      company,
      dept1,
      dept2,
      oaQuantity,
      erpQuantity,
      quantityDiff: round2(oaQuantity - erpQuantity),
      oaAmount,
      erpCost,
      amountDiff: round2(oaAmount - erpCost),
      remark: differenceType === "ERP出库对应OA未在当前OA数据中找到"
        ? "请用 ERP 源单单号回 OA 系统补查。"
        : "",
    };
  }

  function compareRows(oaRows, erpRowsForOa, erpOnlyRows) {
    const result = [];
    const allMatchedKeys = unionKeys(oaRows, erpRowsForOa);
    const erpFormNumbers = buildFormNumberSet(erpRowsForOa);

    for (const key of allMatchedKeys) {
      const oa = oaRows[key];
      const erp = erpRowsForOa[key];

      if (oa && !erp && !erpFormNumbers[oa.formNumber]) {
        result.push(buildDifference("OA有申请，ERP无出库", oa, null));
        continue;
      }

      if (!oa || !erp) {
        result.push(buildDifference("OA和ERP都有，但物料明细不一致", oa, erp));
        continue;
      }

      if (round2(oa.quantity) !== round2(erp.quantity)) {
        result.push(buildDifference("OA和ERP都有，但数量不同", oa, erp));
        continue;
      }

      result.push(buildDifference("OA和ERP都有，数量一致", oa, erp));
    }

    for (const erpKey of Object.keys(erpOnlyRows || {})) {
      result.push(buildDifference("ERP出库对应OA未在当前OA数据中找到", null, erpOnlyRows[erpKey]));
    }

    return result;
  }

  function addSummaryType(summary, differenceType) {
    if (summary.typeSet[differenceType]) {
      return;
    }
    summary.typeSet[differenceType] = true;
    summary.types.push(differenceType);
  }

  function buildSummaryRows(detailRows) {
    const grouped = {};

    for (const row of detailRows) {
      const key = `${row.company}||${row.dept1}||${row.dept2}`;
      if (!grouped[key]) {
        grouped[key] = {
          company: row.company,
          dept1: row.dept1,
          dept2: row.dept2,
          oaQuantity: 0,
          erpQuantity: 0,
          quantityDiff: 0,
          oaAmount: 0,
          erpCost: 0,
          amountDiff: 0,
          types: [],
          typeSet: {},
        };
      }

      grouped[key].oaQuantity += normalizeNumber(row.oaQuantity);
      grouped[key].erpQuantity += normalizeNumber(row.erpQuantity);
      grouped[key].oaAmount += normalizeNumber(row.oaAmount);
      grouped[key].erpCost += normalizeNumber(row.erpCost);
      addSummaryType(grouped[key], row.differenceType);
    }

    return Object.keys(grouped).map((key) => {
      const row = grouped[key];
      return {
        company: row.company,
        dept1: row.dept1,
        dept2: row.dept2,
        oaQuantity: round2(row.oaQuantity),
        erpQuantity: round2(row.erpQuantity),
        quantityDiff: round2(row.oaQuantity - row.erpQuantity),
        oaAmount: round2(row.oaAmount),
        erpCost: round2(row.erpCost),
        amountDiff: round2(row.oaAmount - row.erpCost),
        differenceSummary: row.types.join("、"),
      };
    });
  }
```

Then replace the existing `const ScrapVarianceCore = { ... }` block with:

```js
  const ScrapVarianceCore = {
    CONFIG,
    normalizeText,
    normalizeNumber,
    normalizeDateKey,
    parseFilters,
    makeDetailKey,
    buildAllOaFormNumberSet,
    buildOaRows,
    buildErpRowsForOa,
    buildErpOnlyRows,
    unionKeys,
    buildFormNumberSet,
    buildDifference,
    compareRows,
    buildSummaryRows,
  };
```

- [ ] **Step 4: Run the tests to verify Task 2 passes**

Run:

```bash
node --test tests/scrap_variance_query.test.js
```

Expected: PASS for all tests.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add src/scrap_variance_query.js tests/scrap_variance_query.test.js
git commit -m "feat: compare scrap variance rows"
```

Expected: commit succeeds.

## Task 3: Output Tables and WPS Worksheet Adapter

**Files:**
- Modify: `src/scrap_variance_query.js`
- Modify: `tests/scrap_variance_query.test.js`

- [ ] **Step 1: Add failing tests for output table rendering**

Append this content to `tests/scrap_variance_query.test.js`:

```js
test("summaryRowsToValues and detailRowsToValues render stable worksheet tables", () => {
  const summaryRows = [
    {
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      oaQuantity: 8,
      erpQuantity: 4,
      quantityDiff: 4,
      oaAmount: 80,
      erpCost: 44,
      amountDiff: 36,
      differenceSummary: "OA和ERP都有，但数量不同",
    },
  ];

  const detailRows = [
    {
      differenceType: "OA和ERP都有，但数量不同",
      formNumber: "CHBF1",
      erpDocNumbers: "QOUT1",
      itemCode: "MAT-A",
      itemName: "物料A",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      oaQuantity: 5,
      erpQuantity: 4,
      quantityDiff: 1,
      oaAmount: 50,
      erpCost: 44,
      amountDiff: 6,
      remark: "",
    },
  ];

  const summaryValues = core.summaryRowsToValues(summaryRows);
  const detailValues = core.detailRowsToValues(detailRows);

  assert.equal(summaryValues[0][0], "公司简称");
  assert.equal(summaryValues[1][0], "数控");
  assert.equal(summaryValues[1][5], 4);
  assert.equal(detailValues[0][0], "差异类型");
  assert.equal(detailValues[1][1], "CHBF1");
  assert.equal(detailValues[1][2], "QOUT1");
});
```

- [ ] **Step 2: Run the tests to verify rendering tests fail**

Run:

```bash
node --test tests/scrap_variance_query.test.js
```

Expected: FAIL with an error like `core.summaryRowsToValues is not a function`.

- [ ] **Step 3: Add table rendering and WPS adapter functions**

In `src/scrap_variance_query.js`, insert this block immediately before `function setupQueryPanel()`:

```js
  const SUMMARY_HEADERS = [
    "公司简称",
    "一级部门",
    "二级部门",
    "OA数量合计",
    "ERP实发数量合计",
    "数量差额",
    "OA实际预算金额mx合计",
    "ERP总成本合计",
    "金额差额",
    "差异类型摘要",
  ];

  const DETAIL_HEADERS = [
    "差异类型",
    "OA表单编号",
    "ERP出库单号",
    "物料编码",
    "物料名称",
    "公司简称",
    "一级部门",
    "二级部门",
    "OA数量合计",
    "ERP实发数量合计",
    "数量差额",
    "OA实际预算金额mx合计",
    "ERP总成本合计",
    "金额差额",
    "备注",
  ];

  function summaryRowsToValues(summaryRows) {
    const values = [SUMMARY_HEADERS];
    for (const row of summaryRows) {
      values.push([
        row.company,
        row.dept1,
        row.dept2,
        row.oaQuantity,
        row.erpQuantity,
        row.quantityDiff,
        row.oaAmount,
        row.erpCost,
        row.amountDiff,
        row.differenceSummary,
      ]);
    }
    return values;
  }

  function detailRowsToValues(detailRows) {
    const values = [DETAIL_HEADERS];
    for (const row of detailRows) {
      values.push([
        row.differenceType,
        row.formNumber,
        row.erpDocNumbers,
        row.itemCode,
        row.itemName,
        row.company,
        row.dept1,
        row.dept2,
        row.oaQuantity,
        row.erpQuantity,
        row.quantityDiff,
        row.oaAmount,
        row.erpCost,
        row.amountDiff,
        row.remark,
      ]);
    }
    return values;
  }

  function getApplication() {
    if (typeof Application === "undefined") {
      throw new Error("当前环境没有 WPS Application 对象，请在 WPS JS 宏环境中运行。");
    }
    return Application;
  }

  function getSheets(app) {
    const workbook = app.ActiveWorkbook;
    return workbook.Worksheets || workbook.Sheets || app.Worksheets || app.Sheets;
  }

  function getSheetByName(sheetName) {
    const app = getApplication();
    const sheets = getSheets(app);
    const count = sheets.Count;

    for (let index = 1; index <= count; index += 1) {
      const sheet = sheets.Item(index);
      if (sheet.Name === sheetName) {
        return sheet;
      }
    }

    throw new Error(`找不到工作表：${sheetName}`);
  }

  function ensureSheet(sheetName) {
    try {
      return getSheetByName(sheetName);
    } catch (error) {
      const app = getApplication();
      const sheets = getSheets(app);
      const sheet = sheets.Add();
      sheet.Name = sheetName;
      return sheet;
    }
  }

  function normalizeMatrix(values) {
    if (!Array.isArray(values)) {
      return [[values]];
    }
    if (values.length === 0) {
      return [];
    }
    if (!Array.isArray(values[0])) {
      return [values];
    }
    return values;
  }

  function readUsedRangeValues(sheet) {
    const usedRange = sheet.UsedRange;
    return normalizeMatrix(usedRange.Value2 || usedRange.Value || []);
  }

  function rowsFromValues(values, headerRowIndex) {
    const headerRow = values[headerRowIndex - 1] || [];
    const rows = [];

    for (let rowIndex = headerRowIndex; rowIndex < values.length; rowIndex += 1) {
      const rowValues = values[rowIndex];
      const row = {};
      let hasValue = false;

      for (let colIndex = 0; colIndex < headerRow.length; colIndex += 1) {
        const header = normalizeText(headerRow[colIndex]);
        if (!header) {
          continue;
        }
        const value = rowValues[colIndex];
        row[header] = value;
        if (value !== null && value !== undefined && value !== "") {
          hasValue = true;
        }
      }

      if (hasValue) {
        rows.push(row);
      }
    }

    return rows;
  }

  function readSheetData(sheetName, headerRowIndex) {
    const sheet = getSheetByName(sheetName);
    return rowsFromValues(readUsedRangeValues(sheet), headerRowIndex);
  }

  function requireColumns(rows, requiredColumns, sheetName) {
    if (!rows.length) {
      throw new Error(`工作表没有数据：${sheetName}`);
    }

    const firstRow = rows[0];
    const missing = requiredColumns.filter((column) => !(column in firstRow));
    if (missing.length) {
      throw new Error(`${sheetName} 缺少关键列：${missing.join("、")}`);
    }
  }

  function validateRequiredColumns(oaRows, erpRows) {
    requireColumns(oaRows, Object.values(CONFIG.oaHeaders), CONFIG.sheets.oa);
    requireColumns(erpRows, Object.values(CONFIG.erpHeaders), CONFIG.sheets.erp);
  }

  function setCell(sheet, address, value) {
    sheet.Range(address).Value = value;
  }

  function writeMatrix(sheet, startRow, startCol, values) {
    for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
      for (let colIndex = 0; colIndex < values[rowIndex].length; colIndex += 1) {
        sheet.Cells.Item(startRow + rowIndex, startCol + colIndex).Value = values[rowIndex][colIndex];
      }
    }
  }

  function clearPanelOutput(sheet) {
    sheet.Range("A8:O20000").Clear();
  }

  function setupQueryPanel() {
    const sheet = ensureSheet(CONFIG.sheets.panel);
    setCell(sheet, "A1", "报废申请与出库差异查询");
    setCell(sheet, "A2", "公司简称");
    setCell(sheet, "A3", "一级部门");
    setCell(sheet, "A4", "二级部门");
    setCell(sheet, "A5", "开始日期");
    setCell(sheet, "A6", "结束日期");
    setCell(sheet, "D2", "运行函数");
    setCell(sheet, "E2", "runScrapVarianceQuery()");
    return sheet;
  }

  function readFiltersFromPanel(sheet) {
    return parseFilters({
      company: sheet.Range("B2").Value2 || sheet.Range("B2").Value,
      dept1: sheet.Range("B3").Value2 || sheet.Range("B3").Value,
      dept2: sheet.Range("B4").Value2 || sheet.Range("B4").Value,
      startDate: sheet.Range("B5").Value2 || sheet.Range("B5").Value,
      endDate: sheet.Range("B6").Value2 || sheet.Range("B6").Value,
    });
  }

  function writeErrorToPanel(message) {
    const sheet = ensureSheet(CONFIG.sheets.panel);
    clearPanelOutput(sheet);
    setCell(sheet, "A8", "错误");
    setCell(sheet, "B8", message);
  }

  function writeResults(summaryRows, detailRows) {
    const sheet = ensureSheet(CONFIG.sheets.panel);
    clearPanelOutput(sheet);

    setCell(sheet, "A8", "汇总差异");
    const summaryValues = summaryRowsToValues(summaryRows);
    writeMatrix(sheet, 9, 1, summaryValues);

    const detailStartRow = 11 + summaryValues.length;
    setCell(sheet, `A${detailStartRow}`, "明细差异");
    writeMatrix(sheet, detailStartRow + 1, 1, detailRowsToValues(detailRows));
  }

  function runScrapVarianceQuery() {
    try {
      const panelSheet = setupQueryPanel();
      const filters = readFiltersFromPanel(panelSheet);
      const oaRowsRaw = readSheetData(CONFIG.sheets.oa, 3);
      const erpRowsRaw = readSheetData(CONFIG.sheets.erp, 1);

      validateRequiredColumns(oaRowsRaw, erpRowsRaw);

      const allOaFormNumbers = buildAllOaFormNumberSet(oaRowsRaw);
      const oaRows = buildOaRows(oaRowsRaw, filters);
      const erpRowsForOa = buildErpRowsForOa(erpRowsRaw, oaRows);
      const erpOnlyRows = buildErpOnlyRows(erpRowsRaw, allOaFormNumbers, filters);
      const detailRows = compareRows(oaRows, erpRowsForOa, erpOnlyRows);
      const summaryRows = buildSummaryRows(detailRows);

      if (!Object.keys(oaRows).length) {
        writeErrorToPanel("查询条件没有匹配到 OA 数据。");
        return;
      }

      writeResults(summaryRows, detailRows);
    } catch (error) {
      writeErrorToPanel(error.message || String(error));
    }
  }
```

Then remove the earlier temporary throwing implementations of `setupQueryPanel()` and `runScrapVarianceQuery()`.

Then replace the existing `const ScrapVarianceCore = { ... }` block with:

```js
  const ScrapVarianceCore = {
    CONFIG,
    SUMMARY_HEADERS,
    DETAIL_HEADERS,
    normalizeText,
    normalizeNumber,
    normalizeDateKey,
    parseFilters,
    makeDetailKey,
    buildAllOaFormNumberSet,
    buildOaRows,
    buildErpRowsForOa,
    buildErpOnlyRows,
    unionKeys,
    buildFormNumberSet,
    buildDifference,
    compareRows,
    buildSummaryRows,
    summaryRowsToValues,
    detailRowsToValues,
    rowsFromValues,
  };
```

- [ ] **Step 4: Run the tests to verify rendering and core behavior pass**

Run:

```bash
node --test tests/scrap_variance_query.test.js
```

Expected: PASS for all tests.

- [ ] **Step 5: Run a WPS adapter smoke check in WPS**

In WPS:

1. Open `存货报废流程-erp&oa对比表.xlsx`.
2. Open the JS macro editor.
3. Paste the full content of `src/scrap_variance_query.js`.
4. Run `setupQueryPanel()`.
5. Confirm a `查询面板` sheet exists and `A1` shows `报废申请与出库差异查询`.
6. Fill `B5` with `2026-05-01` and `B6` with `2026-05-31`.
7. Run `runScrapVarianceQuery()`.
8. Confirm `A8` shows `汇总差异` and a `明细差异` section appears below the summary.

Expected: WPS shows query results or a readable error message in `查询面板!A8:B8`.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add src/scrap_variance_query.js tests/scrap_variance_query.test.js
git commit -m "feat: add wps query panel output"
```

Expected: commit succeeds.

## Task 4: Usage Guide and Final Verification

**Files:**
- Create: `docs/wps-js-usage.md`
- Modify: `src/scrap_variance_query.js`

- [ ] **Step 1: Add a short WPS usage guide**

Create `docs/wps-js-usage.md` with this content:

```markdown
# WPS JS 报废差异查询使用说明

## 使用前准备

工作簿中需要保留两张原始数据表：

- `查询OA-存货报废申请单`
- `查询ERP-报废明细表`

字段名需要和设计文档一致。OA 表头在第 3 行，ERP 表头在第 1 行。

## 安装宏

1. 打开 `存货报废流程-erp&oa对比表.xlsx`。
2. 打开 WPS 的 JS 宏编辑器。
3. 将 `src/scrap_variance_query.js` 的完整内容粘贴进去。
4. 运行 `setupQueryPanel()`，创建 `查询面板`。

## 查询

在 `查询面板` 填写：

- `B2`: 公司简称，可以为空。
- `B3`: 一级部门，可以为空。
- `B4`: 二级部门，可以为空。
- `B5`: 开始日期，可以为空。
- `B6`: 结束日期，可以为空。

运行：

```js
runScrapVarianceQuery()
```

结果会写入 `查询面板`：

- `汇总差异`: 按公司和部门汇总。
- `明细差异`: 按 OA 表单编号和物料编码追到明细。

## 按钮绑定

可以在 `查询面板` 插入一个按钮或形状，并把宏绑定到：

```js
runScrapVarianceQuery
```

如果 WPS 版本不支持直接绑定 JS 函数，就在 JS 宏编辑器中手动运行 `runScrapVarianceQuery()`。

## 常见错误

- `找不到工作表`: 检查原始表名是否被改动。
- `缺少关键列`: 检查表头文字是否和设计文档一致。
- `日期格式不正确`: 使用 `2026-05-01` 或 `2026/5/1` 格式。
- `查询条件没有匹配到 OA 数据`: 放宽公司、部门或日期条件后再查。
```

- [ ] **Step 2: Add the official WPS API references as code comments near the worksheet adapter**

In `src/scrap_variance_query.js`, insert these comments immediately before `function getApplication()`:

```js
  // WPS JS 宏工作表读写集中放在这一段，便于按 WPS 版本调整。
  // 参考：Application、Sheet.UsedRange、Range.Value / Range.Value2。
```

- [ ] **Step 3: Run the full local test suite**

Run:

```bash
node --test tests/scrap_variance_query.test.js
```

Expected: PASS for all tests.

- [ ] **Step 4: Check repository status**

Run:

```bash
git status --short
```

Expected: only `src/scrap_variance_query.js`, `tests/scrap_variance_query.test.js`, and `docs/wps-js-usage.md` are modified or untracked for this task. The Excel workbook can remain untracked.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add src/scrap_variance_query.js tests/scrap_variance_query.test.js docs/wps-js-usage.md
git commit -m "docs: add wps scrap variance usage"
```

Expected: commit succeeds.

- [ ] **Step 6: Final verification before handoff**

Run:

```bash
node --test tests/scrap_variance_query.test.js
git log --oneline -5
git status --short
```

Expected:

- Tests pass.
- Recent commits include the three implementation commits.
- Git status is clean except for the untracked Excel workbook, unless the user asks to track the workbook.

## Plan Self-Review

- Spec coverage: Task 1 covers fixed OA/ERP inputs, date filters, org filters, and grouping. Task 2 covers all difference types and summary aggregation. Task 3 covers `查询面板`, `runScrapVarianceQuery()`, result output, and readable errors. Task 4 covers usage notes and final verification.
- Red flag scan: the plan contains no unresolved implementation markers.
- Type consistency: the plan consistently uses `formNumber`, `sourceFormNumber`, `itemCode`, `quantity`, `amount`, `cost`, `erpDocNumbers`, `differenceType`, and table rendering function names.
