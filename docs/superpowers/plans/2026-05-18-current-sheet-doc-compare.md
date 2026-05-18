# Current Sheet Document Compare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build current-sheet-driven querying with three independent output sheets, ribbon-based shared filters, precise metadata cleanup, and inline material expand/collapse for the two document-compare sheets.

**Architecture:** Keep existing pure query logic for `报废差异明细`, and add a separate pure document-compare core for the two new sheet views. WPS-specific concerns stay in adapter/macro files: active sheet detection, ribbon state, output metadata, selected row, row insertion/deletion, and error writes. The generated `main.js` remains a committed deliverable and must be refreshed at the end.

**Tech Stack:** TypeScript, WPS JS API wrapper fakes, Decimal arithmetic via `decimal.js-light`, Vitest, esbuild.

---

## File Structure

- Create `src/core/output-sheets.ts`: sheet names, output sheet kind detection, and user-facing unsupported-sheet messages.
- Create `tests/core/output-sheets.test.ts`: exact sheet-kind detection tests.
- Create `src/ribbon/state.ts`: normalized shared ribbon filter state, direction parsing, and mutators used by ribbon callbacks.
- Create `tests/ribbon/state.test.ts`: state defaulting and update tests.
- Create `src/core/doc-compare.ts`: pure OA/ERP document-level and material-level comparison builders plus output matrix conversion.
- Create `tests/core/doc-compare.test.ts`: column contracts, aggregation, material rows, and per-view difference math.
- Create `src/wps-api/output-metadata.ts`: hidden metadata read/write, precise cleanup, and output range helpers.
- Create `tests/wps-api/output-metadata.test.ts`: metadata persistence and precise cleanup tests.
- Create `src/wps-api/active-context.ts`: active sheet, selected row, row insert/delete abstractions.
- Create `tests/wps-api/active-context.test.ts`: active sheet and selected row tests using fakes.
- Create `src/macros/output-sheets.ts`: create/rename output sheets and handle old `查询面板` migration to `报废差异明细`.
- Create `src/macros/current-sheet-query.ts`: query current output sheet, safe current-sheet error writes, no-result writes, and material toggle macro.
- Create `tests/macros/current-sheet-query.test.ts`: macro-level current-sheet dispatch, no-linkage behavior, no-result/error behavior, and material toggle behavior.
- Modify `src/constants.ts`: add the three output sheet names and document-compare headers.
- Modify `src/types/scrap.ts`: add document-compare row/result types.
- Modify `src/types/wps.ts`: add minimal WPS types for active sheet, selected range, ribbon callbacks, and row insert/delete.
- Modify `src/wps-api/write-results.ts`: expose range helpers needed by metadata cleanup, without removing existing fixed cleanup functions until migration is complete.
- Modify `src/macros/scrap-variance-query.ts`: keep old query core reusable while moving the public entry to `runCurrentSheetQuery`.
- Modify `src/macros/setup-query-panel.ts`: convert the old setup function into output-sheet setup or keep a compatibility wrapper that calls `setupOutputSheets`.
- Modify `src/ribbon/handlers.ts`: add ribbon input callbacks and dispatch `btnQueryCurrentSheet` / `btnToggleMaterialRows`.
- Modify `src/main.ts`: wire new macros and ribbon state.
- Modify `ribbon.xml`: add edit boxes/dropdown and new buttons.
- Modify `tests/wps-api/fakes.ts`: support active sheet, selected range, insert/delete recording, and metadata ranges.
- Modify `tests/ribbon/main-entry.test.ts`, `tests/build/build-output.test.ts`, and existing macro/WPS tests to reflect the new button names and compatibility behavior.
- Modify `docs/wps-js-usage.md`: document current-page querying, output sheet names, ribbon filters, direction scope, precise cleanup, and material expand/collapse.
- Modify generated `main.js`: run `npm run build` after source changes.

---

### Task 1: Output Sheet Kinds and Ribbon State

**Files:**
- Create: `src/core/output-sheets.ts`
- Create: `tests/core/output-sheets.test.ts`
- Create: `src/ribbon/state.ts`
- Create: `tests/ribbon/state.test.ts`
- Modify: `src/constants.ts`
- Modify: `src/types/scrap.ts`

- [ ] **Step 1: Write failing output sheet tests**

Create `tests/core/output-sheets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SHEET_NAMES } from "../../src/constants";
import {
  OUTPUT_SHEET_KINDS,
  detectOutputSheetKind,
  unsupportedOutputSheetMessage
} from "../../src/core/output-sheets";

describe("output sheet detection", () => {
  it("detects the three supported output sheets", () => {
    expect(detectOutputSheetKind(SHEET_NAMES.detailOutput)).toBe(OUTPUT_SHEET_KINDS.legacyDetail);
    expect(detectOutputSheetKind(SHEET_NAMES.oaDocCompare)).toBe(OUTPUT_SHEET_KINDS.oaDocCompare);
    expect(detectOutputSheetKind(SHEET_NAMES.erpDocCompare)).toBe(OUTPUT_SHEET_KINDS.erpDocCompare);
  });

  it("does not treat source or diagnostics sheets as output sheets", () => {
    expect(detectOutputSheetKind(SHEET_NAMES.oa)).toBeNull();
    expect(detectOutputSheetKind(SHEET_NAMES.erp)).toBeNull();
    expect(detectOutputSheetKind(SHEET_NAMES.performanceDiagnostics)).toBeNull();
    expect(detectOutputSheetKind("Sheet1")).toBeNull();
  });

  it("returns the exact unsupported-sheet guidance", () => {
    expect(unsupportedOutputSheetMessage()).toBe(
      "当前工作表不支持查询，请切换到 报废差异明细、OA视角单据对比 或 ERP视角单据对比。"
    );
  });
});
```

- [ ] **Step 2: Write failing ribbon state tests**

Create `tests/ribbon/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { QUERY_DIRECTIONS } from "../../src/core/query-direction";
import {
  DEFAULT_RIBBON_STATE,
  getRibbonState,
  readRibbonFilters,
  updateRibbonState
} from "../../src/ribbon/state";
import type { ScrapVarianceGlobal } from "../../src/types/wps";

describe("ribbon state", () => {
  it("defaults blank filters and the legacy query direction", () => {
    const root: ScrapVarianceGlobal = {};

    expect(getRibbonState(root)).toEqual(DEFAULT_RIBBON_STATE);
    expect(readRibbonFilters(root)).toEqual({
      company: "",
      dept1: "",
      dept2: "",
      startDate: "",
      endDate: ""
    });
  });

  it("normalizes updates from ribbon edit boxes", () => {
    const root: ScrapVarianceGlobal = {};

    updateRibbonState(root, "company", " 数控 ");
    updateRibbonState(root, "dept1", "生产");
    updateRibbonState(root, "dept2", "仓储");
    updateRibbonState(root, "startDate", "2026/5/1");
    updateRibbonState(root, "endDate", "2026/5/31");
    updateRibbonState(root, "queryDirection", QUERY_DIRECTIONS.erpSourceToOa);

    expect(getRibbonState(root)).toEqual({
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31",
      queryDirection: QUERY_DIRECTIONS.erpSourceToOa
    });
  });

  it("rejects unsupported state keys and query directions", () => {
    const root: ScrapVarianceGlobal = {};

    expect(() => updateRibbonState(root, "missing", "x")).toThrow("未知功能区输入项：missing");
    expect(() => updateRibbonState(root, "queryDirection", "OA查ERP")).toThrow(
      "查询方向不正确：请填写 OA金蝶单号查ERP 或 ERP源单查OA"
    );
  });
});
```

- [ ] **Step 3: Run focused tests and verify they fail**

Run:

```bash
npm test -- tests/core/output-sheets.test.ts tests/ribbon/state.test.ts
```

Expected: FAIL because `src/core/output-sheets.ts` and `src/ribbon/state.ts` do not exist, and `SHEET_NAMES.detailOutput` is not defined.

- [ ] **Step 4: Add constants and types**

In `src/constants.ts`, replace the `SHEET_NAMES` object with this shape, preserving existing values and adding the output names:

```ts
export const SHEET_NAMES = {
  oa: "查询OA-存货报废申请单",
  erp: "查询ERP-报废明细表",
  panel: "查询面板",
  detailOutput: "报废差异明细",
  oaDocCompare: "OA视角单据对比",
  erpDocCompare: "ERP视角单据对比",
  precheckResult: "预验证结果",
  performanceDiagnostics: "性能诊断结果"
} as const;
```

Append document-compare headers in `src/constants.ts`:

```ts
export const OA_DOC_COMPARE_HEADERS = [
  "行类型",
  "公司简称",
  "一级部门",
  "二级部门",
  "OA申请日期",
  "OA单据号",
  "OA数量",
  "OA金额",
  "ERP单据号",
  "ERP数量",
  "ERP金额",
  "数量差额",
  "金额差额",
  "物料编码",
  "物料名称",
  "备注"
] as const;

export const ERP_DOC_COMPARE_HEADERS = [
  "行类型",
  "公司简称",
  "一级部门",
  "二级部门",
  "ERP日期",
  "ERP单据号",
  "ERP数量",
  "ERP金额",
  "OA单据号",
  "OA数量",
  "OA金额",
  "数量差额",
  "金额差额",
  "物料编码",
  "物料名称",
  "备注"
] as const;
```

In `src/types/scrap.ts`, add these types after `PanelQueryInput`:

```ts
export type DocCompareRowType = "汇总" | "物料";
export type OutputSheetKind = "legacy_detail" | "oa_doc_compare" | "erp_doc_compare";

export interface RibbonQueryState {
  company: string;
  dept1: string;
  dept2: string;
  startDate: string;
  endDate: string;
  queryDirection: QueryDirection;
}
```

