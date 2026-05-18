# Bidirectional Query Directions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a query direction option so each run can compare OA to ERP by `OA.金蝶云单据编号 = ERP.单据编号` or ERP to OA by `ERP.源单单号 = OA.表单编号`.

**Architecture:** Keep one query pipeline entrypoint and branch internally by a typed `QueryDirection`. Shared comparison and summary output remain centralized in `compareRows()` and `buildSummaryRows()`, while direction-specific row building lives in the existing OA/ERP row builder modules.

**Tech Stack:** TypeScript, WPS JS API wrapper fakes, Decimal arithmetic via `decimal.js-light`, Vitest, esbuild.

---

## File Structure

- Create `src/core/query-direction.ts`: owns `QueryDirection`, supported display labels, default direction, and parser.
- Create `tests/core/query-direction.test.ts`: focused parser tests.
- Modify `src/types/scrap.ts`: add direction type usage, `kingdeeDocNumber`, ERP source display fields, and result metadata.
- Modify `src/constants.ts`: add OA required header `金蝶云单据编号`, detail output columns, and expanded output width assumptions.
- Modify `src/core/build-oa-rows.ts`: preserve `金蝶云单据编号` and add form-number scoped OA grouping for ERP-origin queries.
- Modify `src/core/build-erp-rows.ts`: add OA-Kingdee-to-ERP matching by `ERP.单据编号`, ERP-origin filtering, source-form collection, and ERP missing-OA split.
- Modify `src/core/compare-rows.ts`: populate new detail columns and update ERP-only remark.
- Modify `src/core/build-summary-rows.ts`: write the new detail columns.
- Modify `src/core/query-pipeline.ts`: branch by `QueryDirection`, keep existing metrics, and return direction metadata.
- Modify `src/core/precheck.ts`: require `金蝶云单据编号` and warn on blank values.
- Modify `src/macros/setup-query-panel.ts`: add query direction row and move run function to row 8.
- Modify `src/macros/scrap-variance-query.ts`: read `B2:B7`, pass direction, output from row 9, and use direction-specific no-match messages.
- Modify `src/wps-api/write-results.ts`: clear `A9:S200000` for query output.
- Modify `src/perf/benchmark-data.ts`: generate `金蝶云单据编号` values that match ERP `单据编号`.
- Modify tests under `tests/core`, `tests/macros`, `tests/perf`, and `tests/wps-api` as described below.
- Modify `docs/wps-js-usage.md`: document query direction and direction-specific filter meaning.
- Modify generated `main.js`: run `npm run build` after source changes.

---

### Task 1: Query Direction Parser

**Files:**
- Create: `src/core/query-direction.ts`
- Create: `tests/core/query-direction.test.ts`

- [ ] **Step 1: Write the failing parser tests**

Create `tests/core/query-direction.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUERY_DIRECTION,
  QUERY_DIRECTIONS,
  parseQueryDirection
} from "../../src/core/query-direction";

describe("query direction parser", () => {
  it("defaults blank values to OA Kingdee lookup", () => {
    expect(parseQueryDirection("")).toBe(DEFAULT_QUERY_DIRECTION);
    expect(parseQueryDirection(null)).toBe(DEFAULT_QUERY_DIRECTION);
    expect(parseQueryDirection(undefined)).toBe(DEFAULT_QUERY_DIRECTION);
    expect(parseQueryDirection("   ")).toBe(DEFAULT_QUERY_DIRECTION);
  });

  it("accepts the two supported panel labels", () => {
    expect(parseQueryDirection("OA金蝶单号查ERP")).toBe(QUERY_DIRECTIONS.oaKingdeeToErp);
    expect(parseQueryDirection("ERP源单查OA")).toBe(QUERY_DIRECTIONS.erpSourceToOa);
  });

  it("rejects unsupported labels with the user-facing guidance", () => {
    expect(() => parseQueryDirection("OA查ERP")).toThrow(
      "查询方向不正确：请填写 OA金蝶单号查ERP 或 ERP源单查OA"
    );
  });
});
```

- [ ] **Step 2: Run the focused parser test and verify it fails**

Run:

```bash
npm test -- tests/core/query-direction.test.ts
```

Expected: FAIL because `src/core/query-direction.ts` does not exist.

- [ ] **Step 3: Implement the parser**

Create `src/core/query-direction.ts`:

```ts
import { normalizeText } from "../utils/text";

export const QUERY_DIRECTIONS = {
  oaKingdeeToErp: "OA金蝶单号查ERP",
  erpSourceToOa: "ERP源单查OA"
} as const;

export type QueryDirection = (typeof QUERY_DIRECTIONS)[keyof typeof QUERY_DIRECTIONS];

export const DEFAULT_QUERY_DIRECTION: QueryDirection = QUERY_DIRECTIONS.oaKingdeeToErp;

export function parseQueryDirection(value: unknown): QueryDirection {
  const text = normalizeText(value);

  if (!text) {
    return DEFAULT_QUERY_DIRECTION;
  }

  if (text === QUERY_DIRECTIONS.oaKingdeeToErp || text === QUERY_DIRECTIONS.erpSourceToOa) {
    return text;
  }

  throw new Error("查询方向不正确：请填写 OA金蝶单号查ERP 或 ERP源单查OA");
}
```

- [ ] **Step 4: Run the parser test and verify it passes**

Run:

```bash
npm test -- tests/core/query-direction.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/query-direction.ts tests/core/query-direction.test.ts
git commit -m "feat: add query direction parser"
```

---

### Task 2: Types, Headers, and Detail Output Columns

**Files:**
- Modify: `src/types/scrap.ts`
- Modify: `src/constants.ts`
- Modify: `src/core/build-oa-rows.ts`
- Modify: `src/core/compare-rows.ts`
- Modify: `src/core/build-summary-rows.ts`
- Modify: `tests/core/query-core.test.ts`
- Modify: `tests/macros/macro-flow.test.ts`

- [ ] **Step 1: Write failing tests for the new OA field and detail columns**

In `tests/core/query-core.test.ts`, update the test helper rows used in new assertions to include `金蝶云单据编号`. Add this test near the existing `buildOaRows` tests:

