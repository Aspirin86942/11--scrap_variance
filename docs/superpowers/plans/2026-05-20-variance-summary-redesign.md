# Variance Summary Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old `报废差异明细` output page with a direction-aware `报废差异汇总` page while keeping the two document compare pages as the only drill-down surfaces.

**Architecture:** The output sheet contract changes from `legacy_detail` to `variance_summary`, with legacy sheet names and legacy metadata accepted only for migration and first-run cleanup. A new pure core module builds department-level summary rows from the existing OA/ERP document compare logic, then the current-sheet query macro writes that matrix for the summary page and keeps document compare behavior unchanged. The query dialog keeps date filters everywhere, leaves direction editable only on the summary page, and locks direction by active compare sheet for the two fixed perspective pages.

**Tech Stack:** TypeScript, WPS JS workbook APIs, static browser JavaScript for the dialog, esbuild, Vitest, npm.

---

## Scope Check

This plan implements one feature family from `docs/superpowers/specs/2026-05-20-variance-summary-redesign-design.md`: redesigning the legacy detail output page into a department summary page. It touches output sheet naming, metadata migration, pure summary logic, current-sheet query wiring, dialog direction locking, tests, and the committed bundle. It does not change OA/ERP source table contracts, precheck rules, benchmark tooling, release packaging, or WPS installation metadata.

## Workspace Guard

Current known workspace state before this plan was written:

- `docs/superpowers/plans/2026-05-20-variance-summary-redesign.md` is the plan file.
- `AGENTS.md` is untracked and must not be staged unless the user explicitly asks.

Implementation workers must:

- Run `git status --short` before editing.
- Not revert or overwrite unrelated user changes.
- Stage only the files changed for the task being committed.
- Keep generated `main.js` synchronized after TypeScript or static dialog changes.
- Use `npm`, because this repository has `package-lock.json`.

## File Structure

- Modify `src/constants.ts`
  - Add `SHEET_NAMES.varianceSummary`, `SHEET_NAMES.legacyDetailOutput`, and `DEPARTMENT_VARIANCE_SUMMARY_HEADERS`.
  - Keep old `SUMMARY_HEADERS` and `DETAIL_HEADERS` for existing core tests and transitional helpers.
- Modify `src/types/scrap.ts`
  - Replace `legacy_detail` with `variance_summary` in active output sheet kinds.
  - Add a metadata-only legacy kind so old `CB1:CC1` records can be read safely.
- Modify `src/core/output-sheets.ts`
  - Detect `报废差异汇总` as `variance_summary`.
  - Do not treat `报废差异明细` as an active output sheet after migration.
  - Update unsupported-sheet guidance.
- Modify `src/wps-api/output-metadata.ts`
  - Read both active and legacy metadata kinds.
  - Allow `variance_summary` cleanup to accept old `legacy_detail` metadata only when explicitly requested.
- Modify `src/macros/output-sheets.ts`
  - Migrate old `报废差异明细` and old `查询面板` to `报废差异汇总`.
  - Ensure the three output sheets exist in summary, OA compare, ERP compare order.
- Create `src/core/department-variance-summary.ts`
  - Build direction-aware department summary rows and output values.
  - Reuse existing `buildOaDocCompare()` and `buildErpDocCompare()` logic to avoid duplicating WPS/source parsing rules.
- Modify `src/macros/current-sheet-query.ts`
  - Replace old legacy detail output wiring with department summary output.
  - Preserve document compare output and material expand behavior for the two compare sheets.
  - Reject material expansion on `报废差异汇总`.
- Modify `src/query-dialog/open-query-dialog.ts`
  - Carry `variance_summary` as the editable output kind in dialog URLs and initial state.
- Modify `ui/query-dialog.js`
  - Make direction editable only for `variance_summary`.
  - Lock `oa_doc_compare` to `OA金蝶单号查ERP` and `erp_doc_compare` to `ERP源单查OA`.
- Modify tests under `tests/core/`, `tests/wps-api/`, `tests/macros/`, `tests/query-dialog/`, and `tests/build/`.
- Modify generated `main.js` by running `npm run build`.

---

### Task 1: Rename Active Output Kind and Add Legacy Metadata Compatibility

**Files:**
- Modify: `src/constants.ts`
- Modify: `src/types/scrap.ts`
- Modify: `src/core/output-sheets.ts`
- Modify: `src/wps-api/output-metadata.ts`
- Test: `tests/core/output-sheets.test.ts`
- Test: `tests/wps-api/output-metadata.test.ts`

- [ ] **Step 1: Check current dirty state**

Run:

```bash
git status --short
git diff -- src/constants.ts src/types/scrap.ts src/core/output-sheets.ts src/wps-api/output-metadata.ts tests/core/output-sheets.test.ts tests/wps-api/output-metadata.test.ts
```

Expected: `AGENTS.md` may be untracked. The listed target files should either be clean or contain user changes that must be preserved.

- [ ] **Step 2: Write failing output sheet detection tests**

Replace the first and third tests in `tests/core/output-sheets.test.ts` with:

```ts
  it("detects the three supported output sheets", () => {
    expect(detectOutputSheetKind(SHEET_NAMES.varianceSummary)).toBe(OUTPUT_SHEET_KINDS.varianceSummary);
    expect(detectOutputSheetKind(SHEET_NAMES.oaDocCompare)).toBe(OUTPUT_SHEET_KINDS.oaDocCompare);
    expect(detectOutputSheetKind(SHEET_NAMES.erpDocCompare)).toBe(OUTPUT_SHEET_KINDS.erpDocCompare);
  });

  it("returns the exact unsupported-sheet guidance", () => {
    expect(unsupportedOutputSheetMessage()).toBe(
      "当前工作表不支持查询或展开，请切换到 报废差异汇总、OA视角单据对比 或 ERP视角单据对比。"
    );
  });
```

Add this assertion to the unsupported sheet test:

```ts
    expect(detectOutputSheetKind(SHEET_NAMES.legacyDetailOutput)).toBeNull();
```

- [ ] **Step 3: Write failing metadata compatibility tests**

Add these tests to `tests/wps-api/output-metadata.test.ts`:

```ts
  it("stores and reads variance summary metadata", () => {
    const sheet = createFakeSheet("报废差异汇总");

    saveOutputMetadata(sheet, { kind: "variance_summary", rangeAddress: "A1:O3" });

    expect(readOutputMetadata(sheet)).toEqual({ kind: "variance_summary", rangeAddress: "A1:O3" });
  });

  it("allows variance summary cleanup to consume legacy detail metadata once", () => {
    const sheet = createFakeSheet("报废差异汇总");
    sheet.rangeValues.set("CB1:CC1", [["legacy_detail", "A1:S6"]]);

    clearPreviousToolOutput(sheet, "variance_summary", ["legacy_detail"]);

    expect(sheet.clears).toEqual(["A1:S6"]);
  });

  it("does not clear legacy detail metadata unless the caller explicitly accepts it", () => {
    const sheet = createFakeSheet("报废差异汇总");
    sheet.rangeValues.set("CB1:CC1", [["legacy_detail", "A1:S6"]]);

    clearPreviousToolOutput(sheet, "variance_summary");

    expect(sheet.clears).toEqual([]);
  });
```

Do not delete or weaken the existing `oa_doc_compare` metadata tests. They must still assert that ordinary compare-sheet metadata stores, reads, clears by exact kind, ignores missing metadata, ignores another active output kind, rejects unsafe ranges, and adjusts recorded row counts.

- [ ] **Step 4: Run focused tests and verify they fail**

Run:

```bash
npm test -- tests/core/output-sheets.test.ts tests/wps-api/output-metadata.test.ts --reporter=dot
```

Expected: FAIL because `SHEET_NAMES.varianceSummary`, `SHEET_NAMES.legacyDetailOutput`, `variance_summary`, and legacy-compatible cleanup are not implemented yet.

- [ ] **Step 5: Update constants and output kind types**

In `src/constants.ts`, replace the output sheet name entries at the top with:

```ts
export const SHEET_NAMES = {
  oa: "查询OA-存货报废申请单",
  erp: "查询ERP-报废明细表",
  panel: "查询面板",
  varianceSummary: "报废差异汇总",
  legacyDetailOutput: "报废差异明细",
  oaDocCompare: "OA视角单据对比",
  erpDocCompare: "ERP视角单据对比",
  precheckResult: "预验证结果",
  performanceDiagnostics: "性能诊断结果"
} as const;
```

After `SUMMARY_HEADERS`, add the new summary page header contract:

```ts
// department variance summary 是新总览页的可见字段契约，顺序必须用测试锁定。
export const DEPARTMENT_VARIANCE_SUMMARY_HEADERS = [
  "公司简称",
  "一级部门",
  "二级部门",
  "查询视角",
  "主视角单据数",
  "已匹配单据数",
  "未匹配单据数",
  "有差异单据数",
  "OA数量合计",
  "ERP实发数量合计",
  "数量差额",
  "OA实际预算金额mx合计",
  "ERP总成本合计",
  "金额差额",
  "差异类型摘要"
] as const;
```

In `src/types/scrap.ts`, replace the output sheet kind type with:

```ts
export type OutputSheetKind = "variance_summary" | "oa_doc_compare" | "erp_doc_compare";
export type LegacyOutputSheetKind = "legacy_detail";
export type OutputMetadataKind = OutputSheetKind | LegacyOutputSheetKind;
```

- [ ] **Step 6: Update output sheet detection**

Replace `src/core/output-sheets.ts` with this structure:

```ts
import { SHEET_NAMES } from "../constants";
import type { LegacyOutputSheetKind, OutputSheetKind } from "../types/scrap";

export const OUTPUT_SHEET_KINDS = {
  varianceSummary: "variance_summary",
  oaDocCompare: "oa_doc_compare",
  erpDocCompare: "erp_doc_compare"
} as const satisfies Record<string, OutputSheetKind>;

export const LEGACY_OUTPUT_SHEET_KINDS = {
  legacyDetail: "legacy_detail"
} as const satisfies Record<string, LegacyOutputSheetKind>;

export function detectOutputSheetKind(sheetName: string): OutputSheetKind | null {
  // 查询弹窗和展开物料都只允许在工具生成的三张输出页上运行，避免误清用户源数据表。
  switch (sheetName) {
    case SHEET_NAMES.varianceSummary:
      return OUTPUT_SHEET_KINDS.varianceSummary;
    case SHEET_NAMES.oaDocCompare:
      return OUTPUT_SHEET_KINDS.oaDocCompare;
    case SHEET_NAMES.erpDocCompare:
      return OUTPUT_SHEET_KINDS.erpDocCompare;
    default:
      return null;
  }
}

export function unsupportedOutputSheetMessage(): string {
  return `当前工作表不支持查询或展开，请切换到 ${SHEET_NAMES.varianceSummary}、${SHEET_NAMES.oaDocCompare} 或 ${SHEET_NAMES.erpDocCompare}。`;
}
```

- [ ] **Step 7: Update metadata kind handling**

In `src/wps-api/output-metadata.ts`, update imports and kind validation:

```ts
import type { OutputMetadataKind, OutputSheetKind, RibbonQueryState } from "../types/scrap";
```

Replace `VALID_OUTPUT_KINDS` with:

```ts
const VALID_METADATA_KINDS = new Set<OutputMetadataKind>([
  "variance_summary",
  "legacy_detail",
  "oa_doc_compare",
  "erp_doc_compare"
]);
```

Change `OutputMetadata` and kind guard to:

```ts
export interface OutputMetadata {
  kind: OutputMetadataKind;
  rangeAddress: string;
}

function isOutputMetadataKind(value: string): value is OutputMetadataKind {
  return VALID_METADATA_KINDS.has(value as OutputMetadataKind);
}
```

Change `readOutputMetadata()` validation to call `isOutputMetadataKind(kind)`.

Replace `clearPreviousToolOutput()` with:

```ts
export function clearPreviousToolOutput(
  sheet: WpsSheet,
  expectedKind: OutputSheetKind,
  compatibleLegacyKinds: OutputMetadataKind[] = []
): void {
  const metadata = readOutputMetadata(sheet);
  if (!metadata || (metadata.kind !== expectedKind && !compatibleLegacyKinds.includes(metadata.kind))) {
    return;
  }

  // 只清理上次由本工具记录的输出范围，避免误删用户在同一工作表上的其他内容。
  clearRange(sheet, metadata.rangeAddress);
}
```

- [ ] **Step 8: Run focused tests and verify they pass**

Run:

```bash
npm test -- tests/core/output-sheets.test.ts tests/wps-api/output-metadata.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

Run:

```bash
git add src/constants.ts src/types/scrap.ts src/core/output-sheets.ts src/wps-api/output-metadata.ts tests/core/output-sheets.test.ts tests/wps-api/output-metadata.test.ts
git commit -m "feat: define variance summary output kind"
```

Expected: commit succeeds and does not include `AGENTS.md`.

---

### Task 2: Migrate Output Sheet Setup to `报废差异汇总`

**Files:**
- Modify: `src/macros/output-sheets.ts`
- Modify: `src/macros/setup-query-panel.ts` only if imports or comments require alignment
- Test: `tests/macros/current-sheet-query.test.ts`
- Test: `tests/macros/macro-flow.test.ts`

- [ ] **Step 1: Write failing setup migration tests**

In `tests/macros/current-sheet-query.test.ts`, update the setup tests to expect `SHEET_NAMES.varianceSummary`. Replace the first setup test with:

```ts
  it("setupOutputSheets creates exactly three output sheets in order for an empty workbook", () => {
    const root = makeRoot([]);

    setupOutputSheets(root);

    expect(sheetNames(root)).toEqual([
      SHEET_NAMES.varianceSummary,
      SHEET_NAMES.oaDocCompare,
      SHEET_NAMES.erpDocCompare
    ]);
  });
```

Replace the old query panel migration test with:

```ts
  it("setupOutputSheets renames the old query panel to variance summary when summary is missing", () => {
    const oldPanel = createFakeSheet(SHEET_NAMES.panel);
    const root = makeRoot([oldPanel]);

    const summarySheet = setupOutputSheets(root);

    expect(summarySheet).toBe(oldPanel);
    expect(oldPanel.Name).toBe(SHEET_NAMES.varianceSummary);
    expect(sheetNames(root)).toEqual([
      SHEET_NAMES.varianceSummary,
      SHEET_NAMES.oaDocCompare,
      SHEET_NAMES.erpDocCompare
    ]);
  });
```

Add this test after it:

```ts
  it("setupOutputSheets renames the old detail output to variance summary when summary is missing", () => {
    const oldDetail = createFakeSheet(SHEET_NAMES.legacyDetailOutput);
    oldDetail.rangeValues.set("CB2:CG2", [
      ["数控", "生产", "仓储", "2026-05-01", "2026-05-31", QUERY_DIRECTIONS.erpSourceToOa]
    ]);
    const root = makeRoot([oldDetail]);

    const summarySheet = setupOutputSheets(root);

    expect(summarySheet).toBe(oldDetail);
    expect(oldDetail.Name).toBe(SHEET_NAMES.varianceSummary);
    expect(oldDetail.Range("CB2:CG2").Value2).toEqual([
      ["数控", "生产", "仓储", "2026-05-01", "2026-05-31", QUERY_DIRECTIONS.erpSourceToOa]
    ]);
    expect(sheetNames(root)).toEqual([
      SHEET_NAMES.varianceSummary,
      SHEET_NAMES.oaDocCompare,
      SHEET_NAMES.erpDocCompare
    ]);
  });
```

In `tests/macros/macro-flow.test.ts`, update the setup test names and expectations so `setupQueryPanel(root)` returns `SHEET_NAMES.varianceSummary`, not `SHEET_NAMES.detailOutput`.

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
npm test -- tests/macros/current-sheet-query.test.ts tests/macros/macro-flow.test.ts --reporter=dot
```

Expected: FAIL because setup still creates and returns `报废差异明细`.

- [ ] **Step 3: Implement output sheet migration**

Replace `src/macros/output-sheets.ts` with:

```ts
import { SHEET_NAMES } from "../constants";
import type { ScrapVarianceGlobal, WpsSheet } from "../types/wps";
import { ensureSheet, findSheetByName } from "../wps-api/workbook";

export function setupOutputSheets(root?: ScrapVarianceGlobal): WpsSheet {
  let summarySheet = findSheetByName(SHEET_NAMES.varianceSummary, root);

  if (!summarySheet) {
    const oldDetail = findSheetByName(SHEET_NAMES.legacyDetailOutput, root);
    const oldPanel = findSheetByName(SHEET_NAMES.panel, root);
    const migrationSource = oldDetail ?? oldPanel;

    if (migrationSource) {
      // 旧工作簿可能仍有“报废差异明细”或更早的“查询面板”，直接改名成新版汇总页。
      migrationSource.Name = SHEET_NAMES.varianceSummary;
      summarySheet = migrationSource;
    } else {
      summarySheet = ensureSheet(SHEET_NAMES.varianceSummary, root);
    }
  }

  // 三张输出页都确保存在，但查询时仍只刷新当前活动的那一张。
  ensureSheet(SHEET_NAMES.oaDocCompare, root);
  ensureSheet(SHEET_NAMES.erpDocCompare, root);

  return summarySheet;
}
```

- [ ] **Step 4: Replace active code/test references to `SHEET_NAMES.detailOutput`**

Run:

```bash
rg -n "SHEET_NAMES\\.detailOutput|detail output|active detail|legacy detail output" src tests
```

Expected before edits: multiple matches.

Replace active output sheet references with `SHEET_NAMES.varianceSummary`. Keep old-name migration references as `SHEET_NAMES.legacyDetailOutput`. Comments should say summary, not detail, when referring to the active page.

Run again:

```bash
rg -n "SHEET_NAMES\\.detailOutput" src tests
```

Expected after edits: no matches.

- [ ] **Step 5: Run focused tests and verify setup passes or fails only on query behavior not yet migrated**

Run:

```bash
npm test -- tests/macros/current-sheet-query.test.ts tests/macros/macro-flow.test.ts --reporter=dot
```

Expected: setup-related assertions PASS. Query-output assertions may still FAIL because Task 3 and Task 4 have not added the new summary behavior.

- [ ] **Step 6: Commit Task 2**

If the focused suite has query failures from not-yet-implemented summary behavior, commit only after confirming setup tests pass and failures are expected for later tasks:

```bash
git add src/macros/output-sheets.ts src/macros/setup-query-panel.ts tests/macros/current-sheet-query.test.ts tests/macros/macro-flow.test.ts
git commit -m "feat: migrate output sheet to variance summary"
```

Expected: commit contains setup migration and test expectation updates only.

---

### Task 3: Add Department Variance Summary Core Logic

**Files:**
- Create: `src/core/department-variance-summary.ts`
- Test: `tests/core/department-variance-summary.test.ts`

- [ ] **Step 1: Create failing core tests**