- [ ] **Step 5: Implement output sheet detection**

Create `src/core/output-sheets.ts`:

```ts
import { SHEET_NAMES } from "../constants";
import type { OutputSheetKind } from "../types/scrap";

export const OUTPUT_SHEET_KINDS = {
  legacyDetail: "legacy_detail",
  oaDocCompare: "oa_doc_compare",
  erpDocCompare: "erp_doc_compare"
} as const satisfies Record<string, OutputSheetKind>;

export function detectOutputSheetKind(sheetName: string): OutputSheetKind | null {
  switch (sheetName) {
    case SHEET_NAMES.detailOutput:
      return OUTPUT_SHEET_KINDS.legacyDetail;
    case SHEET_NAMES.oaDocCompare:
      return OUTPUT_SHEET_KINDS.oaDocCompare;
    case SHEET_NAMES.erpDocCompare:
      return OUTPUT_SHEET_KINDS.erpDocCompare;
    default:
      return null;
  }
}

export function unsupportedOutputSheetMessage(): string {
  return `当前工作表不支持查询，请切换到 ${SHEET_NAMES.detailOutput}、${SHEET_NAMES.oaDocCompare} 或 ${SHEET_NAMES.erpDocCompare}。`;
}
```

- [ ] **Step 6: Implement ribbon state**

Create `src/ribbon/state.ts`:

```ts
import { DEFAULT_QUERY_DIRECTION, parseQueryDirection } from "../core/query-direction";
import { parseFilters } from "../core/build-oa-rows";
import type { QueryFilters, RibbonQueryState } from "../types/scrap";
import type { ScrapVarianceGlobal } from "../types/wps";
import { normalizeText } from "../utils/text";

export const DEFAULT_RIBBON_STATE: RibbonQueryState = {
  company: "",
  dept1: "",
  dept2: "",
  startDate: "",
  endDate: "",
  queryDirection: DEFAULT_QUERY_DIRECTION
};

const RIBBON_STATE_KEYS = new Set<keyof RibbonQueryState>([
  "company",
  "dept1",
  "dept2",
  "startDate",
  "endDate",
  "queryDirection"
]);

export function getRibbonState(root: ScrapVarianceGlobal = globalThis as ScrapVarianceGlobal): RibbonQueryState {
  return {
    ...DEFAULT_RIBBON_STATE,
    ...(root.ScrapVarianceRibbonState ?? {})
  };
}

export function updateRibbonState(
  root: ScrapVarianceGlobal = globalThis as ScrapVarianceGlobal,
  key: string,
  value: unknown
): void {
  if (!RIBBON_STATE_KEYS.has(key as keyof RibbonQueryState)) {
    throw new Error(`未知功能区输入项：${key}`);
  }

  const current = getRibbonState(root);
  if (key === "queryDirection") {
    root.ScrapVarianceRibbonState = {
      ...current,
      queryDirection: parseQueryDirection(value)
    };
    return;
  }

  root.ScrapVarianceRibbonState = {
    ...current,
    [key]: normalizeText(value)
  };
}

export function readRibbonFilters(root: ScrapVarianceGlobal = globalThis as ScrapVarianceGlobal): QueryFilters {
  const state = getRibbonState(root);
  return parseFilters({
    company: state.company,
    dept1: state.dept1,
    dept2: state.dept2,
    startDate: state.startDate,
    endDate: state.endDate
  });
}
```

- [ ] **Step 7: Extend WPS global type**

In `src/types/wps.ts`, add the import and property:

```ts
import type { RibbonQueryState } from "./scrap";
```

Then extend `ScrapVarianceGlobal`:

```ts
  ScrapVarianceRibbonState?: Partial<RibbonQueryState>;
```

- [ ] **Step 8: Run focused tests and verify they pass**

Run:

```bash
npm test -- tests/core/output-sheets.test.ts tests/ribbon/state.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/constants.ts src/types/scrap.ts src/types/wps.ts src/core/output-sheets.ts src/ribbon/state.ts tests/core/output-sheets.test.ts tests/ribbon/state.test.ts
git commit -m "feat: add output sheet and ribbon state primitives"
```

---

### Task 2: Pure Document-Compare Core

**Files:**
- Create: `src/core/doc-compare.ts`
- Create: `tests/core/doc-compare.test.ts`
- Modify: `src/types/scrap.ts`

- [ ] **Step 1: Write failing core tests for OA and ERP document views**

Create `tests/core/doc-compare.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildErpDocCompare,
  buildMaterialRowsForDocSummary,
  buildOaDocCompare,
  docCompareRowsToValues
} from "../../src/core/doc-compare";
import { ERP_DOC_COMPARE_HEADERS, OA_DOC_COMPARE_HEADERS } from "../../src/constants";
import type { RawRow } from "../../src/types/scrap";

const oaRows: RawRow[] = [
  {
    表单编号: "OA-001",
    金蝶云单据编号: "ERP-778",
    申请日期: "2026/5/1",
    公司简称: "数控",
    一级部门: "生产",
    二级部门: "仓储",
    物料代码: "MAT-A",
    物料名称: "物料A",
    数量: 8,
    实际预算金额mx: 80
  },
  {
    表单编号: "OA-001",
    金蝶云单据编号: "ERP-778",
    申请日期: "2026/5/1",
    公司简称: "数控",
    一级部门: "生产",
    二级部门: "仓储",
    物料代码: "MAT-B",
    物料名称: "物料B",
    数量: 2,
    实际预算金额mx: 20
  }
];

const erpRows: RawRow[] = [
  {
    单据编号: "ERP-778",
    日期: "2026/5/2",
    源单单号: "OA-001",
    区分公司简称: "数控",
    一级部门: "生产",
    二级部门: "仓储",
    物料编码: "MAT-A",
    物料名称: "物料A",
    实发数量: 8,
    总成本: 80
  },
  {
    单据编号: "ERP-778",
    日期: "2026/5/2",
    源单单号: "OA-001",
    区分公司简称: "数控",
    一级部门: "生产",
    二级部门: "仓储",
    物料编码: "MAT-B",
    物料名称: "物料B",
    实发数量: 1,
    总成本: 11
  }
];

describe("document compare builders", () => {
  it("builds OA-view summary rows with ERP totals looked up by Kingdee document number", () => {
    const result = buildOaDocCompare(oaRows, erpRows, { company: "数控", dept1: "", dept2: "", startDate: "", endDate: "" });
    const values = docCompareRowsToValues("oa_doc_compare", result.summaryRows);

    expect(values[0]).toEqual([...OA_DOC_COMPARE_HEADERS]);
    expect(values[1]).toEqual([
      "汇总",
      "数控",
      "生产",
      "仓储",
      "2026-05-01",
      "OA-001",
      10,
      100,
      "ERP-778",
      9,
      91,
      1,
      9,
      "",
      "",
      ""
    ]);
  });

  it("builds ERP-view summary rows with OA totals looked up by source form number", () => {
    const result = buildErpDocCompare(oaRows, erpRows, { company: "数控", dept1: "", dept2: "", startDate: "", endDate: "" });
    const values = docCompareRowsToValues("erp_doc_compare", result.summaryRows);

    expect(values[0]).toEqual([...ERP_DOC_COMPARE_HEADERS]);
    expect(values[1]).toEqual([
      "汇总",
      "数控",
      "生产",
      "仓储",
      "2026-05-02",
      "ERP-778",
      9,
      91,
      "OA-001",
      10,
      100,
      -1,
      -9,
      "",
      "",
      ""
    ]);
  });

  it("builds material rows using material-level quantity and amount values", () => {
    const result = buildOaDocCompare(oaRows, erpRows, { company: "", dept1: "", dept2: "", startDate: "", endDate: "" });
    const materialRows = buildMaterialRowsForDocSummary(result, result.summaryRows[0]);

    expect(materialRows.map((row) => [row.rowType, row.oaQuantity, row.oaAmount, row.erpQuantity, row.erpAmount, row.itemCode, row.itemName])).toEqual([
      ["物料", 8, 80, 8, 80, "MAT-A", "物料A"],
      ["物料", 2, 20, 1, 11, "MAT-B", "物料B"]
    ]);
  });
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
npm test -- tests/core/doc-compare.test.ts
```

Expected: FAIL because `src/core/doc-compare.ts` does not exist.

- [ ] **Step 3: Add document-compare types**

In `src/types/scrap.ts`, add after `RibbonQueryState`:

```ts
export interface DocCompareRow {
  rowType: DocCompareRowType;
  company: string;
  dept1: string;
  dept2: string;
  date: string;
  primaryDocNumber: string;
  primaryQuantity: number;
  primaryAmount: number;
  counterpartDocNumber: string;
  counterpartQuantity: number;
  counterpartAmount: number;
  quantityDiff: number;
  amountDiff: number;
  itemCode: string;
  itemName: string;
  remark: string;
}

export interface DocCompareResult {
  kind: Extract<OutputSheetKind, "oa_doc_compare" | "erp_doc_compare">;
  summaryRows: DocCompareRow[];
  materialRowsBySummaryKey: Map<string, DocCompareRow[]>;
}
```

- [ ] **Step 4: Implement pure document compare core**

Create `src/core/doc-compare.ts`:

```ts
import { ERP_DOC_COMPARE_HEADERS, OA_DOC_COMPARE_HEADERS } from "../constants";
import type { DocCompareResult, DocCompareRow, OutputMatrix, QueryFilters, RawRow } from "../types/scrap";
import { normalizeDateKey } from "../utils/date";
import { addDecimal, decimalToNumber2, parseDecimal, subtractDecimal, zeroDecimal } from "../utils/decimal";
import { appendUniqueJoinedText, normalizeText } from "../utils/text";
import { isDateInRange, matchesOrgFilters, parseFilters } from "./build-oa-rows";
import type Decimal from "decimal.js-light";

interface DocAccumulator {
  company: string;
  dept1: string;
  dept2: string;
  date: string;
  primaryDocNumber: string;
  counterpartDocNumber: string;
  primaryQuantity: Decimal;
  primaryAmount: Decimal;
  counterpartQuantity: Decimal;
  counterpartAmount: Decimal;
}

interface MaterialAccumulator extends DocAccumulator {
  itemCode: string;
  itemName: string;
}

function makeMaterialKey(docNumber: string, itemCode: string): string {
  return `${docNumber}||${itemCode}`;
}

function makeSummaryMaterialPrefix(row: DocCompareRow): string {
  return `${row.primaryDocNumber}||`;
}

function toNumber(value: Decimal): number {
  return decimalToNumber2(value);
}

function pushCounterpartForOa(erpRows: RawRow[]): Map<string, { quantity: Decimal; amount: Decimal; materials: Map<string, MaterialAccumulator> }> {
  const result = new Map<string, { quantity: Decimal; amount: Decimal; materials: Map<string, MaterialAccumulator> }>();
  for (const row of erpRows) {
    const erpDoc = normalizeText(row["单据编号"]);
    const itemCode = normalizeText(row["物料编码"]);
    if (!erpDoc) {
      continue;
    }
    const target = result.get(erpDoc) ?? { quantity: zeroDecimal(), amount: zeroDecimal(), materials: new Map<string, MaterialAccumulator>() };
    target.quantity = addDecimal(target.quantity, parseDecimal(row["实发数量"], "实发数量"));
    target.amount = addDecimal(target.amount, parseDecimal(row["总成本"], "总成本"));
    if (itemCode) {
      const key = makeMaterialKey(erpDoc, itemCode);
      const material = target.materials.get(key) ?? {
        company: normalizeText(row["区分公司简称"]),
        dept1: normalizeText(row["一级部门"]),
        dept2: normalizeText(row["二级部门"]),
        date: normalizeDateKey(row["日期"]),
        primaryDocNumber: erpDoc,
        counterpartDocNumber: normalizeText(row["源单单号"]),
        primaryQuantity: zeroDecimal(),
        primaryAmount: zeroDecimal(),
        counterpartQuantity: zeroDecimal(),
        counterpartAmount: zeroDecimal(),
        itemCode,
        itemName: normalizeText(row["物料名称"])
      };
      material.primaryQuantity = addDecimal(material.primaryQuantity, parseDecimal(row["实发数量"], "实发数量"));
      material.primaryAmount = addDecimal(material.primaryAmount, parseDecimal(row["总成本"], "总成本"));
      target.materials.set(key, material);
    }
    result.set(erpDoc, target);
  }
  return result;
}

function buildDocRow(kind: "oa_doc_compare" | "erp_doc_compare", row: DocAccumulator, itemCode = "", itemName = "", rowType: "汇总" | "物料" = "汇总"): DocCompareRow {
  const primaryQuantity = toNumber(row.primaryQuantity);
  const primaryAmount = toNumber(row.primaryAmount);
  const counterpartQuantity = toNumber(row.counterpartQuantity);
  const counterpartAmount = toNumber(row.counterpartAmount);
  const quantityDiff = kind === "oa_doc_compare" ? primaryQuantity - counterpartQuantity : primaryQuantity - counterpartQuantity;
  const amountDiff = kind === "oa_doc_compare" ? primaryAmount - counterpartAmount : primaryAmount - counterpartAmount;
  return {
    rowType,
    company: row.company,
    dept1: row.dept1,
    dept2: row.dept2,
    date: row.date,
    primaryDocNumber: row.primaryDocNumber,
    primaryQuantity,
    primaryAmount,
    counterpartDocNumber: row.counterpartDocNumber,
    counterpartQuantity,
    counterpartAmount,
    quantityDiff: decimalToNumber2(parseDecimal(quantityDiff, "数量差额")),
    amountDiff: decimalToNumber2(parseDecimal(amountDiff, "金额差额")),
    itemCode,
    itemName,
    remark: ""
  };
}

export function buildOaDocCompare(oaRows?: RawRow[] | null, erpRows?: RawRow[] | null, filters?: QueryFilters | null): DocCompareResult {
  const activeFilters = filters ?? parseFilters();
  const erpByDoc = pushCounterpartForOa(erpRows ?? []);
  const summaries = new Map<string, DocAccumulator>();
  const materials = new Map<string, MaterialAccumulator>();

  for (const row of oaRows ?? []) {
    const date = normalizeDateKey(row["申请日期"]);
    if (!isDateInRange(date, activeFilters) || !matchesOrgFilters(row["公司简称"], row["一级部门"], row["二级部门"], activeFilters)) {
      continue;
    }
    const formNumber = normalizeText(row["表单编号"]);
    const erpDoc = normalizeText(row["金蝶云单据编号"]);
    const itemCode = normalizeText(row["物料代码"]);
    if (!formNumber) {
      continue;
    }

    const summary = summaries.get(formNumber) ?? {
      company: normalizeText(row["公司简称"]),
      dept1: normalizeText(row["一级部门"]),
      dept2: normalizeText(row["二级部门"]),
      date: "",
      primaryDocNumber: formNumber,
      counterpartDocNumber: "",
      primaryQuantity: zeroDecimal(),
      primaryAmount: zeroDecimal(),
      counterpartQuantity: zeroDecimal(),
      counterpartAmount: zeroDecimal()
    };
    summary.date = appendUniqueJoinedText(summary.date, date);
    summary.counterpartDocNumber = appendUniqueJoinedText(summary.counterpartDocNumber, erpDoc, ",");
    summary.primaryQuantity = addDecimal(summary.primaryQuantity, parseDecimal(row["数量"], "数量"));
    summary.primaryAmount = addDecimal(summary.primaryAmount, parseDecimal(row["实际预算金额mx"], "实际预算金额mx"));
    summaries.set(formNumber, summary);

    if (itemCode) {
      const materialKey = makeMaterialKey(formNumber, itemCode);
      const material = materials.get(materialKey) ?? { ...summary, itemCode, itemName: normalizeText(row["物料名称"]), primaryQuantity: zeroDecimal(), primaryAmount: zeroDecimal(), counterpartQuantity: zeroDecimal(), counterpartAmount: zeroDecimal() };
      material.date = appendUniqueJoinedText(material.date, date);
      material.counterpartDocNumber = appendUniqueJoinedText(material.counterpartDocNumber, erpDoc, ",");
      material.primaryQuantity = addDecimal(material.primaryQuantity, parseDecimal(row["数量"], "数量"));
      material.primaryAmount = addDecimal(material.primaryAmount, parseDecimal(row["实际预算金额mx"], "实际预算金额mx"));
      materials.set(materialKey, material);
    }
  }

  for (const summary of summaries.values()) {
    for (const erpDoc of summary.counterpartDocNumber.split(",").map((value) => normalizeText(value)).filter(Boolean)) {
      const erp = erpByDoc.get(erpDoc);
      if (!erp) {
        continue;
      }
      summary.counterpartQuantity = addDecimal(summary.counterpartQuantity, erp.quantity);
      summary.counterpartAmount = addDecimal(summary.counterpartAmount, erp.amount);
      for (const [key, erpMaterial] of erp.materials.entries()) {
        const itemCode = key.split("||")[1] ?? "";
        const material = materials.get(makeMaterialKey(summary.primaryDocNumber, itemCode));
        if (material) {
          material.counterpartQuantity = addDecimal(material.counterpartQuantity, erpMaterial.primaryQuantity);
          material.counterpartAmount = addDecimal(material.counterpartAmount, erpMaterial.primaryAmount);
        }
      }
    }
  }

  const summaryRows = [...summaries.values()].map((row) => buildDocRow("oa_doc_compare", row));
  const materialRowsBySummaryKey = new Map<string, DocCompareRow[]>();
  for (const summary of summaryRows) {
    const rows = [...materials.entries()]
      .filter(([key]) => key.startsWith(makeSummaryMaterialPrefix(summary)))
      .map(([, row]) => buildDocRow("oa_doc_compare", row, row.itemCode, row.itemName, "物料"));
    materialRowsBySummaryKey.set(summary.primaryDocNumber, rows);
  }
  return { kind: "oa_doc_compare", summaryRows, materialRowsBySummaryKey };
}

export function buildErpDocCompare(oaRows?: RawRow[] | null, erpRows?: RawRow[] | null, filters?: QueryFilters | null): DocCompareResult {
  const activeFilters = filters ?? parseFilters();
  const summaries = new Map<string, DocAccumulator>();
  const materials = new Map<string, MaterialAccumulator>();

  const oaByForm = new Map<string, { quantity: Decimal; amount: Decimal; materials: Map<string, MaterialAccumulator> }>();
  for (const row of oaRows ?? []) {
    const formNumber = normalizeText(row["表单编号"]);
    const itemCode = normalizeText(row["物料代码"]);
    if (!formNumber) {
      continue;
    }
    const target = oaByForm.get(formNumber) ?? { quantity: zeroDecimal(), amount: zeroDecimal(), materials: new Map<string, MaterialAccumulator>() };
    target.quantity = addDecimal(target.quantity, parseDecimal(row["数量"], "数量"));
    target.amount = addDecimal(target.amount, parseDecimal(row["实际预算金额mx"], "实际预算金额mx"));
    if (itemCode) {
      const key = makeMaterialKey(formNumber, itemCode);
      const material = target.materials.get(key) ?? {
        company: normalizeText(row["公司简称"]),
        dept1: normalizeText(row["一级部门"]),
        dept2: normalizeText(row["二级部门"]),
        date: normalizeDateKey(row["申请日期"]),
        primaryDocNumber: formNumber,
        counterpartDocNumber: normalizeText(row["金蝶云单据编号"]),
        primaryQuantity: zeroDecimal(),
        primaryAmount: zeroDecimal(),
        counterpartQuantity: zeroDecimal(),
        counterpartAmount: zeroDecimal(),
        itemCode,
        itemName: normalizeText(row["物料名称"])
      };
      material.primaryQuantity = addDecimal(material.primaryQuantity, parseDecimal(row["数量"], "数量"));
      material.primaryAmount = addDecimal(material.primaryAmount, parseDecimal(row["实际预算金额mx"], "实际预算金额mx"));
      target.materials.set(key, material);
    }
    oaByForm.set(formNumber, target);
  }

  for (const row of erpRows ?? []) {
    const date = normalizeDateKey(row["日期"]);
    if (!isDateInRange(date, activeFilters) || !matchesOrgFilters(row["区分公司简称"], row["一级部门"], row["二级部门"], activeFilters)) {
      continue;
    }
    const erpDoc = normalizeText(row["单据编号"]);
    const sourceForm = normalizeText(row["源单单号"]);
    const itemCode = normalizeText(row["物料编码"]);
    if (!erpDoc) {
      continue;
    }
    const summary = summaries.get(erpDoc) ?? {
      company: normalizeText(row["区分公司简称"]),
      dept1: normalizeText(row["一级部门"]),
      dept2: normalizeText(row["二级部门"]),
      date: "",
      primaryDocNumber: erpDoc,
      counterpartDocNumber: "",
      primaryQuantity: zeroDecimal(),
      primaryAmount: zeroDecimal(),
      counterpartQuantity: zeroDecimal(),
      counterpartAmount: zeroDecimal()
    };
    summary.date = appendUniqueJoinedText(summary.date, date);
    summary.counterpartDocNumber = appendUniqueJoinedText(summary.counterpartDocNumber, sourceForm, ",");
    summary.primaryQuantity = addDecimal(summary.primaryQuantity, parseDecimal(row["实发数量"], "实发数量"));
    summary.primaryAmount = addDecimal(summary.primaryAmount, parseDecimal(row["总成本"], "总成本"));
    summaries.set(erpDoc, summary);

    if (itemCode) {
      const materialKey = makeMaterialKey(erpDoc, itemCode);
      const material = materials.get(materialKey) ?? { ...summary, itemCode, itemName: normalizeText(row["物料名称"]), primaryQuantity: zeroDecimal(), primaryAmount: zeroDecimal(), counterpartQuantity: zeroDecimal(), counterpartAmount: zeroDecimal() };
      material.date = appendUniqueJoinedText(material.date, date);
      material.counterpartDocNumber = appendUniqueJoinedText(material.counterpartDocNumber, sourceForm, ",");
      material.primaryQuantity = addDecimal(material.primaryQuantity, parseDecimal(row["实发数量"], "实发数量"));
      material.primaryAmount = addDecimal(material.primaryAmount, parseDecimal(row["总成本"], "总成本"));
      materials.set(materialKey, material);
    }
  }

  for (const summary of summaries.values()) {
    for (const sourceForm of summary.counterpartDocNumber.split(",").map((value) => normalizeText(value)).filter(Boolean)) {
      const oa = oaByForm.get(sourceForm);
      if (!oa) {
        continue;
      }
      summary.counterpartQuantity = addDecimal(summary.counterpartQuantity, oa.quantity);
      summary.counterpartAmount = addDecimal(summary.counterpartAmount, oa.amount);
      for (const [key, oaMaterial] of oa.materials.entries()) {
        const itemCode = key.split("||")[1] ?? "";
        const material = materials.get(makeMaterialKey(summary.primaryDocNumber, itemCode));
        if (material) {
          material.counterpartQuantity = addDecimal(material.counterpartQuantity, oaMaterial.primaryQuantity);
          material.counterpartAmount = addDecimal(material.counterpartAmount, oaMaterial.primaryAmount);
        }
      }
    }
  }

  const summaryRows = [...summaries.values()].map((row) => buildDocRow("erp_doc_compare", row));
  const materialRowsBySummaryKey = new Map<string, DocCompareRow[]>();
  for (const summary of summaryRows) {
    const rows = [...materials.entries()]
      .filter(([key]) => key.startsWith(makeSummaryMaterialPrefix(summary)))
      .map(([, row]) => buildDocRow("erp_doc_compare", row, row.itemCode, row.itemName, "物料"));
    materialRowsBySummaryKey.set(summary.primaryDocNumber, rows);
  }
  return { kind: "erp_doc_compare", summaryRows, materialRowsBySummaryKey };
}

export function buildMaterialRowsForDocSummary(result: DocCompareResult, summaryRow: DocCompareRow): DocCompareRow[] {
  return result.materialRowsBySummaryKey.get(summaryRow.primaryDocNumber) ?? [];
}

export function docCompareRowsToValues(kind: "oa_doc_compare" | "erp_doc_compare", rows: DocCompareRow[]): OutputMatrix {
  const headers = kind === "oa_doc_compare" ? OA_DOC_COMPARE_HEADERS : ERP_DOC_COMPARE_HEADERS;
  return [
    [...headers],
    ...rows.map((row) => [
      row.rowType,
      row.company,
      row.dept1,
      row.dept2,
      row.date,
      row.primaryDocNumber,
      row.primaryQuantity,
      row.primaryAmount,
      row.counterpartDocNumber,
      row.counterpartQuantity,
      row.counterpartAmount,
      row.quantityDiff,
      row.amountDiff,
      row.itemCode,
      row.itemName,
      row.remark
    ])
  ];
}
```