```ts
it("keeps OA Kingdee document number and writes the new detail columns", () => {
  const filters = parseFilters({});
  const oaGrouped = buildOaRows(
    [
      {
        表单编号: "F-KD",
        金蝶云单据编号: "OUT-KD",
        申请日期: "2026/5/1",
        公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料代码: "MAT-A",
        物料名称: "物料A",
        数量: 2,
        实际预算金额mx: 20
      }
    ],
    filters
  );
  const details = compareRows(oaGrouped, new Map(), new Map());
  const values = detailRowsToValues(details);

  expect(oaGrouped.get("F-KD||MAT-A")?.kingdeeDocNumber).toBe("OUT-KD");
  expect(values[0]).toEqual([
    "差异类型",
    "OA表单编号",
    "OA金蝶云单据编号",
    "OA申请日期",
    "ERP出库单号",
    "ERP源单单号",
    "ERP日期",
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
    "备注"
  ]);
  expect(values[1]).toEqual([
    "OA有申请，ERP无出库",
    "F-KD",
    "OUT-KD",
    "2026-05-01",
    "",
    "",
    "",
    "MAT-A",
    "物料A",
    "数控",
    "生产",
    "仓储",
    2,
    0,
    2,
    20,
    0,
    20,
    ""
  ]);
});
```

In `tests/macros/macro-flow.test.ts`, update `validOaRow()`:

```ts
function validOaRow(): Array<string | number> {
  return ["F1", "OUT1", "2026/5/1", "数控", "生产", "仓储", "MAT-A", "物料A", 1, 10];
}
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
npm test -- tests/core/query-core.test.ts tests/macros/macro-flow.test.ts
```

Expected: FAIL because the new header, type fields, and output columns are not implemented.

- [ ] **Step 3: Extend constants and types**

In `src/constants.ts`, add `金蝶云单据编号` immediately after `表单编号`:

```ts
export const OA_REQUIRED_HEADERS = [
  "表单编号",
  "金蝶云单据编号",
  "申请日期",
  "公司简称",
  "一级部门",
  "二级部门",
  "物料代码",
  "物料名称",
  "数量",
  "实际预算金额mx"
] as const;
```

Replace `DETAIL_HEADERS` with:

```ts
export const DETAIL_HEADERS = [
  "差异类型",
  "OA表单编号",
  "OA金蝶云单据编号",
  "OA申请日期",
  "ERP出库单号",
  "ERP源单单号",
  "ERP日期",
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
  "备注"
] as const;
```

In `src/types/scrap.ts`, import the query direction type and extend interfaces:

```ts
import type { QueryDirection } from "../core/query-direction";
```

Update `OaAggRow`:

```ts
export interface OaAggRow {
  formNumber: string;
  kingdeeDocNumber: string;
  itemCode: string;
  itemName: string;
  company: string;
  dept1: string;
  dept2: string;
  oaDate: string;
  quantity: Decimal;
  amount: Decimal;
}
```

Update `DetailRow`:

```ts
export interface DetailRow {
  differenceType: string;
  formNumber: string;
  oaKingdeeDocNumber: string;
  oaDate: string;
  erpDocNumbers: string;
  erpSourceFormNumber: string;
  erpDate: string;
  itemCode: string;
  itemName: string;
  company: string;
  dept1: string;
  dept2: string;
  oaQuantity: number;
  erpQuantity: number;
  quantityDiff: number;
  oaAmount: number;
  erpCost: number;
  amountDiff: number;
  remark: string;
}
```

Add panel input type:

```ts
export interface PanelQueryInput {
  filters: QueryFilters;
  queryDirection: QueryDirection;
}
```

- [ ] **Step 4: Preserve OA Kingdee document number**

In `src/core/build-oa-rows.ts`, inside `buildOaRows()`, normalize the field before creating the target:

```ts
const kingdeeDocNumber = normalizeText(row["金蝶云单据编号"]);
```

When creating `target`, include:

```ts
kingdeeDocNumber,
```

After `result.set(key, target);`, keep the first nonblank value if the aggregate was created from a blank row:

```ts
if (!target.kingdeeDocNumber && kingdeeDocNumber) {
  target.kingdeeDocNumber = kingdeeDocNumber;
}
```

- [ ] **Step 5: Populate new detail fields**

In `src/core/compare-rows.ts`, update `buildDifference()` to normalize the new values:

```ts
const oaKingdeeDocNumber = normalizeText(oa?.kingdeeDocNumber);
const erpSourceFormNumber = normalizeText(erp?.sourceFormNumber);
```

Add these properties in the returned object:

```ts
oaKingdeeDocNumber,
erpSourceFormNumber,
```

Update the ERP-only remark to:

```ts
remark:
  differenceType === "ERP出库对应OA未在当前OA数据中找到"
    ? "请用 ERP 源单单号回 OA 系统补查，或确认 OA 导出表是否包含该流程。"
    : ""
```

In `src/core/build-summary-rows.ts`, update `detailRowsToValues()` row mapping:

```ts
row.differenceType,
row.formNumber,
row.oaKingdeeDocNumber,
row.oaDate,
row.erpDocNumbers,
row.erpSourceFormNumber,
row.erpDate,
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
row.remark
```

- [ ] **Step 6: Update existing test fixtures that construct OA raw rows**

Find OA row object literals:

```bash
rg -n "表单编号:" tests/core/query-core.test.ts
```

For each object literal in that output, insert `金蝶云单据编号` immediately after `表单编号`. Use stable string literals so expected output remains readable. Examples of the exact pattern:

```ts
{ 表单编号: "CHBF2026050001", 金蝶云单据编号: "KD-CHBF2026050001", 申请日期: "2026/5/1", 公司简称: "数控", 一级部门: "生产运营中心", 二级部门: "仓储部", 物料代码: "MAT-A", 物料名称: "物料A", 数量: "0.1", 实际预算金额mx: "10.10" }
{ 表单编号: "F1", 金蝶云单据编号: "KD-F1", 申请日期: "2026/5/1", 公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料代码: "A", 物料名称: "A物料", 数量: 2, 实际预算金额mx: 20 }
```

Update matrix rows in `tests/macros/macro-flow.test.ts` that use `OA_REQUIRED_HEADERS` so the data row has the same column count and places the Kingdee number immediately after `表单编号`:

```ts
["F2", "OUT2", "2026/5/1", "装备", "生产", "仓储", "MAT-B", "物料B", 1, 10]
```

For `validOaRow()` in `tests/macros/macro-flow.test.ts`, use the exact helper from Step 1.

- [ ] **Step 7: Run focused tests and verify they pass**

Run:

```bash
npm test -- tests/core/query-core.test.ts tests/macros/macro-flow.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/types/scrap.ts src/constants.ts src/core/build-oa-rows.ts src/core/compare-rows.ts src/core/build-summary-rows.ts tests/core/query-core.test.ts tests/macros/macro-flow.test.ts
git commit -m "feat: add Kingdee and source columns"
```

---

### Task 3: OA Kingdee Number to ERP Document Query

**Files:**
- Modify: `src/core/build-erp-rows.ts`
- Modify: `src/core/query-pipeline.ts`
- Modify: `tests/core/query-core.test.ts`
- Modify: `tests/core/query-pipeline.test.ts`
- Modify: `src/perf/benchmark-data.ts`
- Modify: `tests/perf/benchmark-data.test.ts`