Create `tests/core/department-variance-summary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEPARTMENT_VARIANCE_SUMMARY_HEADERS } from "../../src/constants";
import { QUERY_DIRECTIONS } from "../../src/core/query-direction";
import {
  buildDepartmentVarianceSummaryRows,
  departmentVarianceSummaryRowsToValues
} from "../../src/core/department-variance-summary";

describe("department variance summary", () => {
  it("builds OA perspective department summary rows with document counts and ordered difference summary", () => {
    const rows = buildDepartmentVarianceSummaryRows(
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
          数量: 10,
          实际预算金额mx: 100
        },
        {
          表单编号: "OA-002",
          金蝶云单据编号: "ERP-MISSING",
          申请日期: "2026/5/3",
          公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料代码: "MAT-B",
          物料名称: "物料B",
          数量: 2,
          实际预算金额mx: 20
        }
      ],
      [
        {
          单据编号: "ERP-001",
          日期: "2026/5/2",
          源单单号: "OA-001",
          区分公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料编码: "MAT-A",
          物料名称: "物料A",
          实发数量: 8,
          总成本: 80
        }
      ],
      {
        company: "数控",
        dept1: "生产",
        dept2: "仓储",
        startDate: "2026/5/1",
        endDate: "2026/5/31"
      },
      QUERY_DIRECTIONS.oaKingdeeToErp
    );

    expect(rows).toEqual([
      {
        company: "数控",
        dept1: "生产",
        dept2: "仓储",
        perspective: "OA视角",
        primaryDocCount: 2,
        matchedDocCount: 1,
        unmatchedDocCount: 1,
        differentDocCount: 1,
        oaQuantity: 12,
        erpQuantity: 8,
        quantityDiff: 4,
        oaAmount: 120,
        erpCost: 80,
        amountDiff: 40,
        differenceSummary: "OA有申请，ERP无出库、OA和ERP都有，但数量不同"
      }
    ]);
    expect(departmentVarianceSummaryRowsToValues(rows)).toEqual([
      [...DEPARTMENT_VARIANCE_SUMMARY_HEADERS],
      [
        "数控",
        "生产",
        "仓储",
        "OA视角",
        2,
        1,
        1,
        1,
        12,
        8,
        4,
        120,
        80,
        40,
        "OA有申请，ERP无出库、OA和ERP都有，但数量不同"
      ]
    ]);
  });

  it("builds ERP perspective department summary rows with ERP document counts and OA-minus-ERP deltas", () => {
    const rows = buildDepartmentVarianceSummaryRows(
      [
        {
          表单编号: "OA-001",
          金蝶云单据编号: "ERP-001",
          申请日期: "2026/4/1",
          公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料代码: "MAT-A",
          物料名称: "物料A",
          数量: 10,
          实际预算金额mx: 100
        }
      ],
      [
        {
          单据编号: "ERP-001",
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
          单据编号: "ERP-999",
          日期: "2026/5/3",
          源单单号: "OA-MISSING",
          区分公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料编码: "MAT-B",
          物料名称: "物料B",
          实发数量: 3,
          总成本: 30
        }
      ],
      {
        company: "数控",
        dept1: "生产",
        dept2: "仓储",
        startDate: "2026/5/1",
        endDate: "2026/5/31"
      },
      QUERY_DIRECTIONS.erpSourceToOa
    );

    expect(rows).toEqual([
      {
        company: "数控",
        dept1: "生产",
        dept2: "仓储",
        perspective: "ERP视角",
        primaryDocCount: 2,
        matchedDocCount: 1,
        unmatchedDocCount: 1,
        differentDocCount: 1,
        oaQuantity: 10,
        erpQuantity: 11,
        quantityDiff: -1,
        oaAmount: 100,
        erpCost: 110,
        amountDiff: -10,
        differenceSummary: "ERP出库对应OA未在当前OA数据中找到、OA和ERP都有，但数量不同"
      }
    ]);
  });

  it("returns only headers when converting empty rows to values", () => {
    expect(departmentVarianceSummaryRowsToValues([])).toEqual([[...DEPARTMENT_VARIANCE_SUMMARY_HEADERS]]);
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
npm test -- tests/core/department-variance-summary.test.ts --reporter=dot
```

Expected: FAIL because `src/core/department-variance-summary.ts` does not exist yet.

- [ ] **Step 3: Implement the core module**

Create `src/core/department-variance-summary.ts`:

```ts
import type Decimal from "decimal.js-light";
import { DEPARTMENT_VARIANCE_SUMMARY_HEADERS, DIFFERENCE_TYPE_PRIORITY } from "../constants";
import type { DocCompareRow, OutputMatrix, QueryFilters, RawRow } from "../types/scrap";
import { addDecimal, decimalToNumber2, parseDecimal, subtractDecimal, zeroDecimal } from "../utils/decimal";
import { normalizeText } from "../utils/text";
import { buildErpDocCompare, buildMaterialRowsForDocSummary, buildOaDocCompare } from "./doc-compare";
import { QUERY_DIRECTIONS, parseQueryDirection, type QueryDirection } from "./query-direction";

type SummaryPerspective = "oa" | "erp";
type PerspectiveLabel = "OA视角" | "ERP视角";

export interface DepartmentVarianceSummaryRow {
  company: string;
  dept1: string;
  dept2: string;
  perspective: PerspectiveLabel;
  primaryDocCount: number;
  matchedDocCount: number;
  unmatchedDocCount: number;
  differentDocCount: number;
  oaQuantity: number;
  erpQuantity: number;
  quantityDiff: number;
  oaAmount: number;
  erpCost: number;
  amountDiff: number;
  differenceSummary: string;
}

interface DepartmentVarianceSummaryAccumulator {
  company: string;
  dept1: string;
  dept2: string;
  perspective: PerspectiveLabel;
  primaryDocCount: number;
  matchedDocCount: number;
  unmatchedDocCount: number;
  differentDocCount: number;
  oaQuantity: Decimal;
  erpQuantity: Decimal;
  oaAmount: Decimal;
  erpCost: Decimal;
  differenceTypes: Set<string>;
}

function perspectiveFromDirection(queryDirectionInput: unknown): SummaryPerspective {
  return parseQueryDirection(queryDirectionInput) === QUERY_DIRECTIONS.erpSourceToOa ? "erp" : "oa";
}

function perspectiveLabel(perspective: SummaryPerspective): PerspectiveLabel {
  return perspective === "erp" ? "ERP视角" : "OA视角";
}

function makeDepartmentKey(row: Pick<DocCompareRow, "company" | "dept1" | "dept2">, perspective: SummaryPerspective): string {
  return JSON.stringify([
    normalizeText(row.company),
    normalizeText(row.dept1),
    normalizeText(row.dept2),
    perspective
  ]);
}

function createAccumulator(
  row: Pick<DocCompareRow, "company" | "dept1" | "dept2">,
  perspective: SummaryPerspective
): DepartmentVarianceSummaryAccumulator {
  return {
    company: normalizeText(row.company),
    dept1: normalizeText(row.dept1),
    dept2: normalizeText(row.dept2),
    perspective: perspectiveLabel(perspective),
    primaryDocCount: 0,
    matchedDocCount: 0,
    unmatchedDocCount: 0,
    differentDocCount: 0,
    oaQuantity: zeroDecimal(),
    erpQuantity: zeroDecimal(),
    oaAmount: zeroDecimal(),
    erpCost: zeroDecimal(),
    differenceTypes: new Set<string>()
  };
}

function getOrCreateAccumulator(
  groups: Map<string, DepartmentVarianceSummaryAccumulator>,
  row: Pick<DocCompareRow, "company" | "dept1" | "dept2">,
  perspective: SummaryPerspective
): DepartmentVarianceSummaryAccumulator {
  const key = makeDepartmentKey(row, perspective);
  let group = groups.get(key);
  if (!group) {
    group = createAccumulator(row, perspective);
    groups.set(key, group);
  }
  return group;
}

function hasMaterialShapeMismatch(materialRows: DocCompareRow[]): boolean {
  return materialRows.some((row) => row.primaryQuantity === 0 || row.counterpartQuantity === 0);
}

function classifyMatchedDifference(summaryRow: DocCompareRow, materialRows: DocCompareRow[]): string {
  if (hasMaterialShapeMismatch(materialRows)) {
    return "OA和ERP都有，但物料明细不一致";
  }
  if (summaryRow.quantityDiff !== 0) {
    return "OA和ERP都有，但数量不同";
  }
  return "OA和ERP都有，数量一致";
}

function addPerspectiveTotals(
  group: DepartmentVarianceSummaryAccumulator,
  row: DocCompareRow,
  perspective: SummaryPerspective
): void {
  const oaQuantity = perspective === "oa" ? row.primaryQuantity : row.counterpartQuantity;
  const erpQuantity = perspective === "oa" ? row.counterpartQuantity : row.primaryQuantity;
  const oaAmount = perspective === "oa" ? row.primaryAmount : row.counterpartAmount;
  const erpCost = perspective === "oa" ? row.counterpartAmount : row.primaryAmount;

  group.oaQuantity = addDecimal(group.oaQuantity, parseDecimal(oaQuantity, "OA数量合计"));
  group.erpQuantity = addDecimal(group.erpQuantity, parseDecimal(erpQuantity, "ERP实发数量合计"));
  group.oaAmount = addDecimal(group.oaAmount, parseDecimal(oaAmount, "OA实际预算金额mx合计"));
  group.erpCost = addDecimal(group.erpCost, parseDecimal(erpCost, "ERP总成本合计"));
}

function addDifferenceType(group: DepartmentVarianceSummaryAccumulator, differenceType: string): void {
  const normalized = normalizeText(differenceType);
  if (normalized) {
    group.differenceTypes.add(normalized);
  }
}

function toSummaryRow(group: DepartmentVarianceSummaryAccumulator): DepartmentVarianceSummaryRow {
  const quantityDiff = subtractDecimal(group.oaQuantity, group.erpQuantity);
  const amountDiff = subtractDecimal(group.oaAmount, group.erpCost);

  return {
    company: group.company,
    dept1: group.dept1,
    dept2: group.dept2,
    perspective: group.perspective,
    primaryDocCount: group.primaryDocCount,
    matchedDocCount: group.matchedDocCount,
    unmatchedDocCount: group.unmatchedDocCount,
    differentDocCount: group.differentDocCount,
    oaQuantity: decimalToNumber2(group.oaQuantity),
    erpQuantity: decimalToNumber2(group.erpQuantity),
    quantityDiff: decimalToNumber2(quantityDiff),
    oaAmount: decimalToNumber2(group.oaAmount),
    erpCost: decimalToNumber2(group.erpCost),
    amountDiff: decimalToNumber2(amountDiff),
    differenceSummary: DIFFERENCE_TYPE_PRIORITY.filter((type) => group.differenceTypes.has(type)).join("、")
  };
}

export function buildDepartmentVarianceSummaryRows(
  oaRows: RawRow[] | null | undefined,
  erpRows: RawRow[] | null | undefined,
  filters: Partial<QueryFilters> | Record<string, unknown> | null | undefined,
  queryDirectionInput: QueryDirection | unknown
): DepartmentVarianceSummaryRow[] {
  const perspective = perspectiveFromDirection(queryDirectionInput);
  const compareResult =
    perspective === "erp" ? buildErpDocCompare(oaRows, erpRows, filters) : buildOaDocCompare(oaRows, erpRows, filters);
  const groups = new Map<string, DepartmentVarianceSummaryAccumulator>();

  for (const summaryRow of compareResult.summaryRows) {
    const group = getOrCreateAccumulator(groups, summaryRow, perspective);
    const matched = normalizeText(summaryRow.counterpartDocNumber) !== "";

    group.primaryDocCount += 1;
    addPerspectiveTotals(group, summaryRow, perspective);

    if (!matched) {
      group.unmatchedDocCount += 1;
      addDifferenceType(
        group,
        perspective === "erp" ? "ERP出库对应OA未在当前OA数据中找到" : "OA有申请，ERP无出库"
      );
      continue;
    }

    group.matchedDocCount += 1;
    const differenceType = classifyMatchedDifference(summaryRow, buildMaterialRowsForDocSummary(compareResult, summaryRow));
    if (differenceType !== "OA和ERP都有，数量一致") {
      group.differentDocCount += 1;
    }
    addDifferenceType(group, differenceType);
  }

  return [...groups.values()].map(toSummaryRow);
}

export function departmentVarianceSummaryRowsToValues(
  rows: DepartmentVarianceSummaryRow[] | null | undefined
): OutputMatrix {
  return [
    [...DEPARTMENT_VARIANCE_SUMMARY_HEADERS],
    ...(rows ?? []).map((row) => [
      row.company,
      row.dept1,
      row.dept2,
      row.perspective,
      row.primaryDocCount,
      row.matchedDocCount,
      row.unmatchedDocCount,
      row.differentDocCount,
      row.oaQuantity,
      row.erpQuantity,
      row.quantityDiff,
      row.oaAmount,
      row.erpCost,
      row.amountDiff,
      row.differenceSummary
    ])
  ];
}
```

- [ ] **Step 4: Run the core test**

Run:

```bash
npm test -- tests/core/department-variance-summary.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add src/core/department-variance-summary.ts tests/core/department-variance-summary.test.ts
git commit -m "feat: add department variance summary core"
```

Expected: commit succeeds.

---