- [ ] **Step 5: Run focused tests and fix TypeScript errors**

Run:

```bash
npm test -- tests/core/doc-compare.test.ts
npm run typecheck
```

Expected: PASS for the test and typecheck. If TypeScript reports object spread widening for `MaterialAccumulator`, replace the spread initializers with explicit object literals that fill all `MaterialAccumulator` fields.

- [ ] **Step 6: Commit**

```bash
git add src/types/scrap.ts src/core/doc-compare.ts tests/core/doc-compare.test.ts
git commit -m "feat: add document compare core"
```

---

### Task 3: Hidden Metadata and Active Context Adapters

**Files:**
- Create: `src/wps-api/output-metadata.ts`
- Create: `src/wps-api/active-context.ts`
- Create: `tests/wps-api/output-metadata.test.ts`
- Create: `tests/wps-api/active-context.test.ts`
- Modify: `src/types/wps.ts`
- Modify: `src/wps-api/write-results.ts`
- Modify: `tests/wps-api/fakes.ts`

- [ ] **Step 1: Write failing metadata tests**

Create `tests/wps-api/output-metadata.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { saveOutputMetadata, readOutputMetadata, clearPreviousToolOutput } from "../../src/wps-api/output-metadata";
import { createFakeSheet } from "./fakes";

describe("output metadata", () => {
  it("stores and reads the previous tool output range", () => {
    const sheet = createFakeSheet("OA视角单据对比");

    saveOutputMetadata(sheet, { kind: "oa_doc_compare", rangeAddress: "A1:P3" });

    expect(readOutputMetadata(sheet)).toEqual({ kind: "oa_doc_compare", rangeAddress: "A1:P3" });
  });

  it("clears only the metadata range", () => {
    const sheet = createFakeSheet("OA视角单据对比");
    saveOutputMetadata(sheet, { kind: "oa_doc_compare", rangeAddress: "A1:P3" });

    clearPreviousToolOutput(sheet, "oa_doc_compare");

    expect(sheet.clears).toEqual(["A1:P3"]);
  });

  it("does not clear when metadata is missing or for another output kind", () => {
    const missing = createFakeSheet("OA视角单据对比");
    const other = createFakeSheet("ERP视角单据对比");
    saveOutputMetadata(other, { kind: "erp_doc_compare", rangeAddress: "A1:P4" });

    clearPreviousToolOutput(missing, "oa_doc_compare");
    clearPreviousToolOutput(other, "oa_doc_compare");

    expect(missing.clears).toEqual([]);
    expect(other.clears).toEqual([]);
  });
});
```

- [ ] **Step 2: Write failing active context tests**

Create `tests/wps-api/active-context.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getActiveSheet, getSelectedRowNumber, insertRowsBelow, deleteRows } from "../../src/wps-api/active-context";
import type { ScrapVarianceGlobal } from "../../src/types/wps";
import { createFakeApplication, createFakeSheet } from "./fakes";

describe("active WPS context", () => {
  it("returns the active sheet when WPS exposes ActiveSheet", () => {
    const active = createFakeSheet("OA视角单据对比");
    const root: ScrapVarianceGlobal = { Application: createFakeApplication([active]) };
    root.Application!.ActiveSheet = active;

    expect(getActiveSheet(root)).toBe(active);
  });

  it("returns selected row number from Selection.Row", () => {
    const root: ScrapVarianceGlobal = { Application: createFakeApplication([]) };
    root.Application!.Selection = { Row: 12 };

    expect(getSelectedRowNumber(root)).toBe(12);
  });

  it("records row insert and delete operations through the fake sheet", () => {
    const sheet = createFakeSheet("OA视角单据对比");

    insertRowsBelow(sheet, 3, 2);
    deleteRows(sheet, 4, 2);

    expect(sheet.rowInserts).toEqual([{ afterRow: 3, rowCount: 2 }]);
    expect(sheet.rowDeletes).toEqual([{ startRow: 4, rowCount: 2 }]);
  });
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
npm test -- tests/wps-api/output-metadata.test.ts tests/wps-api/active-context.test.ts
```