- [ ] **Step 1: Write failing OA-to-ERP direction tests**

In `tests/core/query-core.test.ts`, add:

```ts
it("matches ERP rows by OA Kingdee document number in OA direction", () => {
  const filters = parseFilters({
    company: "数控",
    dept1: "生产",
    dept2: "仓储",
    startDate: "2026-05-01",
    endDate: "2026-05-31"
  });
  const oaGrouped = buildOaRows(
    [
      {
        表单编号: "OA-001",
        金蝶云单据编号: "ERP-001",
        申请日期: "2026/5/1",
        公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料代码: "MAT-A",
        物料名称: "物料A",
        数量: 2,
        实际预算金额mx: 20
      }
    ],
    filters
  );
  const erpForOa = buildErpRowsForOaKingdee(
    [
      {
        单据编号: "ERP-001",
        日期: "2026/6/1",
        源单单号: "SOURCE-001",
        区分公司简称: "其他公司",
        一级部门: "其他部门",
        二级部门: "其他二级",
        物料编码: "MAT-A",
        物料名称: "物料A",
        实发数量: 2,
        总成本: 21
      }
    ],
    oaGrouped
  );

  const details = compareRows(oaGrouped, erpForOa, new Map());

  expect(erpForOa.get("OA-001||MAT-A")?.sourceFormNumber).toBe("SOURCE-001");
  expect(details[0]).toMatchObject({
    differenceType: "OA和ERP都有，数量一致",
    formNumber: "OA-001",
    oaKingdeeDocNumber: "ERP-001",
    erpDocNumbers: "ERP-001",
    erpSourceFormNumber: "SOURCE-001",
    amountDiff: -1
  });
});

it("treats blank OA Kingdee number as OA without ERP shipment", () => {
  const oaGrouped = buildOaRows(
    [
      {
        表单编号: "OA-BLANK",
        金蝶云单据编号: "",
        申请日期: "2026/5/1",
        公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料代码: "MAT-A",
        物料名称: "物料A",
        数量: 1,
        实际预算金额mx: 10
      }
    ],
    parseFilters({})
  );

  const erpForOa = buildErpRowsForOaKingdee(
    [
      {
        单据编号: "ERP-IGNORED",
        日期: "2026/5/2",
        源单单号: "OA-BLANK",
        区分公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料编码: "MAT-A",
        物料名称: "物料A",
        实发数量: 1,
        总成本: 10
      }
    ],
    oaGrouped
  );

  expect(compareRows(oaGrouped, erpForOa, new Map())[0]?.differenceType).toBe("OA有申请，ERP无出库");
});
```

Update imports:

```ts
import { buildErpOnlyRows, buildErpRowsForOa, buildErpRowsForOaKingdee } from "../../src/core/build-erp-rows";
```

In `tests/core/query-pipeline.test.ts`, update the existing pipeline test to assert the default direction:

```ts
expect(result.queryDirection).toBe("OA金蝶单号查ERP");
expect(result.erpRowsForOa.size).toBeGreaterThan(0);
expect(result.erpOnlyRows.size).toBe(0);
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
npm test -- tests/core/query-core.test.ts tests/core/query-pipeline.test.ts
```

Expected: FAIL because `buildErpRowsForOaKingdee` and `queryDirection` result metadata do not exist.

- [ ] **Step 3: Implement Kingdee-to-ERP grouping**

In `src/core/build-erp-rows.ts`, change `addErpRowToGroup()` signature:

```ts
function addErpRowToGroup(
  result: Map<string, ErpAggRow>,
  row: RawRow,
  groupingFormNumber: string,
  itemCode: string,
  dateKey: string,
  sourceFormNumber = normalizeText(row["源单单号"])
): void {
  const key = makeDetailKey(groupingFormNumber, itemCode);
  const docNumber = normalizeText(row["单据编号"]);
  let target = result.get(key);

  if (!target) {
    target = {
      sourceFormNumber,
      formNumber: groupingFormNumber,
      itemCode,
      itemName: normalizeText(row["物料名称"]),
      company: normalizeText(row["区分公司简称"]),
      dept1: normalizeText(row["一级部门"]),
      dept2: normalizeText(row["二级部门"]),
      erpDate: "",
      quantity: zeroDecimal(),
      cost: zeroDecimal(),
      erpDocNumbers: ""
    };
    result.set(key, target);
  }

  if (!target.sourceFormNumber && sourceFormNumber) {
    target.sourceFormNumber = sourceFormNumber;
  }

  target.erpDate = appendUniqueJoinedText(target.erpDate, dateKey);
  target.erpDocNumbers = appendUniqueJoinedText(target.erpDocNumbers, docNumber, ",");
  target.quantity = addDecimal(target.quantity, parseDecimal(row["实发数量"], "实发数量"));
  target.cost = addDecimal(target.cost, parseDecimal(row["总成本"], "总成本"));
}
```

Add helper and export:

```ts
function indexErpRowsByDocNumber(erpRows: RawRow[] | null | undefined): Map<string, RawRow[]> {
  const result = new Map<string, RawRow[]>();

  for (const row of erpRows ?? []) {
    const docNumber = normalizeText(row["单据编号"]);
    if (!docNumber) {
      continue;
    }
    const rows = result.get(docNumber) ?? [];
    rows.push(row);
    result.set(docNumber, rows);
  }

  return result;
}

export function buildErpRowsForOaKingdee(
  erpRows?: RawRow[] | null,
  oaGroupedRows?: Map<string, OaAggRow> | null
): Map<string, ErpAggRow> {
  const result = new Map<string, ErpAggRow>();
  const erpByDocNumber = indexErpRowsByDocNumber(erpRows);

  for (const oa of (oaGroupedRows ?? new Map<string, OaAggRow>()).values()) {
    if (!oa.kingdeeDocNumber) {
      continue;
    }

    for (const row of erpByDocNumber.get(oa.kingdeeDocNumber) ?? []) {
      const itemCode = normalizeText(row["物料编码"]);
      if (!itemCode) {
        continue;
      }
      addErpRowToGroup(result, row, oa.formNumber, itemCode, normalizeDateKey(row["日期"]));
    }
  }

  return result;
}
```

- [ ] **Step 4: Branch the pipeline by default OA direction**

In `src/core/query-pipeline.ts`, import:

```ts
import { DEFAULT_QUERY_DIRECTION, QUERY_DIRECTIONS, parseQueryDirection } from "./query-direction";
```

Import `QueryDirection` in the type import list.

Update `QueryCorePipelineResult`:

```ts
queryDirection: QueryDirection;
```