### Task 4: Wire `报废差异汇总` Into Current-Sheet Query and Cleanup

**Files:**
- Modify: `src/macros/current-sheet-query.ts`
- Test: `tests/macros/current-sheet-query.test.ts`
- Test: `tests/macros/macro-flow.test.ts`

- [ ] **Step 1: Write failing macro tests for summary output**

In `tests/macros/current-sheet-query.test.ts`, replace the old legacy detail direction test with:

```ts
  it("runCurrentSheetQueryWithState writes OA perspective variance summary for the active summary sheet", () => {
    const oaSheet = makeOaSheet([
      validOaRow(),
      ["OA-002", "ERP-MISSING", "2026/5/3", "数控", "生产", "仓储", "MAT-B", "物料B", 2, 20]
    ]);
    const erpSheet = makeErpSheet([validErpRow()]);
    const summarySheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, summarySheet, oaCompareSheet, erpCompareSheet]);
    setActiveSheet(root, summarySheet);

    runCurrentSheetQueryWithState(root, {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31",
      queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp
    });

    expect(visibleWrites(summarySheet)).toEqual([
      {
        address: "A1:O2",
        value: [
          [
            "公司简称",
            "一级部门",
            "二级部门",
            "查询视角",
            "主视角单据数",
            "已匹配单据数",
            "未匹配单据数",
            "有差异单据数",
            "OA数量合计",
            "ERP实发数量合计",
            "数量差额",
            "OA实际预算金额mx合计",
            "ERP总成本合计",
            "金额差额",
            "差异类型摘要"
          ],
          [
            "数控",
            "生产",
            "仓储",
            "OA视角",
            2,
            1,
            1,
            1,
            12,
            9,
            3,
            120,
            91,
            29,
            "OA有申请，ERP无出库、OA和ERP都有，但数量不同"
          ]
        ]
      }
    ]);
    expect(summarySheet.writes).toContainEqual({
      address: "CB1:CC1",
      value: [["variance_summary", "A1:O2"]]
    });
    expect(summarySheet.writes).toContainEqual({
      address: "CB2:CG2",
      value: [["数控", "生产", "仓储", "2026/5/1", "2026/5/31", QUERY_DIRECTIONS.oaKingdeeToErp]]
    });
    expect(oaCompareSheet.writes).toEqual([]);
    expect(erpCompareSheet.writes).toEqual([]);
  });
```

Add this ERP perspective test after it:

```ts
  it("runCurrentSheetQueryWithState writes ERP perspective variance summary for the active summary sheet", () => {
    const oaSheet = makeOaSheet([validOaRow()]);
    const erpSheet = makeErpSheet([
      validErpRow(),
      ["ERP-999", "2026/5/3", "OA-MISSING", "数控", "生产", "仓储", "MAT-B", "物料B", 3, 30]
    ]);
    const summarySheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    const root = makeRoot([oaSheet, erpSheet, summarySheet, oaCompareSheet, erpCompareSheet]);
    setActiveSheet(root, summarySheet);

    runCurrentSheetQueryWithState(root, {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31",
      queryDirection: QUERY_DIRECTIONS.erpSourceToOa
    });

    const output = visibleWrites(summarySheet)[0]?.value;
    expect(output).toEqual([
      [
        "公司简称",
        "一级部门",
        "二级部门",
        "查询视角",
        "主视角单据数",
        "已匹配单据数",
        "未匹配单据数",
        "有差异单据数",
        "OA数量合计",
        "ERP实发数量合计",
        "数量差额",
        "OA实际预算金额mx合计",
        "ERP总成本合计",
        "金额差额",
        "差异类型摘要"
      ],
      [
        "数控",
        "生产",
        "仓储",
        "ERP视角",
        2,
        1,
        1,
        1,
        10,
        12,
        -2,
        100,
        121,
        -21,
        "ERP出库对应OA未在当前OA数据中找到、OA和ERP都有，但数量不同"
      ]
    ]);
    expect(summarySheet.writes).toContainEqual({
      address: "CB1:CC1",
      value: [["variance_summary", "A1:O2"]]
    });
  });
```

Add this legacy cleanup test near the current cleanup test:

```ts
  it("runCurrentSheetQuery clears legacy detail metadata when the migrated summary page is queried first time", () => {
    const oaSheet = makeOaSheet();
    const erpSheet = makeErpSheet();
    const summarySheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const oaCompareSheet = makeOutputSheet(SHEET_NAMES.oaDocCompare);
    const erpCompareSheet = makeOutputSheet(SHEET_NAMES.erpDocCompare);
    summarySheet.rangeValues.set("CB1:CC1", [["legacy_detail", "A1:S6"]]);
    const root = makeRoot([oaSheet, erpSheet, summarySheet, oaCompareSheet, erpCompareSheet]);
    setActiveSheet(root, summarySheet);

    runCurrentSheetQueryWithState(root, {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31",
      queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp
    });

    expect(summarySheet.clears).toEqual(["A1:S6"]);
    expect(summarySheet.writes).toContainEqual({
      address: "CB1:CC1",
      value: [["variance_summary", "A1:O2"]]
    });
  });
```

Replace the old `toggleMaterialRows` legacy-detail rejection setup with summary sheet setup:

```ts
  it("toggleMaterialRows rejects the variance summary sheet without clearing output", () => {
    const summarySheet = makeOutputSheet(SHEET_NAMES.varianceSummary);
    const root = makeRoot([summarySheet]);
    setActiveSheet(root, summarySheet);

    expect(() => toggleMaterialRows(root)).toThrow("当前工作表不支持展开物料。");

    expect(summarySheet.clears).toEqual([]);
    expect(summarySheet.rowInserts).toEqual([]);
    expect(summarySheet.rowDeletes).toEqual([]);
  });
```

- [ ] **Step 2: Run focused macro tests and verify they fail**

Run:

```bash
npm test -- tests/macros/current-sheet-query.test.ts --reporter=dot
```

Expected: FAIL because current-sheet query still calls `buildLegacyDetailValues()`.

- [ ] **Step 3: Implement summary query wiring**

In `src/macros/current-sheet-query.ts`, remove these imports:

```ts
import { QUERY_DIRECTIONS } from "../core/query-direction";
import { runQueryCorePipeline } from "../core/query-pipeline";
```

Add this import:

```ts
import {
  buildDepartmentVarianceSummaryRows,
  departmentVarianceSummaryRowsToValues
} from "../core/department-variance-summary";
```

Replace `buildLegacyDetailValues()` with:

```ts
function buildVarianceSummaryValues(
  oaRows: RawRow[],
  erpRows: RawRow[],
  filters: QueryFilters,
  queryDirection: RibbonQueryState["queryDirection"]
):
  | { values: OutputMatrix; noResultMessage: null }
  | { values: null; noResultMessage: string } {
  const summaryRows = buildDepartmentVarianceSummaryRows(oaRows, erpRows, filters, queryDirection);
  if (summaryRows.length === 0) {
    return {
      values: null,
      noResultMessage:
        queryDirection === "ERP源单查OA" ? "查询条件没有匹配到 ERP 数据。" : "查询条件没有匹配到 OA 数据。"
    };
  }

  return {
    values: departmentVarianceSummaryRowsToValues(summaryRows),
    noResultMessage: null
  };
}
```

Update the dispatch in `runCurrentSheetQueryWithState()`:

```ts
    const result =
      kind === "variance_summary"
        ? buildVarianceSummaryValues(oaRows, erpRows, filters, queryState.queryDirection)
        : kind === "oa_doc_compare"
          ? buildOaDocCompareValues(oaRows, erpRows, filters)
          : buildErpDocCompareValues(oaRows, erpRows, filters);
```

Update cleanup call:

```ts
    clearPreviousToolOutput(activeSheet, kind, kind === "variance_summary" ? ["legacy_detail"] : []);
```

Update `safeWriteCurrentSheetError()` the same way:

```ts
    clearPreviousToolOutput(sheet, kind, kind === "variance_summary" ? ["legacy_detail"] : []);
```

Update material expansion rejection:

```ts
  if (kind === "variance_summary") {
    throw new Error("当前工作表不支持展开物料。");
  }
```

- [ ] **Step 4: Update macro-flow legacy query expectations**

In `tests/macros/macro-flow.test.ts`, replace old assertions that expect `"汇总差异"` and `"明细差异"` from `runScrapVarianceQuery()` with assertions for the new summary headers:

```ts
    expect(panelSheet.Name).toBe(SHEET_NAMES.varianceSummary);
    expect(panelSheet.writes).toContainEqual({
      address: "A1:O2",
      value: expect.any(Array)
    });
    expect(output).toContain("查询视角");
    expect(output).toContain("主视角单据数");
    expect(output).toContain("OA视角");
```

For no-match and invalid-direction tests, keep the current error/no-result assertions but update sheet creation from `SHEET_NAMES.detailOutput` to `SHEET_NAMES.varianceSummary`.

- [ ] **Step 5: Run focused macro tests**

Run:

```bash
npm test -- tests/macros/current-sheet-query.test.ts tests/macros/macro-flow.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add src/macros/current-sheet-query.ts tests/macros/current-sheet-query.test.ts tests/macros/macro-flow.test.ts
git commit -m "feat: write variance summary current sheet output"
```

Expected: commit succeeds.

---

### Task 5: Lock Query Dialog Direction by Output Sheet

**Files:**
- Modify: `src/query-dialog/open-query-dialog.ts`
- Modify: `ui/query-dialog.js`
- Test: `tests/query-dialog/open-query-dialog.test.ts`
- Test: `tests/query-dialog/static-autocomplete.test.ts`

- [ ] **Step 1: Write failing bridge URL test updates**

In `tests/query-dialog/open-query-dialog.test.ts`, update `makeRoot()` so `ActiveSheet` defaults to the summary sheet:

```ts
      ActiveSheet: createFakeSheet(SHEET_NAMES.varianceSummary)
```

Update the URL kind test to verify the summary kind is passed:

```ts
  it("passes the active variance summary sheet kind to the dialog URL", () => {
    vi.useFakeTimers();
    const root = makeRoot();
    const runQuery = vi.fn();
    const reportError = vi.fn();

    openQueryDialogAndRun(root, runQuery, reportError);

    const [url] = root.Application.ShowDialog.mock.calls[0] ?? [];
    expect(new URL(String(url)).searchParams.get("outputKind")).toBe("variance_summary");
    vi.clearAllTimers();
  });
```

Keep the existing OA compare URL test, but rename it to:

```ts
  it("passes the active OA compare sheet kind to the dialog URL", () => {
```

- [ ] **Step 2: Write failing static dialog direction tests**

In `tests/query-dialog/static-autocomplete.test.ts`, change `loadQueryDialog()` signature and URL construction:

```ts
function loadQueryDialog(initialPayload?: unknown, outputKind = ""): {
  document: FakeDocument;
  hooks: QueryDialogHooks;
  storage: Map<string, string>;
  runTimeouts(): void;
} {
  const document = new FakeDocument();
  const storage = new Map<string, string>();
  const hooks = {} as QueryDialogHooks;
  const timeoutCallbacks: Array<() => void> = [];
  const search = `?token=test-token${outputKind ? `&outputKind=${encodeURIComponent(outputKind)}` : ""}`;
```

Then replace the `location` line inside `windowObject` with:

```ts
    location: { search },
```

Add this helper after `loadQueryDialog()`:

```ts
function checkedDirection(document: FakeDocument): string {
  return document.querySelectorAll('input[name="queryDirection"]').find((input) => input.checked)?.value ?? "";
}
```

Add these tests:

```ts
  it("keeps direction editable on the variance summary page and restores saved direction", () => {
    const { document } = loadQueryDialog(
      {
        token: "test-token",
        state: {
          queryDirection: "ERP源单查OA"
        },
        suggestions: {}
      },
      "variance_summary"
    );
    const group = document.getElementById("queryDirectionGroup");

    expect(checkedDirection(document)).toBe("ERP源单查OA");
    expect(group?.getAttribute("disabled")).toBeUndefined();
    expect(document.querySelectorAll('input[name="queryDirection"]').every((input) => !input.disabled)).toBe(true);
  });

  it("locks OA compare dialog direction to OA perspective even if saved state says ERP", () => {
    const { document } = loadQueryDialog(
      {
        token: "test-token",
        state: {
          queryDirection: "ERP源单查OA"
        },
        suggestions: {}
      },
      "oa_doc_compare"
    );
    const group = document.getElementById("queryDirectionGroup");

    expect(checkedDirection(document)).toBe("OA金蝶单号查ERP");
    expect(group?.getAttribute("disabled")).toBe("disabled");
    expect(document.querySelectorAll('input[name="queryDirection"]').every((input) => input.disabled)).toBe(true);
  });

  it("locks ERP compare dialog direction to ERP perspective even if saved state says OA", () => {
    const { document } = loadQueryDialog(
      {
        token: "test-token",
        state: {
          queryDirection: "OA金蝶单号查ERP"
        },
        suggestions: {}
      },
      "erp_doc_compare"
    );
    const group = document.getElementById("queryDirectionGroup");

    expect(checkedDirection(document)).toBe("ERP源单查OA");
    expect(group?.getAttribute("disabled")).toBe("disabled");
    expect(document.querySelectorAll('input[name="queryDirection"]').every((input) => input.disabled)).toBe(true);
  });
```