Expected: FAIL because the adapter files and fake support do not exist.

- [ ] **Step 4: Extend WPS types**

In `src/types/wps.ts`, extend `WpsRange`, `WpsSheet`, and `WpsApplication`:

```ts
export interface WpsRowOperationTarget {
  Insert?: () => void;
  Delete?: () => void;
}
```

Add to `WpsRange`:

```ts
  EntireRow?: WpsRowOperationTarget;
  Insert?: () => void;
  Delete?: () => void;
```

Add to `WpsApplication`:

```ts
  ActiveSheet?: WpsSheet;
  Selection?: WpsRange;
```

- [ ] **Step 5: Expose `clearRange` from write-results**

In `src/wps-api/write-results.ts`, change:

```ts
function clearRange(sheet: WpsSheet, address: string): void {
```

to:

```ts
export function clearRange(sheet: WpsSheet, address: string): void {
```

- [ ] **Step 6: Implement output metadata**

Create `src/wps-api/output-metadata.ts`:

```ts
import type { OutputSheetKind } from "../types/scrap";
import type { WpsSheet } from "../types/wps";
import { normalizeText } from "../utils/text";
import { clearRange, writeMatrixBulkOrChunks } from "./write-results";

const METADATA_START_ROW = 1;
const METADATA_START_COL = 80; // CB, far away from visible output columns.

export interface OutputMetadata {
  kind: OutputSheetKind;
  rangeAddress: string;
}

export function readOutputMetadata(sheet: WpsSheet): OutputMetadata | null {
  const value = sheet.Range("CB1:CC1").Value2 ?? sheet.Range("CB1:CC1").Value;
  const row = Array.isArray(value) && Array.isArray(value[0]) ? value[0] : [];
  const kind = normalizeText(row[0]);
  const rangeAddress = normalizeText(row[1]);
  if (!kind || !rangeAddress) {
    return null;
  }
  if (kind !== "legacy_detail" && kind !== "oa_doc_compare" && kind !== "erp_doc_compare") {
    return null;
  }
  return { kind, rangeAddress };
}

export function saveOutputMetadata(sheet: WpsSheet, metadata: OutputMetadata): void {
  writeMatrixBulkOrChunks(sheet, METADATA_START_ROW, METADATA_START_COL, [[metadata.kind, metadata.rangeAddress]], 1);
}

export function clearPreviousToolOutput(sheet: WpsSheet, expectedKind: OutputSheetKind): void {
  const metadata = readOutputMetadata(sheet);
  if (!metadata || metadata.kind !== expectedKind) {
    return;
  }
  clearRange(sheet, metadata.rangeAddress);
}
```

- [ ] **Step 7: Implement active context adapter**

Create `src/wps-api/active-context.ts`:

```ts
import type { ScrapVarianceGlobal, WpsSheet } from "../types/wps";
import { getApplication } from "./workbook";

export function getActiveSheet(root?: ScrapVarianceGlobal): WpsSheet {
  const app = getApplication(root);
  if (!app.ActiveSheet) {
    throw new Error("当前 WPS Application 没有 ActiveSheet，无法识别当前工作表。");
  }
  return app.ActiveSheet;
}

export function getSelectedRowNumber(root?: ScrapVarianceGlobal): number {
  const app = getApplication(root);
  const row = app.Selection?.Row;
  if (!Number.isInteger(row) || row <= 0) {
    throw new Error("当前选区无法识别为有效单据行。");
  }
  return row;
}

export function insertRowsBelow(sheet: WpsSheet, afterRow: number, rowCount: number): void {
  if (!Number.isInteger(afterRow) || afterRow <= 0 || !Number.isInteger(rowCount) || rowCount <= 0) {
    throw new Error("插入行参数不正确。");
  }
  const startRow = afterRow + 1;
  const endRow = afterRow + rowCount;
  const range = sheet.Range(`${startRow}:${endRow}`);
  const insert = range.EntireRow?.Insert ?? range.Insert;
  if (typeof insert !== "function") {
    throw new Error("当前 WPS Range 不支持插入行。");
  }
  insert.call(range.EntireRow ?? range);
}

export function deleteRows(sheet: WpsSheet, startRow: number, rowCount: number): void {
  if (!Number.isInteger(startRow) || startRow <= 0 || !Number.isInteger(rowCount) || rowCount <= 0) {
    throw new Error("删除行参数不正确。");
  }
  const endRow = startRow + rowCount - 1;
  const range = sheet.Range(`${startRow}:${endRow}`);
  const deleteRowsFn = range.EntireRow?.Delete ?? range.Delete;
  if (typeof deleteRowsFn !== "function") {
    throw new Error("当前 WPS Range 不支持删除行。");
  }
  deleteRowsFn.call(range.EntireRow ?? range);
}
```

- [ ] **Step 8: Update WPS fakes**

In `tests/wps-api/fakes.ts`, add to `FakeSheet`:

```ts
  rowInserts: Array<{ afterRow: number; rowCount: number }>;
  rowDeletes: Array<{ startRow: number; rowCount: number }>;
```

Initialize in `createFakeSheet`:

```ts
    rowInserts: [],
    rowDeletes: [],
```

Add this helper near `parseRangeAddress`:

```ts
function parseRowRangeAddress(address: string): { startRow: number; endRow: number } | null {
  const match = address.match(/^(\d+):(\d+)$/);
  if (!match) {
    return null;
  }
  return { startRow: Number(match[1]), endRow: Number(match[2]) };
}
```

Inside `Range(address: string): WpsRange`, before returning the object:

```ts
      const rowRange = parseRowRangeAddress(address);
```

Add to the returned range object:

```ts
        EntireRow: rowRange
          ? {
              Insert(): void {
                sheet.rowInserts.push({
                  afterRow: rowRange.startRow - 1,
                  rowCount: rowRange.endRow - rowRange.startRow + 1
                });
              },
              Delete(): void {
                sheet.rowDeletes.push({
                  startRow: rowRange.startRow,
                  rowCount: rowRange.endRow - rowRange.startRow + 1
                });
              }
            }
          : undefined,
```

In `createFakeApplication`, no change is required for tests because they set `ActiveSheet` and `Selection` on the returned application object.

- [ ] **Step 9: Run focused adapter tests**

Run:

```bash
npm test -- tests/wps-api/output-metadata.test.ts tests/wps-api/active-context.test.ts tests/wps-api/write-results.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/types/wps.ts src/wps-api/write-results.ts src/wps-api/output-metadata.ts src/wps-api/active-context.ts tests/wps-api/fakes.ts tests/wps-api/output-metadata.test.ts tests/wps-api/active-context.test.ts
git commit -m "feat: add precise output metadata adapters"
```

---

### Task 4: Output Sheet Setup and Current-Sheet Query Macro

**Files:**
- Create: `src/macros/output-sheets.ts`
- Create: `src/macros/current-sheet-query.ts`
- Create: `tests/macros/current-sheet-query.test.ts`
- Modify: `src/macros/setup-query-panel.ts`
- Modify: `src/macros/scrap-variance-query.ts`
- Modify: `tests/macros/macro-flow.test.ts`

- [ ] **Step 1: Write failing macro tests for current-sheet dispatch**

Create `tests/macros/current-sheet-query.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ERP_REQUIRED_HEADERS, OA_REQUIRED_HEADERS, SHEET_NAMES } from "../../src/constants";
import { setupOutputSheets } from "../../src/macros/output-sheets";
import { runCurrentSheetQuery } from "../../src/macros/current-sheet-query";
import type { ScrapVarianceGlobal } from "../../src/types/wps";
import { createFakeApplication, createFakeSheet } from "../wps-api/fakes";

function validOaRow(): Array<string | number> {
  return ["OA-001", "ERP-778", "2026/5/1", "数控", "生产", "仓储", "MAT-A", "物料A", 1, 10];
}

function validErpRow(): Array<string | number> {
  return ["ERP-778", "2026/5/2", "OA-001", "数控", "生产", "仓储", "MAT-A", "物料A", 1, 10];
}

function rootWith(activeSheetName: string): { root: ScrapVarianceGlobal; active: ReturnType<typeof createFakeSheet> } {
  const oa = createFakeSheet(SHEET_NAMES.oa, [[...OA_REQUIRED_HEADERS], validOaRow()]);
  const erp = createFakeSheet(SHEET_NAMES.erp, [[...ERP_REQUIRED_HEADERS], validErpRow()]);
  const detail = createFakeSheet(SHEET_NAMES.detailOutput);
  const oaCompare = createFakeSheet(SHEET_NAMES.oaDocCompare);
  const erpCompare = createFakeSheet(SHEET_NAMES.erpDocCompare);
  const sheets = [oa, erp, detail, oaCompare, erpCompare];
  const active = sheets.find((sheet) => sheet.Name === activeSheetName)!;
  const app = createFakeApplication(sheets);
  app.ActiveSheet = active;
  const root: ScrapVarianceGlobal = { Application: app };
  return { root, active };
}

describe("current sheet query macro", () => {
  it("creates the three output sheets", () => {
    const root: ScrapVarianceGlobal = { Application: createFakeApplication([]) };

    setupOutputSheets(root);

    const app = root.Application!;
    expect(app.ActiveWorkbook!.Worksheets!.Count).toBe(3);
    expect(app.ActiveWorkbook!.Worksheets!.Item(1).Name).toBe(SHEET_NAMES.detailOutput);
    expect(app.ActiveWorkbook!.Worksheets!.Item(2).Name).toBe(SHEET_NAMES.oaDocCompare);
    expect(app.ActiveWorkbook!.Worksheets!.Item(3).Name).toBe(SHEET_NAMES.erpDocCompare);
  });

  it("writes only OA document compare output when OA compare sheet is active", () => {
    const { root, active } = rootWith(SHEET_NAMES.oaDocCompare);

    runCurrentSheetQuery(root);

    expect(active.writes.some((write) => write.address === "A1:P2")).toBe(true);
    expect(active.writes.flatMap((write) => JSON.stringify(write.value))).toContain(expect.stringContaining("OA-001"));
  });

  it("throws an unsupported-sheet error without touching source sheets", () => {
    const source = createFakeSheet(SHEET_NAMES.oa, [[...OA_REQUIRED_HEADERS], validOaRow()]);
    const app = createFakeApplication([source]);
    app.ActiveSheet = source;
    const root: ScrapVarianceGlobal = { Application: app };

    expect(() => runCurrentSheetQuery(root)).toThrow(
      "当前工作表不支持查询，请切换到 报废差异明细、OA视角单据对比 或 ERP视角单据对比。"
    );

    expect(source.writes).toEqual([]);
    expect(source.clears).toEqual([]);
  });
});
```