Update `runQueryCorePipeline()` signature:

```ts
export function runQueryCorePipeline(
  oaRows: RawRow[],
  erpRows: RawRow[],
  filters: Partial<QueryFilters> | Record<string, unknown> | null | undefined,
  metrics: MetricsRecorder = createMetricsRecorder(),
  queryDirectionInput: unknown = DEFAULT_QUERY_DIRECTION
): QueryCorePipelineResult {
```

After filters:

```ts
const queryDirection = parseQueryDirection(queryDirectionInput);
```

For the ERP rows stage, use:

```ts
const erpRowsForOa = metrics.measure(
  "build_erp_rows_for_oa",
  { inputRows: erpRows.length, outputRows: (rows: Map<string, ErpAggRow>) => rows.size },
  () =>
    queryDirection === QUERY_DIRECTIONS.oaKingdeeToErp
      ? buildErpRowsForOaKingdee(erpRows, oaGroupedRows)
      : buildErpRowsForOa(erpRows, oaGroupedRows)
);
```

For the ERP-only stage in this task, keep no ERP-only rows for the default OA direction:

```ts
const erpOnlyRows = metrics.measure(
  "build_erp_only_rows",
  { inputRows: erpRows.length, outputRows: (rows: Map<string, ErpAggRow>) => rows.size },
  () =>
    queryDirection === QUERY_DIRECTIONS.oaKingdeeToErp
      ? new Map<string, ErpAggRow>()
      : buildErpOnlyRows(erpRows, currentOaFormNumbers, activeFilters)
);
```

Add `queryDirection` to the returned object.

- [ ] **Step 5: Update benchmark data for the new default direction**

In `src/perf/benchmark-data.ts`, add `金蝶云单据编号` to `makeOaRow()`:

```ts
金蝶云单据编号: `QOUT${pad(index, 6)}`,
```

For scenario `1`, keep the extra ERP-only row. It will no longer appear in the default OA direction, but it remains useful for ERP direction tests.

In `tests/perf/benchmark-data.test.ts`, add:

```ts
expect(first.oaRows[1]?.["金蝶云单据编号"]).toBe("QOUT000001");
```

- [ ] **Step 6: Run focused tests and verify they pass**

Run:

```bash
npm test -- tests/core/query-core.test.ts tests/core/query-pipeline.test.ts tests/perf/benchmark-data.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/build-erp-rows.ts src/core/query-pipeline.ts src/perf/benchmark-data.ts tests/core/query-core.test.ts tests/core/query-pipeline.test.ts tests/perf/benchmark-data.test.ts
git commit -m "feat: match OA Kingdee numbers to ERP documents"
```

---

### Task 4: ERP Source Number to OA Direction

**Files:**
- Modify: `src/core/build-oa-rows.ts`
- Modify: `src/core/build-erp-rows.ts`
- Modify: `src/core/query-pipeline.ts`
- Modify: `tests/core/query-core.test.ts`
- Modify: `tests/core/query-pipeline.test.ts`

- [ ] **Step 1: Write failing ERP-direction core tests**

In `tests/core/query-core.test.ts`, add:

```ts
it("filters ERP first and compares back to OA in ERP source direction", () => {
  const filters = parseFilters({
    company: "数控",
    dept1: "生产",
    dept2: "仓储",
    startDate: "2026-05-01",
    endDate: "2026-05-31"
  });
  const erpGrouped = buildErpRowsByErpFilters(
    [
      {
        单据编号: "ERP-KEEP-A",
        日期: "2026/5/2",
        源单单号: "OA-KEEP",
        区分公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料编码: "MAT-A",
        物料名称: "物料A",
        实发数量: 1,
        总成本: 10
      },
      {
        单据编号: "ERP-KEEP-B",
        日期: "2026/5/3",
        源单单号: "OA-KEEP",
        区分公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料编码: "MAT-A",
        物料名称: "物料A",
        实发数量: 1,
        总成本: 12
      },
      {
        单据编号: "ERP-OUT-DATE",
        日期: "2026/6/1",
        源单单号: "OA-OUT",
        区分公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料编码: "MAT-A",
        物料名称: "物料A",
        实发数量: 1,
        总成本: 10
      }
    ],
    filters
  );
  const oaGrouped = buildOaRowsForFormNumbers(
    [
      {
        表单编号: "OA-KEEP",
        金蝶云单据编号: "ERP-KEEP-A",
        申请日期: "2026/4/1",
        公司简称: "其他公司",
        一级部门: "其他部门",
        二级部门: "其他二级",
        物料代码: "MAT-A",
        物料名称: "物料A",
        数量: 2,
        实际预算金额mx: 20
      }
    ],
    collectErpSourceForms(erpGrouped)
  );
  const split = splitErpRowsByOaForms(erpGrouped, collectSelectedOaForms(oaGrouped));

  const details = compareRows(oaGrouped, split.erpRowsForOa, split.erpOnlyRows);

  expect([...erpGrouped.keys()]).toEqual(["OA-KEEP||MAT-A"]);
  expect(split.erpRowsForOa.get("OA-KEEP||MAT-A")?.erpDocNumbers).toBe("ERP-KEEP-A,ERP-KEEP-B");
  expect(details[0]).toMatchObject({
    differenceType: "OA和ERP都有，数量一致",
    formNumber: "OA-KEEP",
    oaKingdeeDocNumber: "ERP-KEEP-A",
    erpSourceFormNumber: "OA-KEEP",
    erpCost: 22,
    amountDiff: -2
  });
});

it("keeps filtered ERP rows with missing OA as ERP-only in ERP direction", () => {
  const erpGrouped = buildErpRowsByErpFilters(
    [
      {
        单据编号: "ERP-MISSING",
        日期: "2026/5/2",
        源单单号: "OA-MISSING",
        区分公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料编码: "MAT-A",
        物料名称: "物料A",
        实发数量: 1,
        总成本: 10
      }
    ],
    parseFilters({ company: "数控", startDate: "2026-05-01", endDate: "2026-05-31" })
  );
  const split = splitErpRowsByOaForms(erpGrouped, new Set());

  expect(compareRows(new Map(), split.erpRowsForOa, split.erpOnlyRows)[0]).toMatchObject({
    differenceType: "ERP出库对应OA未在当前OA数据中找到",
    formNumber: "OA-MISSING",
    erpDocNumbers: "ERP-MISSING",
    erpSourceFormNumber: "OA-MISSING"
  });
});
```

Update imports:

```ts
import {
  buildErpOnlyRows,
  buildErpRowsByErpFilters,
  buildErpRowsForOa,
  buildErpRowsForOaKingdee,
  collectErpSourceForms,
  splitErpRowsByOaForms
} from "../../src/core/build-erp-rows";
import { buildOaRows, buildOaRowsForFormNumbers, collectSelectedOaForms, parseFilters } from "../../src/core/build-oa-rows";
```