- [ ] **Step 3: Run focused dialog tests and verify they fail**

Run:

```bash
npm test -- tests/query-dialog/open-query-dialog.test.ts tests/query-dialog/static-autocomplete.test.ts --reporter=dot
```

Expected: FAIL because static dialog still treats only `legacy_detail` as editable and does not force compare-sheet directions.

- [ ] **Step 4: Update static dialog direction behavior**

In `ui/query-dialog.js`, replace `isDirectionEditable()` with:

```js
  function isDirectionEditable() {
    var outputKind = getOutputKind();
    return !outputKind || outputKind === "variance_summary";
  }
```

Add this function below it:

```js
  function directionForOutputKind() {
    var outputKind = getOutputKind();
    if (outputKind === "erp_doc_compare") {
      return REVERSE_DIRECTION;
    }
    if (outputKind === "oa_doc_compare") {
      return DEFAULT_DIRECTION;
    }
    return getQueryDirection() || DEFAULT_DIRECTION;
  }
```

Change `initializeForm()` to:

```js
  function initializeForm() {
    resetForm();
    applyInitialState(readInitialState());
    setQueryDirection(directionForOutputKind());
    setDirectionEnabled(isDirectionEditable());
    initializeAutocomplete();
  }
```

In `src/query-dialog/open-query-dialog.ts`, no behavior change should be needed beyond active kind names from Task 1. If TypeScript errors show stale assumptions, update comments and tests without changing storage semantics.

- [ ] **Step 5: Run focused dialog tests**

Run:

```bash
npm test -- tests/query-dialog/open-query-dialog.test.ts tests/query-dialog/static-autocomplete.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

Run:

```bash
git add src/query-dialog/open-query-dialog.ts ui/query-dialog.js tests/query-dialog/open-query-dialog.test.ts tests/query-dialog/static-autocomplete.test.ts
git commit -m "feat: lock query dialog direction by output sheet"
```

Expected: commit succeeds.

---

### Task 6: Clean Up Remaining Legacy References and Sync Bundle

**Files:**
- Modify: `tests/build/build-output.test.ts`
- Modify: `main.js` generated by `npm run build`
- Modify: any remaining source or test file reported by the scans below

- [ ] **Step 1: Scan for stale active legacy references**

Run:

```bash
rg -n "detailOutput|legacy_detail|报废差异明细|汇总差异|明细差异" src tests ui docs/superpowers/specs/2026-05-20-variance-summary-redesign-design.md
```

Expected:

- `legacy_detail` should appear only in metadata migration tests, output metadata compatibility, and the design/spec docs.
- `报废差异明细` should appear only as `SHEET_NAMES.legacyDetailOutput`, migration tests, and the design/spec docs.
- `汇总差异` and `明细差异` should not appear in active current-sheet query or macro-flow expectations.

If the scan finds active runtime references to the old output page, replace them with `varianceSummary` / `variance_summary` or remove the obsolete legacy-output branch.

- [ ] **Step 2: Update build sentinel tests**

Open `tests/build/build-output.test.ts` and update any expected strings from the old active sheet name/kind to:

```ts
expect(searchableSource).toContain("报废差异汇总");
expect(searchableSource).toContain("variance_summary");
expect(searchableSource).not.toContain("报废差异明细、OA视角单据对比 或 ERP视角单据对比");
```

Keep existing forbidden runtime scans for `document.write`, `require(`, `process.`, `child_process`, `fs`, `path`, `src/macros`, and `ribbon.js`.

- [ ] **Step 3: Run typecheck before build**

Run:

```bash
npm run typecheck
```

Expected: PASS. A failure here means a previous task left inconsistent names or types; correct the file named in the TypeScript error, then rerun this exact command before continuing.

- [ ] **Step 4: Build and sync committed bundle**

Run:

```bash
npm run build
```

Expected: PASS and `main.js` is regenerated.

- [ ] **Step 5: Run full tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Run whitespace and bundle red-flag checks**

Run:

```bash
git diff --check
rg -n "document\\.write|src/macros|ribbon\\.js|require\\(|process\\.|child_process|fs\\b|path\\b" main.js
```

Expected:

- `git diff --check` prints nothing and exits 0.
- The `rg` command prints no matches and exits 1. Exit 1 is acceptable for no matches.

- [ ] **Step 7: Review final diff**

Run:

```bash
git status --short
git diff --stat
git diff -- src tests ui main.js
```

Expected:

- Only planned files are modified.
- `AGENTS.md` remains untracked unless the user separately asked to add it.
- `main.js` changes are generated bundle changes corresponding to source/static dialog updates.

- [ ] **Step 8: Commit Task 6**

Run:

```bash
git add src tests ui main.js
git commit -m "chore: sync variance summary bundle"
```

Expected: commit succeeds.

---

## Final Verification

Run the final verification stack after all task commits:

```bash
npm run typecheck
npm run build
npm test
git diff --check
rg -n "document\\.write|src/macros|ribbon\\.js|require\\(|process\\.|child_process|fs\\b|path\\b" main.js
git status --short
```

Expected:

- `npm run typecheck` passes.
- `npm run build` passes and leaves `main.js` synchronized.
- `npm test` passes.
- `git diff --check` prints nothing.
- The `main.js` red-flag scan has no matches. `rg` exit code 1 is acceptable when there are no matches.
- `git status --short` shows only intentional branch state. Untracked `AGENTS.md` may still be present and should remain unstaged unless the user instructs otherwise.

## Manual WPS Verification

Use a real WPS workbook after automated checks:

- Open an old workbook with `报废差异明细`; run initialization and confirm it becomes `报废差异汇总`.
- On `报废差异汇总`, query OA direction and confirm date filters apply to OA `申请日期`.
- On `报废差异汇总`, query ERP direction and confirm date filters apply to ERP `日期`.
- Requery the summary page several times and confirm hidden metadata stays fixed in `CB1:CC1` and `CB2:CG2`.
- Put manual text outside the generated output range, requery, and confirm it is not cleared.
- Click expand on `报废差异汇总` and confirm it reports `当前工作表不支持展开物料。`
- Query and expand rows on `OA视角单据对比` and `ERP视角单据对比` to confirm existing drill-down behavior still works.