- [ ] **Step 2: Run macro tests and verify they fail**

Run:

```bash
npm test -- tests/macros/current-sheet-query.test.ts
```

Expected: FAIL because the new macro files do not exist.

- [ ] **Step 3: Implement output sheet setup**

Create `src/macros/output-sheets.ts`:

```ts
import { SHEET_NAMES } from "../constants";
import type { ScrapVarianceGlobal } from "../types/wps";
import { ensureSheet, findSheetByName } from "../wps-api/workbook";

export function setupOutputSheets(root?: ScrapVarianceGlobal): void {
  const oldPanel = findSheetByName(SHEET_NAMES.panel, root);
  const existingDetail = findSheetByName(SHEET_NAMES.detailOutput, root);
  if (oldPanel && !existingDetail) {
    oldPanel.Name = SHEET_NAMES.detailOutput;
  } else {
    ensureSheet(SHEET_NAMES.detailOutput, root);
  }

  ensureSheet(SHEET_NAMES.oaDocCompare, root);
  ensureSheet(SHEET_NAMES.erpDocCompare, root);
}
```

- [ ] **Step 4: Implement current-sheet query macro**

Create `src/macros/current-sheet-query.ts`:

```ts
import {
  ERP_REQUIRED_HEADERS,
  MAX_HEADER_SCAN_ROWS,
  MIN_ERP_HEADER_MATCH_COUNT,
  MIN_OA_HEADER_MATCH_COUNT,
  OA_REQUIRED_HEADERS,
  SHEET_NAMES,
  WRITE_CHUNK_ROWS
} from "../constants";
import { buildErpDocCompare, buildOaDocCompare, docCompareRowsToValues } from "../core/doc-compare";
import { detectOutputSheetKind, unsupportedOutputSheetMessage } from "../core/output-sheets";
import { runQueryCorePipeline } from "../core/query-pipeline";
import { getRibbonState, readRibbonFilters } from "../ribbon/state";
import type { DocCompareResult, OutputMatrix, OutputSheetKind } from "../types/scrap";
import type { ScrapVarianceGlobal, WpsSheet } from "../types/wps";
import { readSheetTable } from "../wps-api/read-sheet-data";
import { getActiveSheet } from "../wps-api/active-context";
import { clearPreviousToolOutput, saveOutputMetadata } from "../wps-api/output-metadata";
import { getSheetByName } from "../wps-api/workbook";
import { rangeAddress, writeMatrixBulkOrChunks } from "../wps-api/write-results";
import { setupOutputSheets } from "./output-sheets";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeWriteCurrentSheetError(sheet: WpsSheet, message: string): void {
  writeMatrixBulkOrChunks(sheet, 1, 1, [["错误", message]], WRITE_CHUNK_ROWS);
  saveOutputMetadata(sheet, { kind: detectOutputSheetKind(sheet.Name) ?? "legacy_detail", rangeAddress: "A1:B1" });
}

function writeResultWithMetadata(sheet: WpsSheet, kind: OutputSheetKind, values: OutputMatrix): void {
  if (values.length === 0) {
    return;
  }
  writeMatrixBulkOrChunks(sheet, 1, 1, values, WRITE_CHUNK_ROWS);
  saveOutputMetadata(sheet, {
    kind,
    rangeAddress: rangeAddress(1, 1, values.length, Math.max(...values.map((row) => row.length)))
  });
}

function readSourceTables(root?: ScrapVarianceGlobal) {
  const oaSheet = getSheetByName(SHEET_NAMES.oa, root);
  const erpSheet = getSheetByName(SHEET_NAMES.erp, root);
  const oaTable = readSheetTable(oaSheet, [...OA_REQUIRED_HEADERS], MIN_OA_HEADER_MATCH_COUNT, MAX_HEADER_SCAN_ROWS);
  const erpTable = readSheetTable(erpSheet, [...ERP_REQUIRED_HEADERS], MIN_ERP_HEADER_MATCH_COUNT, MAX_HEADER_SCAN_ROWS);
  return { oaRows: oaTable.rows, erpRows: erpTable.rows };
}

function noDataMessage(kind: OutputSheetKind): string {
  return kind === "erp_doc_compare" ? "查询条件没有匹配到 ERP 数据。" : "查询条件没有匹配到 OA 数据。";
}

function docCompareValues(kind: Extract<OutputSheetKind, "oa_doc_compare" | "erp_doc_compare">, result: DocCompareResult): OutputMatrix {
  if (result.summaryRows.length === 0) {
    return [[noDataMessage(kind)]];
  }
  return docCompareRowsToValues(kind, result.summaryRows);
}

export function runCurrentSheetQuery(root?: ScrapVarianceGlobal): void {
  setupOutputSheets(root);
  const activeSheet = getActiveSheet(root);
  const kind = detectOutputSheetKind(activeSheet.Name);
  if (!kind) {
    throw new Error(unsupportedOutputSheetMessage());
  }

  try {
    const filters = readRibbonFilters(root);
    const { oaRows, erpRows } = readSourceTables(root);
    clearPreviousToolOutput(activeSheet, kind);

    if (kind === "legacy_detail") {
      const ribbonState = getRibbonState(root);
      const pipeline = runQueryCorePipeline(oaRows, erpRows, filters, undefined, ribbonState.queryDirection);
      const values: OutputMatrix =
        pipeline.detailRows.length === 0
          ? [[noDataMessage(pipeline.queryDirection === "ERP源单查OA" ? "erp_doc_compare" : "oa_doc_compare")]]
          : [["汇总差异"], ...pipeline.summaryValues, ["明细差异"], ...pipeline.detailValues];
      writeResultWithMetadata(activeSheet, kind, values);
      return;
    }

    if (kind === "oa_doc_compare") {
      writeResultWithMetadata(activeSheet, kind, docCompareValues(kind, buildOaDocCompare(oaRows, erpRows, filters)));
      return;
    }

    writeResultWithMetadata(activeSheet, kind, docCompareValues(kind, buildErpDocCompare(oaRows, erpRows, filters)));
  } catch (error) {
    clearPreviousToolOutput(activeSheet, kind);
    safeWriteCurrentSheetError(activeSheet, errorMessage(error));
  }
}
```

- [ ] **Step 5: Add compatibility wrappers**

Replace `src/macros/setup-query-panel.ts` with:

```ts
import type { WpsSheet, ScrapVarianceGlobal } from "../types/wps";
import { SHEET_NAMES } from "../constants";
import { setupOutputSheets } from "./output-sheets";
import { getSheetByName } from "../wps-api/workbook";

export function setupQueryPanel(root?: ScrapVarianceGlobal): WpsSheet {
  setupOutputSheets(root);
  return getSheetByName(SHEET_NAMES.detailOutput, root);
}
```

Replace the public body of `runScrapVarianceQuery` in `src/macros/scrap-variance-query.ts` with a compatibility call:

```ts
export function runScrapVarianceQuery(root?: ScrapVarianceGlobal): void {
  runCurrentSheetQuery(root);
}
```

Add the import:

```ts
import { runCurrentSheetQuery } from "./current-sheet-query";
```

Keep `readPanelFilters`, `readPanelQueryInput`, and `safeWriteQueryError` exported until later tasks update all callers.

- [ ] **Step 6: Run focused macro tests**

Run:

```bash
npm test -- tests/macros/current-sheet-query.test.ts tests/macros/macro-flow.test.ts
npm run typecheck
```

Expected: PASS after updating existing macro-flow expectations from `查询面板` to `报废差异明细` where they assert the output sheet name.

- [ ] **Step 7: Commit**

```bash
git add src/macros/output-sheets.ts src/macros/current-sheet-query.ts src/macros/setup-query-panel.ts src/macros/scrap-variance-query.ts tests/macros/current-sheet-query.test.ts tests/macros/macro-flow.test.ts
git commit -m "feat: add current sheet query macro"
```

---

### Task 5: Inline Material Expand and Collapse

**Files:**
- Modify: `src/macros/current-sheet-query.ts`
- Modify: `tests/macros/current-sheet-query.test.ts`
- Modify: `src/wps-api/output-metadata.ts`