In `tests/core/query-pipeline.test.ts`, add:

```ts
it("runs ERP source direction with ERP filters and returns ERP-only rows", () => {
  const data = generateBenchmarkData(30);
  const result = runQueryCorePipeline(
    data.oaRows,
    data.erpRows,
    data.filters,
    createMetricsRecorder({
      performance: { now: () => 1 },
      process: {
        memoryUsage: () => ({
          heapUsed: 10 * 1024 * 1024,
          rss: 20 * 1024 * 1024
        })
      }
    }),
    "ERP源单查OA"
  );

  expect(result.queryDirection).toBe("ERP源单查OA");
  expect(result.erpRowsForOa.size).toBeGreaterThan(0);
  expect(result.erpOnlyRows.size).toBeGreaterThan(0);
  expect(result.detailRows.some((row) => row.differenceType === "ERP出库对应OA未在当前OA数据中找到")).toBe(true);
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
npm test -- tests/core/query-core.test.ts tests/core/query-pipeline.test.ts
```

Expected: FAIL because ERP-direction row builders and pipeline branch are missing.

- [ ] **Step 3: Implement OA grouping by form-number set**

In `src/core/build-oa-rows.ts`, add:

```ts
export function buildOaRowsForFormNumbers(
  oaRows?: RawRow[] | null,
  formNumbers?: Set<string> | null
): Map<string, OaAggRow> {
  const result = new Map<string, OaAggRow>();
  const activeFormNumbers = formNumbers ?? new Set<string>();

  for (const row of oaRows ?? []) {
    const formNumber = normalizeText(row["表单编号"]);
    const itemCode = normalizeText(row["物料代码"]);
    if (!formNumber || !itemCode || !activeFormNumbers.has(formNumber)) {
      continue;
    }

    const dateKey = normalizeDateKey(row["申请日期"]);
    const kingdeeDocNumber = normalizeText(row["金蝶云单据编号"]);
    const key = makeDetailKey(formNumber, itemCode);
    let target = result.get(key);
    if (!target) {
      target = {
        formNumber,
        kingdeeDocNumber,
        itemCode,
        itemName: normalizeText(row["物料名称"]),
        company: normalizeText(row["公司简称"]),
        dept1: normalizeText(row["一级部门"]),
        dept2: normalizeText(row["二级部门"]),
        oaDate: "",
        quantity: zeroDecimal(),
        amount: zeroDecimal()
      };
      result.set(key, target);
    }

    if (!target.kingdeeDocNumber && kingdeeDocNumber) {
      target.kingdeeDocNumber = kingdeeDocNumber;
    }
    target.oaDate = appendUniqueJoinedText(target.oaDate, dateKey);
    target.quantity = addDecimal(target.quantity, parseDecimal(row["数量"], "数量"));
    target.amount = addDecimal(target.amount, parseDecimal(row["实际预算金额mx"], "实际预算金额mx"));
  }

  return result;
}
```

- [ ] **Step 4: Implement ERP-origin builders**

In `src/core/build-erp-rows.ts`, add:

```ts
export interface SplitErpRowsByOaFormsResult {
  erpRowsForOa: Map<string, ErpAggRow>;
  erpOnlyRows: Map<string, ErpAggRow>;
}

export function buildErpRowsByErpFilters(
  erpRows?: RawRow[] | null,
  filters?: QueryFilters | null
): Map<string, ErpAggRow> {
  const result = new Map<string, ErpAggRow>();
  const activeFilters = filters ?? parseFilters();

  for (const row of erpRows ?? []) {
    const dateKey = normalizeDateKey(row["日期"]);
    if (!isDateInRange(dateKey, activeFilters)) {
      continue;
    }
    if (!matchesOrgFilters(row["区分公司简称"], row["一级部门"], row["二级部门"], activeFilters)) {
      continue;
    }

    const sourceFormNumber = normalizeText(row["源单单号"]);
    const itemCode = normalizeText(row["物料编码"]);
    if (!sourceFormNumber || !itemCode) {
      continue;
    }

    addErpRowToGroup(result, row, sourceFormNumber, itemCode, dateKey, sourceFormNumber);
  }

  return result;
}

export function collectErpSourceForms(erpGroupedRows?: Map<string, ErpAggRow> | null): Set<string> {
  const result = new Set<string>();

  for (const row of (erpGroupedRows ?? new Map<string, ErpAggRow>()).values()) {
    const sourceFormNumber = normalizeText(row.sourceFormNumber || row.formNumber);
    if (sourceFormNumber) {
      result.add(sourceFormNumber);
    }
  }

  return result;
}

export function splitErpRowsByOaForms(
  erpGroupedRows?: Map<string, ErpAggRow> | null,
  oaFormNumbers?: Set<string> | null
): SplitErpRowsByOaFormsResult {
  const erpRowsForOa = new Map<string, ErpAggRow>();
  const erpOnlyRows = new Map<string, ErpAggRow>();
  const activeOaFormNumbers = oaFormNumbers ?? new Set<string>();

  for (const [key, row] of (erpGroupedRows ?? new Map<string, ErpAggRow>()).entries()) {
    const sourceFormNumber = normalizeText(row.sourceFormNumber || row.formNumber);
    if (sourceFormNumber && activeOaFormNumbers.has(sourceFormNumber)) {
      erpRowsForOa.set(key, row);
    } else {
      erpOnlyRows.set(key, row);
    }
  }

  return { erpRowsForOa, erpOnlyRows };
}
```

- [ ] **Step 5: Branch the pipeline for ERP direction**

In `src/core/query-pipeline.ts`, import:

```ts
import {
  buildErpOnlyRows,
  buildErpRowsByErpFilters,
  buildErpRowsForOa,
  buildErpRowsForOaKingdee,
  collectErpSourceForms,
  splitErpRowsByOaForms
} from "./build-erp-rows";
import { buildOaRows, buildOaRowsForFormNumbers, collectSelectedOaForms, parseFilters } from "./build-oa-rows";
```

Replace the current linear OA-first pipeline body after `activeFilters` with a small branch:

```ts
if (queryDirection === QUERY_DIRECTIONS.erpSourceToOa) {
  const erpGroupedRows = metrics.measure(
    "build_erp_rows_by_erp_filters",
    { inputRows: erpRows.length, outputRows: (rows: Map<string, ErpAggRow>) => rows.size },
    () => buildErpRowsByErpFilters(erpRows, activeFilters)
  );

  const sourceFormNumbers = metrics.measure(
    "collect_erp_source_forms",
    { inputRows: erpGroupedRows.size, outputRows: (rows: Set<string>) => rows.size },
    () => collectErpSourceForms(erpGroupedRows)
  );

  const oaGroupedRows = metrics.measure(
    "build_oa_rows_for_erp_source_forms",
    { inputRows: oaRows.length, outputRows: (rows: Map<string, OaAggRow>) => rows.size },
    () => buildOaRowsForFormNumbers(oaRows, sourceFormNumbers)
  );

  const currentOaFormNumbers = metrics.measure(
    "collect_oa_forms",
    { inputRows: oaGroupedRows.size, outputRows: (rows: Set<string>) => rows.size },
    () => collectSelectedOaForms(oaGroupedRows)
  );

  const splitRows = metrics.measure(
    "split_erp_rows_by_oa_forms",
    { inputRows: erpGroupedRows.size, outputRows: (rows: { erpRowsForOa: Map<string, ErpAggRow>; erpOnlyRows: Map<string, ErpAggRow> }) => rows.erpRowsForOa.size + rows.erpOnlyRows.size },
    () => splitErpRowsByOaForms(erpGroupedRows, currentOaFormNumbers)
  );

  return finishQueryPipeline(
    queryDirection,
    oaGroupedRows,
    currentOaFormNumbers,
    splitRows.erpRowsForOa,
    splitRows.erpOnlyRows,
    metrics
  );
}
```

Extract the shared comparison/output tail into `finishQueryPipeline()` in the same file:

```ts
function finishQueryPipeline(
  queryDirection: QueryDirection,
  oaGroupedRows: Map<string, OaAggRow>,
  currentOaFormNumbers: Set<string>,
  erpRowsForOa: Map<string, ErpAggRow>,
  erpOnlyRows: Map<string, ErpAggRow>,
  metrics: MetricsRecorder
): QueryCorePipelineResult {
  const detailRows = metrics.measure(
    "compare_rows",
    {
      inputRows: oaGroupedRows.size + erpRowsForOa.size + erpOnlyRows.size,
      outputRows: (rows: DetailRow[]) => rows.length
    },
    () => compareRows(oaGroupedRows, erpRowsForOa, erpOnlyRows)
  );

  const summaryRows = metrics.measure(
    "build_summary_rows",
    { inputRows: detailRows.length, outputRows: (rows: SummaryRow[]) => rows.length },
    () => buildSummaryRows(detailRows)
  );

  const outputMatrices = metrics.measure(
    "build_output_matrix",
    {
      inputRows: detailRows.length + summaryRows.length,
      outputRows: detailRows.length + summaryRows.length
    },
    () => ({
      summaryValues: summaryRowsToValues(summaryRows),
      detailValues: detailRowsToValues(detailRows)
    })
  );

  return {
    queryDirection,
    oaGroupedRows,
    currentOaFormNumbers,
    erpRowsForOa,
    erpOnlyRows,
    detailRows,
    summaryRows,
    summaryValues: outputMatrices.summaryValues,
    detailValues: outputMatrices.detailValues
  };
}
```

The OA branch should end with this return:

```ts
return finishQueryPipeline(
  queryDirection,
  oaGroupedRows,
  currentOaFormNumbers,
  erpRowsForOa,
  erpOnlyRows,
  metrics
);
```

- [ ] **Step 6: Run focused tests and verify they pass**

Run:

```bash
npm test -- tests/core/query-core.test.ts tests/core/query-pipeline.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/build-oa-rows.ts src/core/build-erp-rows.ts src/core/query-pipeline.ts tests/core/query-core.test.ts tests/core/query-pipeline.test.ts
git commit -m "feat: add ERP source query direction"
```

---

### Task 5: Query Panel and Macro Output Wiring

**Files:**
- Modify: `src/macros/setup-query-panel.ts`
- Modify: `src/macros/scrap-variance-query.ts`
- Modify: `src/wps-api/write-results.ts`
- Modify: `tests/macros/macro-flow.test.ts`
- Modify: `tests/wps-api/write-results.test.ts`

- [ ] **Step 1: Write failing macro tests**

In `tests/macros/macro-flow.test.ts`, update the setup test expected writes:

```ts
expect(sheet.writes).toEqual([
  {
    address: "A1:A8",
    value: [
      ["报废差异查询"],
      ["公司简称"],
      ["一级部门"],
      ["二级部门"],
      ["开始日期"],
      ["结束日期"],
      ["查询方向"],
      ["运行函数"]
    ]
  },
  {
    address: "B7:B8",
    value: [["OA金蝶单号查ERP"], ["runScrapVarianceQuery"]]
  }
]);
```

Update the preservation test name and assertion:

```ts
it("setupQueryPanel preserves existing B2:B7 filter and direction values", () => {
  const panelSheet = createFakeSheet(SHEET_NAMES.panel);
  panelSheet.rangeValues.set("B2:B7", [["数控"], ["生产"], ["仓储"], ["2026/5/1"], ["2026/5/31"], ["ERP源单查OA"]]);
  const root = makeRoot([panelSheet]);

  setupQueryPanel(root);

  expect(panelSheet.Range("B2:B7").Value2).toEqual([
    ["数控"],
    ["生产"],
    ["仓储"],
    ["2026/5/1"],
    ["2026/5/31"],
    ["ERP源单查OA"]
  ]);
});
```

Update existing query tests to set `B2:B7` instead of `B2:B6`:

```ts
panelSheet.rangeValues.set("B2:B7", [[""], [""], [""], [""], [""], ["OA金蝶单号查ERP"]]);
```

Update clear/output assertions:

```ts
expect(panelSheet.clears).toEqual(["A9:S200000"]);
```

Add invalid direction test:

```ts
it("runScrapVarianceQuery writes an error for an invalid query direction", () => {
  const oaSheet = createFakeSheet(SHEET_NAMES.oa, [[...OA_REQUIRED_HEADERS], validOaRow()]);
  const erpSheet = createFakeSheet(SHEET_NAMES.erp, [[...ERP_REQUIRED_HEADERS], validErpRow()]);
  const panelSheet = createFakeSheet(SHEET_NAMES.panel);
  panelSheet.rangeValues.set("B2:B7", [[""], [""], [""], [""], [""], ["坏方向"]]);
  const root = makeRoot([oaSheet, erpSheet, panelSheet]);

  runScrapVarianceQuery(root);

  const output = flattenWrites(panelSheet);
  expect(panelSheet.clears).toEqual(["A9:S200000"]);
  expect(output.join("|")).toContain("查询方向不正确：请填写 OA金蝶单号查ERP 或 ERP源单查OA");
});
```

Add ERP direction macro test:

```ts
it("runScrapVarianceQuery uses ERP filters when direction is ERP source to OA", () => {
  const oaSheet = createFakeSheet(SHEET_NAMES.oa, [
    [...OA_REQUIRED_HEADERS],
    ["F1", "OUT1", "2026/4/1", "其他公司", "其他部门", "其他二级", "MAT-A", "物料A", 1, 10]
  ]);
  const erpSheet = createFakeSheet(SHEET_NAMES.erp, [
    [...ERP_REQUIRED_HEADERS],
    ["OUT1", "2026/5/2", "F1", "数控", "生产", "仓储", "MAT-A", "物料A", 1, 10]
  ]);
  const panelSheet = createFakeSheet(SHEET_NAMES.panel);
  panelSheet.rangeValues.set("B2:B7", [["数控"], ["生产"], ["仓储"], ["2026/5/1"], ["2026/5/31"], ["ERP源单查OA"]]);
  const root = makeRoot([oaSheet, erpSheet, panelSheet]);

  runScrapVarianceQuery(root);

  const output = flattenWrites(panelSheet);
  expect(output).toContain("F1");
  expect(output).toContain("OA和ERP都有，数量一致");
});
```

- [ ] **Step 2: Run focused macro tests and verify they fail**

Run:

```bash
npm test -- tests/macros/macro-flow.test.ts tests/wps-api/write-results.test.ts
```

Expected: FAIL because setup, range read, clear range, and output start are not updated.

- [ ] **Step 3: Update setup panel**

In `src/macros/setup-query-panel.ts`, import:

```ts
import { DEFAULT_QUERY_DIRECTION } from "../core/query-direction";
```

Replace writes with:

```ts
writeMatrixBulkOrChunks(
  sheet,
  1,
  1,
  [
    ["报废差异查询"],
    ["公司简称"],
    ["一级部门"],
    ["二级部门"],
    ["开始日期"],
    ["结束日期"],
    ["查询方向"],
    ["运行函数"]
  ],
  WRITE_CHUNK_ROWS
);

if (normalizeText(sheet.Range("B7").Value2 ?? sheet.Range("B7").Value) === "") {
  writeMatrixBulkOrChunks(sheet, 7, 2, [[DEFAULT_QUERY_DIRECTION], ["runScrapVarianceQuery"]], WRITE_CHUNK_ROWS);
} else {
  writeMatrixBulkOrChunks(sheet, 8, 2, [["runScrapVarianceQuery"]], WRITE_CHUNK_ROWS);
}
```

Add import:

```ts
import { normalizeText } from "../utils/text";
```

This preserves an existing `B7` direction while still moving the function label to `B8`.

- [ ] **Step 4: Read query direction from the panel**

In `src/macros/scrap-variance-query.ts`, import:

```ts
import { parseQueryDirection, QUERY_DIRECTIONS } from "../core/query-direction";
import type { PanelQueryInput } from "../types/scrap";
```

Replace `readPanelFilters()` with:

```ts
export function readPanelQueryInput(panelRange: WpsRange): PanelQueryInput {
  const values = panelFilterValues(readRangeValue(panelRange));

  return {
    filters: parseFilters({
      company: values[0],
      dept1: values[1],
      dept2: values[2],
      startDate: normalizePanelDateValue(values[3]),
      endDate: normalizePanelDateValue(values[4])
    }),
    queryDirection: parseQueryDirection(values[5])
  };
}
```

Update `panelFilterValues()` slice:

```ts
.slice(0, 6);
```

In `runScrapVarianceQuery()`, replace:

```ts
const filters = readPanelFilters(panel.Range("B2:B6"));
```

with:

```ts
const queryInput = readPanelQueryInput(panel.Range("B2:B7"));
```

Pass the direction:

```ts
const pipeline = runQueryCorePipeline(oaTable.rows, erpTable.rows, queryInput.filters, undefined, queryInput.queryDirection);
```

Update no-match logic:

```ts
if (pipeline.detailRows.length === 0) {
  clearQueryOutput(panel);
  writeMatrixBulkOrChunks(
    panel,
    9,
    1,
    [[pipeline.queryDirection === QUERY_DIRECTIONS.erpSourceToOa ? "查询条件没有匹配到 ERP 数据。" : "查询条件没有匹配到 OA 数据。"]],
    WRITE_CHUNK_ROWS
  );
  return;
}
```

Update output rows:

```ts
writeMatrixBulkOrChunks(panel, 9, 1, [["汇总差异"]], WRITE_CHUNK_ROWS);
writeMatrixBulkOrChunks(panel, 10, 1, pipeline.summaryValues, WRITE_CHUNK_ROWS);

const detailTitleRow = 10 + pipeline.summaryValues.length;
writeMatrixBulkOrChunks(panel, detailTitleRow, 1, [["明细差异"]], WRITE_CHUNK_ROWS);
writeMatrixBulkOrChunks(panel, detailTitleRow + 1, 1, pipeline.detailValues, WRITE_CHUNK_ROWS);
```

Update `assertQueryOutputLimit()`:

```ts
const lastOutputRow = 9 + plannedRows - 1;
```

- [ ] **Step 5: Update query output clear range**

In `src/wps-api/write-results.ts`, update:

```ts
export function clearQueryOutput(sheet: WpsSheet): void {
  clearRange(sheet, `A9:S${MAX_OUTPUT_CLEAR_ROW}`);
}
```

- [ ] **Step 6: Run focused macro tests and verify they pass**

Run:

```bash
npm test -- tests/macros/macro-flow.test.ts tests/wps-api/write-results.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/macros/setup-query-panel.ts src/macros/scrap-variance-query.ts src/wps-api/write-results.ts tests/macros/macro-flow.test.ts tests/wps-api/write-results.test.ts
git commit -m "feat: wire query direction into panel"
```

---

### Task 6: Precheck Rules for Kingdee Number

**Files:**
- Modify: `src/core/precheck.ts`
- Modify: `tests/core/precheck.test.ts`
- Modify: `tests/macros/macro-flow.test.ts`

- [ ] **Step 1: Write failing precheck tests**

In `tests/core/precheck.test.ts`, update helper `oaRow()`:

```ts
金蝶云单据编号: "Q1",
```

Add:

```ts
it("reports missing OA Kingdee document number header as blocking header issue", () => {
  const issues = buildPrecheckIssues(
    table([
      {
        表单编号: "F1",
        申请日期: "2026/5/1",
        公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料代码: "A",
        物料名称: "A物料",
        数量: 1,
        实际预算金额mx: 10
      }
    ]),
    table([erpRow()])
  );

  expect(issues).toHaveLength(1);
  expect(issues[0]).toMatchObject({
    level: "错误",
    source: "OA",
    fieldName: "表头",
    issueType: "缺少关键列"
  });
  expect(issues[0]?.reason).toContain("金蝶云单据编号");
});

it("warns but does not block when OA Kingdee document number is blank", () => {
  const issues = buildPrecheckIssues(table([oaRow({ 金蝶云单据编号: "" })]), table([erpRow()]));
  const issue = issues.find((candidate) => candidate.fieldName === "金蝶云单据编号");

  expect(issue).toMatchObject({
    level: "提醒",
    source: "OA",
    rowNumber: 2,
    rawValue: "",
    issueType: "金蝶云单据编号为空"
  });
  expect(issue?.suggestion).toContain("OA金蝶单号查ERP");
});
```

- [ ] **Step 2: Run focused precheck tests and verify they fail**

Run:

```bash
npm test -- tests/core/precheck.test.ts tests/macros/macro-flow.test.ts
```

Expected: FAIL because the precheck required headers and blank warning are not implemented.

- [ ] **Step 3: Update required precheck headers**

In `src/core/precheck.ts`, add `金蝶云单据编号` to local `OA_REQUIRED_HEADERS`:

```ts
const OA_REQUIRED_HEADERS = [
  "表单编号",
  "金蝶云单据编号",
  "申请日期",
  "公司简称",
  "一级部门",
  "二级部门",
  "物料代码",
  "物料名称",
  "数量",
  "实际预算金额mx"
];
```

- [ ] **Step 4: Add blank Kingdee warning validation**

In `src/core/precheck.ts`, add:

```ts
function validateBlankKingdeeDocNumber(rows: RawRow[], fieldName: string): PrecheckIssue[] {
  const issues: PrecheckIssue[] = [];

  for (const row of rows) {
    if (!isBlankValue(row[fieldName])) {
      continue;
    }

    issues.push(
      buildIssue(
        "提醒",
        "OA",
        row._rowNumber ?? "",
        fieldName,
        "",
        "金蝶云单据编号为空",
        `OA 第 ${String(row._rowNumber ?? "")} 行金蝶云单据编号为空，OA金蝶单号查ERP 时会归为 OA有申请，ERP无出库。`,
        "如果该 OA 已经生成金蝶出库单，请补齐金蝶云单据编号；如果尚未生成，可以保留该提醒。"
      )
    );
  }

  return issues;
}
```

In `buildPrecheckIssues()`, after required cell validations:

```ts
appendValidationIfHeaderExists(issues, oaTable, "金蝶云单据编号", (rows, fieldName) =>
  validateBlankKingdeeDocNumber(rows, fieldName)
);
```

- [ ] **Step 5: Update macro precheck fixtures**

In `tests/macros/macro-flow.test.ts`, the `validOaRow()` helper already includes the added field from Task 2. Confirm the only explicit OA matrix row in the filter test includes `OUT2` immediately after `F2`:

```ts
["F2", "OUT2", "2026/5/1", "装备", "生产", "仓储", "MAT-B", "物料B", 1, 10]
```

- [ ] **Step 6: Run focused precheck tests and verify they pass**

Run:

```bash
npm test -- tests/core/precheck.test.ts tests/macros/macro-flow.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/precheck.ts tests/core/precheck.test.ts tests/macros/macro-flow.test.ts
git commit -m "feat: precheck Kingdee document numbers"
```

---

### Task 7: Documentation, Build Artifact, and Full Verification

**Files:**
- Modify: `docs/wps-js-usage.md`
- Modify: `main.js`
- Verify: all changed source and test files

- [ ] **Step 1: Update usage documentation**

In `docs/wps-js-usage.md`, update OA required headers to include:

```text
- `金蝶云单据编号`
```

Update the query panel section to include:

```markdown
- `B7`：查询方向，可以为空；空值默认 `OA金蝶单号查ERP`。

支持的查询方向：

- `OA金蝶单号查ERP`：按 OA 的申请日期、公司、一级部门、二级部门筛选，再用 `OA.金蝶云单据编号 = ERP.单据编号` 查 ERP。
- `ERP源单查OA`：按 ERP 的日期、区分公司简称、一级部门、二级部门筛选，再用 `ERP.源单单号 = OA.表单编号` 查 OA。
```

Update performance/output constraints:

```text
- 查询输出固定清理 `A9:S200000`。
```

Update common errors:

```markdown
- `查询方向不正确`：`B7` 只能填写 `OA金蝶单号查ERP` 或 `ERP源单查OA`，也可以留空使用默认方向。
- `金蝶云单据编号为空`：预验证提醒，不阻断查询；在 `OA金蝶单号查ERP` 中会表现为 `OA有申请，ERP无出库`。
```

- [ ] **Step 2: Run full test suite before rebuilding bundle**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Rebuild WPS bundle**

Run:

```bash
npm run build
```

Expected: PASS and `main.js` updated from `src/main.ts`.

- [ ] **Step 5: Run benchmark smoke**

Run:

```bash
npm run bench
```

Expected: command completes and writes local benchmark output. Do not commit `.bench/` or `bench-results/latest.json`.

- [ ] **Step 6: Check generated and ignored files**

Run:

```bash
git status --short
```

Expected: only intentional source, tests, docs, and `main.js` changes are listed.

- [ ] **Step 7: Commit**

```bash
git add docs/wps-js-usage.md main.js
git commit -m "docs: document query directions"
```

---

## Final Verification

- [ ] **Step 1: Run all quality gates**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run bench
git diff --check
```

Expected:

- `npm test`: PASS.
- `npm run typecheck`: PASS.
- `npm run build`: PASS and `main.js` matches bundled source.
- `npm run bench`: PASS.
- `git diff --check`: no whitespace errors.

- [ ] **Step 2: Review commit stack**

Run:

```bash
git log --oneline -8
```

Expected: the implementation commits appear after `docs: design bidirectional query directions`.

- [ ] **Step 3: Confirm no accidental local artifacts are staged**

Run:

```bash
git status --short
```

Expected: clean worktree, or only intentionally uncommitted local benchmark artifacts that are ignored by git.

---

## Spec Coverage Self-Review

- Query direction option: Task 1 and Task 5.
- `OA.金蝶云单据编号 = ERP.单据编号`: Task 3.
- `ERP.源单单号 = OA.表单编号`: Task 4.
- Direction-specific filtering: Task 4 and Task 5.
- Added detail columns `OA金蝶云单据编号` and `ERP源单单号`: Task 2.
- Output starts at `A9` and clears `A9:S200000`: Task 5.
- Blank `金蝶云单据编号` warning and query behavior: Task 3 and Task 6.
- Existing amount-only display behavior: Task 2 and Task 3 tests preserve quantity-driven difference type.
- Documentation and generated bundle: Task 7.