- [ ] **Step 1: Add failing material toggle tests**

Append to `tests/macros/current-sheet-query.test.ts`:

```ts
import { toggleMaterialRows } from "../../src/macros/current-sheet-query";

it("inserts material rows below a selected OA summary row", () => {
  const { root, active } = rootWith(SHEET_NAMES.oaDocCompare);
  root.Application!.Selection = { Row: 2 };
  runCurrentSheetQuery(root);

  toggleMaterialRows(root);

  expect(active.rowInserts).toEqual([{ afterRow: 2, rowCount: 1 }]);
  expect(active.writes.some((write) => write.address === "A3:P3")).toBe(true);
  expect(active.writes.flatMap((write) => JSON.stringify(write.value))).toContain(expect.stringContaining("物料A"));
});

it("deletes continuous material rows when selected summary row is already expanded", () => {
  const { root, active } = rootWith(SHEET_NAMES.oaDocCompare);
  root.Application!.Selection = { Row: 2 };
  runCurrentSheetQuery(root);
  active.rangeValues.set("A3:A3", [["物料"]]);
  active.rangeValues.set("A4:A4", [["汇总"]]);

  toggleMaterialRows(root);

  expect(active.rowDeletes).toEqual([{ startRow: 3, rowCount: 1 }]);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npm test -- tests/macros/current-sheet-query.test.ts
```

Expected: FAIL because `toggleMaterialRows` is not exported.

- [ ] **Step 3: Add metadata resize helper**

In `src/wps-api/output-metadata.ts`, add:

```ts
function parseRangeRows(address: string): { startRow: number; endRow: number; prefix: string; suffix: string } | null {
  const match = address.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (!match) {
    return null;
  }
  return {
    prefix: `${match[1]}${match[2]}:${match[3]}`,
    suffix: "",
    startRow: Number(match[2]),
    endRow: Number(match[4])
  };
}

export function adjustOutputMetadataRows(sheet: WpsSheet, rowDelta: number): void {
  const metadata = readOutputMetadata(sheet);
  if (!metadata || rowDelta === 0) {
    return;
  }
  const parsed = parseRangeRows(metadata.rangeAddress);
  if (!parsed) {
    return;
  }
  const nextEndRow = Math.max(parsed.startRow, parsed.endRow + rowDelta);
  saveOutputMetadata(sheet, {
    kind: metadata.kind,
    rangeAddress: `${parsed.prefix}${nextEndRow}${parsed.suffix}`
  });
}
```

- [ ] **Step 4: Implement material toggle**

Append to `src/macros/current-sheet-query.ts`:

```ts
import { buildMaterialRowsForDocSummary } from "../core/doc-compare";
import { getSelectedRowNumber, deleteRows, insertRowsBelow } from "../wps-api/active-context";
import { adjustOutputMetadataRows } from "../wps-api/output-metadata";
import { normalizeText } from "../utils/text";

function readCellText(sheet: WpsSheet, row: number, col: string): string {
  const value = sheet.Range(`${col}${row}`).Value2 ?? sheet.Range(`${col}${row}`).Value;
  const matrix = Array.isArray(value) && Array.isArray(value[0]) ? value : [[value]];
  return normalizeText(matrix[0]?.[0]);
}

function countMaterialRowsBelow(sheet: WpsSheet, summaryRowNumber: number): number {
  let count = 0;
  for (let row = summaryRowNumber + 1; row < summaryRowNumber + 100000; row += 1) {
    const rowType = readCellText(sheet, row, "A");
    if (rowType === "物料") {
      count += 1;
      continue;
    }
    break;
  }
  return count;
}

export function toggleMaterialRows(root?: ScrapVarianceGlobal): void {
  const activeSheet = getActiveSheet(root);
  const kind = detectOutputSheetKind(activeSheet.Name);
  if (kind !== "oa_doc_compare" && kind !== "erp_doc_compare") {
    safeWriteCurrentSheetError(activeSheet, "当前工作表不支持展开物料。");
    return;
  }

  try {
    const selectedRow = getSelectedRowNumber(root);
    if (readCellText(activeSheet, selectedRow, "A") !== "汇总") {
      throw new Error("请选中行类型为 汇总 的单据行。");
    }

    const existingMaterialRows = countMaterialRowsBelow(activeSheet, selectedRow);
    if (existingMaterialRows > 0) {
      deleteRows(activeSheet, selectedRow + 1, existingMaterialRows);
      adjustOutputMetadataRows(activeSheet, -existingMaterialRows);
      return;
    }

    const filters = readRibbonFilters(root);
    const { oaRows, erpRows } = readSourceTables(root);
    const result = kind === "oa_doc_compare" ? buildOaDocCompare(oaRows, erpRows, filters) : buildErpDocCompare(oaRows, erpRows, filters);
    const selectedDocNumber = readCellText(activeSheet, selectedRow, "F");
    const summary = result.summaryRows.find((row) => row.primaryDocNumber === selectedDocNumber);
    if (!summary) {
      throw new Error(`找不到可展开的单据：${selectedDocNumber}`);
    }

    const materialRows = buildMaterialRowsForDocSummary(result, summary);
    if (materialRows.length === 0) {
      throw new Error(`当前单据没有可展开物料：${selectedDocNumber}`);
    }

    insertRowsBelow(activeSheet, selectedRow, materialRows.length);
    writeMatrixBulkOrChunks(activeSheet, selectedRow + 1, 1, docCompareRowsToValues(kind, materialRows).slice(1), WRITE_CHUNK_ROWS);
    adjustOutputMetadataRows(activeSheet, materialRows.length);
  } catch (error) {
    safeWriteCurrentSheetError(activeSheet, errorMessage(error));
  }
}
```

- [ ] **Step 5: Run material toggle tests**

Run:

```bash
npm test -- tests/macros/current-sheet-query.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/macros/current-sheet-query.ts src/wps-api/output-metadata.ts tests/macros/current-sheet-query.test.ts
git commit -m "feat: add material row toggle"
```

---

### Task 6: Ribbon XML, Handlers, and Main Wiring

**Files:**
- Modify: `ribbon.xml`
- Modify: `src/ribbon/handlers.ts`
- Modify: `src/main.ts`
- Modify: `src/types/wps.ts`
- Modify: `tests/ribbon/main-entry.test.ts`
- Modify: `tests/build/build-output.test.ts`

- [ ] **Step 1: Update failing ribbon tests first**

In `tests/ribbon/main-entry.test.ts`, update the dispatch test to include the new dependencies and callbacks:

```ts
  it("createRibbonHandlers dispatches known ribbon buttons and input callbacks", () => {
    const runPrecheck = vi.fn();
    const setupOutputSheets = vi.fn();
    const queryCurrentSheet = vi.fn();
    const toggleMaterialRows = vi.fn();
    const runDiagnostics = vi.fn();
    const reportError = vi.fn();
    const root: ScrapVarianceGlobal = {};
    const ribbon = createRibbonHandlers({
      root,
      runPrecheck,
      setupOutputSheets,
      queryCurrentSheet,
      toggleMaterialRows,
      runDiagnostics,
      reportError
    });

    ribbon.OnAction({ Id: "btnPrecheck" });
    ribbon.OnAction({ id: "btnSetupOutputSheets" });
    ribbon.OnAction({ ID: "btnQueryCurrentSheet" });
    ribbon.OnAction({ Id: "btnToggleMaterialRows" });
    ribbon.OnAction({ Id: "btnPerformanceDiagnostics" });
    ribbon.OnInputChange({ Id: "company" }, "数控");
    ribbon.OnDirectionChange({ Id: "queryDirection" }, "ERP源单查OA");

    expect(runPrecheck).toHaveBeenCalledOnce();
    expect(setupOutputSheets).toHaveBeenCalledOnce();
    expect(queryCurrentSheet).toHaveBeenCalledOnce();
    expect(toggleMaterialRows).toHaveBeenCalledOnce();
    expect(runDiagnostics).toHaveBeenCalledOnce();
    expect(root.ScrapVarianceRibbonState).toEqual(
      expect.objectContaining({ company: "数控", queryDirection: "ERP源单查OA" })
    );
    expect(reportError).not.toHaveBeenCalled();
  });
```

In `tests/build/build-output.test.ts`, update the XML expectations:

```ts
expect(xml).toContain('id="btnSetupOutputSheets"');
expect(xml).toContain('id="btnQueryCurrentSheet"');
expect(xml).toContain('id="btnToggleMaterialRows"');
expect(xml).toContain('id="company"');
expect(xml).toContain('id="queryDirection"');
```

- [ ] **Step 2: Run ribbon tests and verify they fail**

Run:

```bash
npm test -- tests/ribbon/main-entry.test.ts tests/build/build-output.test.ts
```

Expected: FAIL because the handler interface and ribbon XML have not been updated.

- [ ] **Step 3: Extend ribbon types**

In `src/types/wps.ts`, extend `RibbonControl` and `RibbonApi`:

```ts
export interface RibbonControl {
  Id?: string;
  id?: string;
  ID?: string;
}

export interface RibbonApi {
  OnAddinLoad(ribbonUi: unknown): void;
  OnAction(control: RibbonControl): void;
  OnInputChange(control: RibbonControl, text: string): void;
  OnDirectionChange(control: RibbonControl, selectedIdOrIndex: string | number): void;
  GetDirectionCount(control: RibbonControl): number;
  GetDirectionLabel(control: RibbonControl, index: number): string;
  GetDirectionSelectedIndex(control: RibbonControl): number;
}
```

- [ ] **Step 4: Update ribbon handlers**

Replace `src/ribbon/handlers.ts` with:

```ts
import { QUERY_DIRECTIONS } from "../core/query-direction";
import { getRibbonState, updateRibbonState } from "./state";
import type { RibbonApi, RibbonControl, ScrapVarianceGlobal } from "../types/wps";

export interface RibbonDependencies {
  runPrecheck(): void;
  setupOutputSheets(): void;
  queryCurrentSheet(): void;
  toggleMaterialRows(): void;
  runDiagnostics(): void;
  reportError(error: unknown): void;
  root?: ScrapVarianceGlobal;
}

const DIRECTION_LABELS = [QUERY_DIRECTIONS.oaKingdeeToErp, QUERY_DIRECTIONS.erpSourceToOa] as const;

export function getControlId(control: RibbonControl): string {
  return control.Id ?? control.id ?? control.ID ?? "";
}

export function createRibbonHandlers(dependencies: RibbonDependencies): RibbonApi {
  const root = dependencies.root ?? (globalThis as ScrapVarianceGlobal);
  return {
    OnAddinLoad(ribbonUi: unknown): void {
      root.ScrapVarianceRibbonUi = ribbonUi;
    },
    OnAction(control: RibbonControl): void {
      try {
        const controlId = getControlId(control);
        switch (controlId) {
          case "btnPrecheck":
            dependencies.runPrecheck();
            return;
          case "btnSetupOutputSheets":
            dependencies.setupOutputSheets();
            return;
          case "btnQueryCurrentSheet":
            dependencies.queryCurrentSheet();
            return;
          case "btnToggleMaterialRows":
            dependencies.toggleMaterialRows();
            return;
          case "btnPerformanceDiagnostics":
            dependencies.runDiagnostics();
            return;
          default:
            throw new Error(`未知功能区按钮：${controlId}`);
        }
      } catch (error) {
        dependencies.reportError(error);
      }
    },
    OnInputChange(control: RibbonControl, text: string): void {
      try {
        updateRibbonState(root, getControlId(control), text);
      } catch (error) {
        dependencies.reportError(error);
      }
    },
    OnDirectionChange(control: RibbonControl, selectedIdOrIndex: string | number): void {
      try {
        const index = typeof selectedIdOrIndex === "number" ? selectedIdOrIndex : Number(selectedIdOrIndex);
        updateRibbonState(root, getControlId(control), DIRECTION_LABELS[index] ?? selectedIdOrIndex);
      } catch (error) {
        dependencies.reportError(error);
      }
    },
    GetDirectionCount(): number {
      return DIRECTION_LABELS.length;
    },
    GetDirectionLabel(_control: RibbonControl, index: number): string {
      return DIRECTION_LABELS[index] ?? "";
    },
    GetDirectionSelectedIndex(): number {
      const current = getRibbonState(root).queryDirection;
      return Math.max(0, DIRECTION_LABELS.findIndex((label) => label === current));
    }
  };
}
```

- [ ] **Step 5: Update main wiring**

In `src/main.ts`, replace imports and dependencies:

```ts
import { runCurrentSheetQuery, toggleMaterialRows } from "./macros/current-sheet-query";
import { setupOutputSheets } from "./macros/output-sheets";
```

Replace the ribbon dependencies:

```ts
root.ribbon = createRibbonHandlers({
  root,
  runPrecheck: () => runScrapVariancePrecheck(root),
  setupOutputSheets: () => setupOutputSheets(root),
  queryCurrentSheet: () => runCurrentSheetQuery(root),
  toggleMaterialRows: () => toggleMaterialRows(root),
  runDiagnostics: () => runPerformanceDiagnostics(root),
  reportError: reportRuntimeError
});
```

- [ ] **Step 6: Update ribbon XML**

Replace `ribbon.xml` group content with:

```xml
<group id="grpScrapVariance" label="报废差异工具">
  <editBox id="company" label="公司简称" onChange="ribbon.OnInputChange" />
  <editBox id="dept1" label="一级部门" onChange="ribbon.OnInputChange" />
  <editBox id="dept2" label="二级部门" onChange="ribbon.OnInputChange" />
  <editBox id="startDate" label="开始日期" onChange="ribbon.OnInputChange" />
  <editBox id="endDate" label="结束日期" onChange="ribbon.OnInputChange" />
  <dropDown id="queryDirection" label="查询方向" getItemCount="ribbon.GetDirectionCount" getItemLabel="ribbon.GetDirectionLabel" getSelectedItemIndex="ribbon.GetDirectionSelectedIndex" onAction="ribbon.OnDirectionChange" />
  <button id="btnPrecheck" label="预验证数据" size="large" onAction="ribbon.OnAction" />
  <button id="btnSetupOutputSheets" label="初始化输出表" size="large" onAction="ribbon.OnAction" />
  <button id="btnQueryCurrentSheet" label="查询当前页" size="large" onAction="ribbon.OnAction" />
  <button id="btnToggleMaterialRows" label="展开物料" size="large" onAction="ribbon.OnAction" />
  <button id="btnPerformanceDiagnostics" label="性能诊断" size="large" onAction="ribbon.OnAction" />
</group>
```

- [ ] **Step 7: Run focused ribbon/build tests**

Run:

```bash
npm test -- tests/ribbon/main-entry.test.ts tests/build/build-output.test.ts
npm run typecheck
```

Expected: build-output may fail until `main.js` is regenerated; typecheck and ribbon behavior should pass. If `build-output.test.ts` fails only because `main.js` is stale, defer fixing it to Task 8.

- [ ] **Step 8: Commit source/XML changes**

```bash
git add ribbon.xml src/types/wps.ts src/ribbon/handlers.ts src/main.ts tests/ribbon/main-entry.test.ts tests/build/build-output.test.ts
git commit -m "feat: wire current sheet ribbon controls"
```

---

### Task 7: Documentation and Existing Test Alignment

**Files:**
- Modify: `docs/wps-js-usage.md`
- Modify: `tests/macros/macro-flow.test.ts`
- Modify: `tests/wps-api/write-results.test.ts`
- Modify: `tests/perf/*` only if sheet names or setup assumptions break existing diagnostics tests

- [ ] **Step 1: Update docs with the new workflow**

In `docs/wps-js-usage.md`, replace the old `查询面板` workflow section with:

```md
## 查询

查询输入放在功能区控件中：

- 公司简称
- 一级部门
- 二级部门
- 开始日期
- 结束日期
- 查询方向

点击 `初始化输出表` 会创建或刷新三张输出表：

- `报废差异明细`
- `OA视角单据对比`
- `ERP视角单据对比`

点击 `查询当前页` 只刷新当前激活的输出表，其他输出表不联动。

`报废差异明细` 读取 `查询方向`，支持 `OA金蝶单号查ERP` 和 `ERP源单查OA`。

`OA视角单据对比` 固定按 OA 表筛选和聚合：

- 日期条件解释为 `OA.申请日期`
- 公司条件解释为 `OA.公司简称`
- ERP 数量和金额按 `ERP.单据编号 = OA.金蝶云单据编号` 汇总

`ERP视角单据对比` 固定按 ERP 表筛选和聚合：

- 日期条件解释为 `ERP.日期`
- 公司条件解释为 `ERP.区分公司简称`
- OA 数量和金额按 `OA.表单编号 = ERP.源单单号` 汇总

在 `OA视角单据对比` 或 `ERP视角单据对比` 中选中 `行类型=汇总` 的单据行，再点击 `展开物料`，会在该行下面插入该单据的物料行；再次点击同一汇总行会收起物料行。
```

Add precise cleanup notes:

```md
查询结果不再固定清理到 `200000` 行。工具会在隐藏元数据中记录每张输出表上次写入范围，下次只清理当前表上次由工具生成的区域。
```

- [ ] **Step 2: Run existing tests and update assertions**

Run:

```bash
npm test -- --run
```

Expected: FAIL only where tests still assert old `查询面板` output, old button ids, or fixed query cleanup range. Update those assertions to the new output sheets and metadata cleanup behavior.

- [ ] **Step 3: Run aligned test suite**

Run:

```bash
npm test -- --run
npm run typecheck
```

Expected: PASS except `tests/build/build-output.test.ts` if it compares stale `main.js`.

- [ ] **Step 4: Commit docs and test alignment**

```bash
git add docs/wps-js-usage.md tests/macros/macro-flow.test.ts tests/wps-api/write-results.test.ts tests/perf tests/build/build-output.test.ts
git commit -m "docs: document current sheet query workflow"
```

---

### Task 8: Bundle Sync and Final Verification

**Files:**
- Modify: `main.js`

- [ ] **Step 1: Regenerate the committed bundle**

Run:

```bash
npm run build
```

Expected: PASS. This runs `tsc --noEmit` and then esbuild, refreshing `main.js`.

- [ ] **Step 2: Run full tests**

Run:

```bash
npm test -- --run
```

Expected: PASS, including `tests/build/build-output.test.ts`.

- [ ] **Step 3: Run whitespace and bundle scans**

Run:

```bash
git diff --check
rg -n "document\\.write|src/macros|ribbon\\.js|require\\(|process\\.|child_process|fs\\b|path\\b" main.js
```

Expected:

- `git diff --check` exits 0.
- `rg ... main.js` returns no matches.

- [ ] **Step 4: Commit generated bundle**

```bash
git add main.js
git commit -m "build: refresh bundle for current sheet query"
```

- [ ] **Step 5: Final status check**

Run:

```bash
git status --short
git log --oneline -5
```

Expected:

- Only intentionally ignored/local files remain untracked, such as `.superpowers/`.
- Recent commits include the implementation tasks and `build: refresh bundle for current sheet query`.
