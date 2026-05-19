# Grouped Source Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `grouped_ranges` the primary WPS source-sheet read strategy so OA/ERP reads only required field column groups, then stitches data back in `requiredHeaders` order.

**Architecture:** Keep all WPS object-model access inside `src/wps-api/read-sheet-data.ts`. Header probing still reads the first `MAX_HEADER_SCAN_ROWS` rows at full UsedRange width, but body reads are split into continuous required-column groups and stitched into a compact matrix before existing parsing and business logic run.

**Tech Stack:** TypeScript, WPS JS object model, esbuild, Vitest, committed `main.js` bundle.

---

## File Structure

- Modify `src/wps-api/read-sheet-data.ts`
  - Owns UsedRange metadata, header probing, grouped range planning, grouped range reads, matrix stitching, validation, and UsedRange fallback.
- Modify `src/macros/performance-diagnostics.ts`
  - Formats grouped read diagnostics into the `性能诊断结果` sheet.
- Modify `tests/wps-api/read-sheet-data.test.ts`
  - Locks grouped read planning, required-header order stitching, fallback, malformed group handling, and non-`A1` coordinates.
- Modify `tests/wps-api/fakes.ts`
  - Adds a test-only range read override hook so malformed WPS return shapes can be simulated without changing production code.
- Modify `tests/macros/current-sheet-query.test.ts`
  - Keeps formal query path locked to grouped range source reads.
- Modify `tests/macros/macro-flow.test.ts`
  - Locks performance diagnostics strategy notes for `grouped_ranges` and fallback.
- Modify `main.js`
  - Generated bundle, updated only by `npm run build`.

## Task 1: Specify Grouped Read Primary Contract

**Files:**
- Modify: `tests/wps-api/read-sheet-data.test.ts`

- [ ] **Step 1: Write failing tests for grouped primary reads and header-order stitching**

Add these tests inside the existing `describe("optimized WPS source reads", callback)` block, after the existing `keeps absolute worksheet coordinates when UsedRange does not start at A1` test:

```ts
  it("uses grouped_ranges as the primary strategy when ten required fields are isolated", () => {
    const requiredHeaders = ["F01", "F02", "F03", "F04", "F05", "F06", "F07", "F08", "F09", "F10"];
    const sheet = createFakeSheet("DATA", [
      rowWith({
        1: "F01",
        3: "F02",
        5: "F03",
        7: "F04",
        9: "F05",
        11: "F06",
        13: "F07",
        15: "F08",
        17: "F09",
        19: "F10"
      }),
      rowWith({
        1: "v01",
        3: "v02",
        5: "v03",
        7: "v04",
        9: "v05",
        11: "v06",
        13: "v07",
        15: "v08",
        17: "v09",
        19: "v10"
      })
    ]);

    const result = readSheetTableWithDiagnostics(sheet, requiredHeaders, 5, 20);

    expect(result.diagnostics.strategy).toBe("grouped_ranges");
    expect(result.diagnostics.groupCount).toBe(10);
    expect(result.diagnostics.readRows).toBe(2);
    expect(result.diagnostics.readCols).toBe(10);
    expect(result.diagnostics.readRangeDescription).toBe(
      "A1:A2,C1:C2,E1:E2,G1:G2,I1:I2,K1:K2,M1:M2,O1:O2,Q1:Q2,S1:S2"
    );
    expect(result.table.matrix[0]).toEqual(requiredHeaders);
    expect(result.table.matrix[1]).toEqual(["v01", "v02", "v03", "v04", "v05", "v06", "v07", "v08", "v09", "v10"]);
    expect(sheet.rangeReads).toEqual([
      "A1:S2",
      "A1:A2",
      "C1:C2",
      "E1:E2",
      "G1:G2",
      "I1:I2",
      "K1:K2",
      "M1:M2",
      "O1:O2",
      "Q1:Q2",
      "S1:S2"
    ]);
    expect(sheet.usedRangeValue2ReadCount).toBe(0);
  });

  it("stitches grouped range values in required header order instead of worksheet column order", () => {
    const requiredHeaders = ["C字段", "A字段", "B字段"];
    const sheet = createFakeSheet("DATA", [
      rowWith({
        1: "A字段",
        2: "B字段",
        5: "C字段"
      }),
      rowWith({
        1: "A1",
        2: "B1",
        5: "C1"
      })
    ]);

    const result = readSheetTableWithDiagnostics(sheet, requiredHeaders, 2, 20);

    expect(result.diagnostics.strategy).toBe("grouped_ranges");
    expect(result.diagnostics.groupCount).toBe(2);
    expect(result.diagnostics.readRangeDescription).toBe("A1:B2,E1:E2");
    expect(result.table.headers).toEqual(requiredHeaders);
    expect(result.table.matrix[0]).toEqual(requiredHeaders);
    expect(result.table.matrix[1]).toEqual(["C1", "A1", "B1"]);
    expect(result.table.rows[0]?.["C字段"]).toBe("C1");
    expect(result.table.rows[0]?.["A字段"]).toBe("A1");
    expect(result.table.rows[0]?.["B字段"]).toBe("B1");
    expect(sheet.rangeReads).toEqual(["A1:E2", "A1:B2", "E1:E2"]);
    expect(sheet.usedRangeValue2ReadCount).toBe(0);
  });
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- tests/wps-api/read-sheet-data.test.ts
```

Expected result:

```text
FAIL tests/wps-api/read-sheet-data.test.ts
```

Expected failure reason:

```text
expected 'narrow_rectangle' or 'grouped_columns' to be 'grouped_ranges'
```

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/wps-api/read-sheet-data.test.ts
git commit -m "test: specify grouped source read contract"
```

## Task 2: Implement Grouped Range Read and Stitching

**Files:**
- Modify: `src/wps-api/read-sheet-data.ts`
- Test: `tests/wps-api/read-sheet-data.test.ts`

- [ ] **Step 1: Update diagnostics types and read-plan types**

In `src/wps-api/read-sheet-data.ts`, replace the strategy type and read-plan interfaces with this shape:

```ts
export type SheetReadStrategy = "grouped_ranges" | "used_range_fallback";

export interface SheetReadDiagnostics {
  strategy: SheetReadStrategy;
  usedRangeAddress: string;
  usedRangeRows: number;
  usedRangeCols: number;
  readRangeDescription: string;
  readRows: number;
  readCols: number;
  groupCount?: number;
  fallbackReason?: string;
}

interface RequiredColumn {
  header: string;
  absoluteCol: number;
}

interface GroupedReadPlan {
  startRow: number;
  rowCount: number;
  groups: ColumnGroup[];
  requiredColumns: RequiredColumn[];
  usedRange: RangeDimensions;
  description: string;
}
```

Remove these constants because the grouped path is no longer limited by a fixed group count:

```ts
const RECTANGLE_SPAN_MULTIPLIER = 2;
const MAX_GROUPED_RANGES = 4;
```

- [ ] **Step 2: Replace sorted compact-column planning with required-header ordered planning**

Replace `compactColumnsFromHeader()` and `buildReadPlan()` with these helpers:

```ts
function groupKey(group: ColumnGroup): string {
  return `${group.startCol}:${group.endCol}`;
}

function requiredColumnsFromHeader(
  requiredHeaders: string[],
  columnIndex: Record<string, number>,
  usedRangeStartCol: number
): RequiredColumn[] {
  return requiredHeaders.map((header) => {
    const relativeCol = columnIndex[header];
    if (typeof relativeCol !== "number") {
      throw new Error(`缺少必需字段列映射：${header}`);
    }
    return {
      header,
      absoluteCol: usedRangeStartCol + relativeCol
    };
  });
}

function buildGroupedReadPlan(
  usedRange: RangeDimensions,
  headerRowOffset: number,
  requiredHeaders: string[],
  columnIndex: Record<string, number>
): GroupedReadPlan {
  const requiredColumns = requiredColumnsFromHeader(requiredHeaders, columnIndex, usedRange.startCol);
  const uniqueColumns = [...new Set(requiredColumns.map((column) => column.absoluteCol))];
  const groups = contiguousGroups(uniqueColumns);
  const startRow = usedRange.startRow + headerRowOffset;
  const rowCount = usedRange.rowCount - headerRowOffset;
  return {
    startRow,
    rowCount,
    groups,
    requiredColumns,
    usedRange,
    description: describeGroups(groups, startRow, rowCount)
  };
}
```

- [ ] **Step 3: Add grouped read validation and stitching helpers**

Add these helpers below `readRectangleMatrix()`:

```ts
function groupForColumn(groups: ColumnGroup[], absoluteCol: number): ColumnGroup {
  const group = groups.find((candidate) => candidate.startCol <= absoluteCol && absoluteCol <= candidate.endCol);
  if (!group) {
    throw new Error(`找不到字段列所在读取组：${absoluteCol}`);
  }
  return group;
}

function readGroupedMatrices(sheet: WpsSheet, plan: GroupedReadPlan): Map<string, WpsMatrix> {
  const matrices = new Map<string, WpsMatrix>();
  for (const group of plan.groups) {
    const matrix = readRectangleMatrix(sheet, group, plan.startRow, plan.rowCount);
    const expectedWidth = group.endCol - group.startCol + 1;
    if (matrix.length !== plan.rowCount) {
      throw new Error(
        `列组读取行数不一致：${rangeAddress(plan.startRow, group.startCol, plan.rowCount, expectedWidth)} 期望 ${plan.rowCount} 行，实际 ${matrix.length} 行`
      );
    }
    if (matrix.some((row) => row.length < expectedWidth)) {
      throw new Error(
        `列组读取列数不一致：${rangeAddress(plan.startRow, group.startCol, plan.rowCount, expectedWidth)} 期望 ${expectedWidth} 列`
      );
    }
    matrices.set(groupKey(group), matrix);
  }
  return matrices;
}

function stitchRequiredHeaderMatrix(plan: GroupedReadPlan, groupMatrices: Map<string, WpsMatrix>): WpsMatrix {
  const result: WpsMatrix = [];
  for (let rowIndex = 0; rowIndex < plan.rowCount; rowIndex += 1) {
    const row = plan.requiredColumns.map((requiredColumn) => {
      const group = groupForColumn(plan.groups, requiredColumn.absoluteCol);
      const matrix = groupMatrices.get(groupKey(group));
      if (!matrix) {
        throw new Error(`缺少列组读取结果：${groupKey(group)}`);
      }
      return matrix[rowIndex]?.[requiredColumn.absoluteCol - group.startCol] ?? "";
    });
    result.push(row);
  }
  return result;
}

function diagnosticsForGroupedPlan(plan: GroupedReadPlan, matrix: WpsMatrix): SheetReadDiagnostics {
  return {
    strategy: "grouped_ranges",
    usedRangeAddress: plan.usedRange.address,
    usedRangeRows: plan.usedRange.rowCount,
    usedRangeCols: plan.usedRange.colCount,
    readRangeDescription: plan.description,
    readRows: matrix.length,
    readCols: plan.requiredColumns.length,
    groupCount: plan.groups.length
  };
}
```

Delete `readPlannedMatrix()` and `diagnosticsForPlan()` after the new helpers are in place.

- [ ] **Step 4: Replace the narrow read branch in `readSheetMatrixOptimized()`**

Inside `readSheetMatrixOptimized()`, replace this block:

```ts
    const requiredColumns = compactColumnsFromHeader(requiredHeaders, headerResult.columnIndex, dimensions.startCol);
    const plan = buildReadPlan(dimensions, headerResult.headerRowIndex, requiredColumns);
    const matrix = readPlannedMatrix(sheet, plan);
```

with:

```ts
    const plan = buildGroupedReadPlan(dimensions, headerResult.headerRowIndex, requiredHeaders, headerResult.columnIndex);
    const groupMatrices = readGroupedMatrices(sheet, plan);
    const matrix = stitchRequiredHeaderMatrix(plan, groupMatrices);
```

And replace the success return diagnostics:

```ts
      diagnostics: diagnosticsForPlan(plan, matrix)
```

with:

```ts
      diagnostics: diagnosticsForGroupedPlan(plan, matrix)
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```bash
npm test -- tests/wps-api/read-sheet-data.test.ts
```

Expected result:

```text
Test Files  1 passed
```

- [ ] **Step 6: Commit grouped read implementation**

```bash
git add src/wps-api/read-sheet-data.ts tests/wps-api/read-sheet-data.test.ts
git commit -m "feat: make grouped ranges the source read path"
```

## Task 3: Cover Group Failure and Malformed Range Fallback

**Files:**
- Modify: `tests/wps-api/fakes.ts`
- Modify: `tests/wps-api/read-sheet-data.test.ts`
- Test: `tests/wps-api/read-sheet-data.test.ts`

- [ ] **Step 1: Add fake range read overrides**

In `tests/wps-api/fakes.ts`, add this property to `FakeSheet`:

```ts
  readValueOverrides: Map<string, unknown>;
```

Initialize it in `createFakeSheet()`:

```ts
    readValueOverrides: new Map<string, unknown>(),
```

In both `get Value()` and `get Value2()` inside `Range(address: string)`, add this check after the `failReadAddresses` block and before `return sheet.rangeValues.get(address);`:

```ts
          if (sheet.readValueOverrides.has(address)) {
            return sheet.readValueOverrides.get(address);
          }
```

- [ ] **Step 2: Add fallback tests for group failures**

Add these tests in `tests/wps-api/read-sheet-data.test.ts`, after `falls back to full UsedRange when the narrow read fails`:

```ts
  it("falls back to full UsedRange when any grouped range read fails", () => {
    const requiredHeaders = ["C字段", "A字段", "B字段"];
    const sheet = createFakeSheet("DATA", [
      rowWith({
        1: "A字段",
        2: "B字段",
        5: "C字段"
      }),
      rowWith({
        1: "A1",
        2: "B1",
        5: "C1"
      })
    ]);
    sheet.failReadAddresses.add("E1:E2");

    const result = readSheetTableWithDiagnostics(sheet, requiredHeaders, 2, 20);

    expect(result.diagnostics.strategy).toBe("used_range_fallback");
    expect(result.diagnostics.fallbackReason).toContain("range read failed: E1:E2");
    expect(result.table.rows[0]?.["C字段"]).toBe("C1");
    expect(sheet.usedRangeValue2ReadCount).toBe(1);
  });

  it("falls back to full UsedRange when a grouped range returns an inconsistent row count", () => {
    const requiredHeaders = ["C字段", "A字段", "B字段"];
    const sheet = createFakeSheet("DATA", [
      rowWith({
        1: "A字段",
        2: "B字段",
        5: "C字段"
      }),
      rowWith({
        1: "A1",
        2: "B1",
        5: "C1"
      })
    ]);
    sheet.readValueOverrides.set("E1:E2", [["C字段"]]);

    const result = readSheetTableWithDiagnostics(sheet, requiredHeaders, 2, 20);

    expect(result.diagnostics.strategy).toBe("used_range_fallback");
    expect(result.diagnostics.fallbackReason).toContain("列组读取行数不一致");
    expect(result.table.rows[0]?.["C字段"]).toBe("C1");
    expect(sheet.usedRangeValue2ReadCount).toBe(1);
  });
```

- [ ] **Step 3: Run the focused test and verify it passes**

Run:

```bash
npm test -- tests/wps-api/read-sheet-data.test.ts
```

Expected result:

```text
Test Files  1 passed
```

- [ ] **Step 4: Commit fallback coverage**

```bash
git add tests/wps-api/fakes.ts tests/wps-api/read-sheet-data.test.ts
git commit -m "test: cover grouped range fallback cases"
```

## Task 4: Update Performance Diagnostics for Grouped Ranges

**Files:**
- Modify: `src/macros/performance-diagnostics.ts`
- Modify: `tests/macros/macro-flow.test.ts`
- Test: `tests/macros/macro-flow.test.ts`

- [ ] **Step 1: Update diagnostics tests for grouped strategy notes**

In `tests/macros/macro-flow.test.ts`, update `runPerformanceDiagnostics writes diagnostics without clearing query output` by changing:

```ts
    expect(output).toContain("narrow_rectangle");
```

to:

```ts
    expect(output.some((value) => value.startsWith("grouped_ranges；列组="))).toBe(true);
```

Add this assertion after `expect(output).toContain("oa_read_range");`:

```ts
    expect(output).toContain("oa_used_range");
```

In `runPerformanceDiagnostics writes a cell-safe fallback reason for read strategy notes`, keep the fallback expectation and add:

```ts
    expect(strategyNote).toContain("used_range_fallback");
```

Add this new test after the fallback reason test:

```ts
  it("runPerformanceDiagnostics writes grouped range count and read column diagnostics", () => {
    const oaSheet = createFakeSheet(SHEET_NAMES.oa, [
      scatteredRequiredRow({
        1: "表单编号",
        2: "金蝶云单据编号",
        3: "申请日期",
        13: "公司简称",
        14: "一级部门",
        15: "二级部门",
        26: "物料代码",
        27: "物料名称",
        28: "数量",
        29: "实际预算金额mx"
      }),
      scatteredRequiredRow({
        1: "F1",
        2: "OUT1",
        3: "2026/5/1",
        13: "数控",
        14: "生产",
        15: "仓储",
        26: "MAT-A",
        27: "物料A",
        28: 1,
        29: 10
      })
    ]);
    const erpSheet = createFakeSheet(SHEET_NAMES.erp, [[...ERP_REQUIRED_HEADERS], validErpRow()]);
    const root = makeRoot([oaSheet, erpSheet]);

    runPerformanceDiagnostics(root);

    const diagnosticsSheet = getFakeSheetByName(root, SHEET_NAMES.performanceDiagnostics);
    const initialWrite = diagnosticsSheet.writes[0];
    if (!initialWrite || !Array.isArray(initialWrite.value)) {
      throw new Error("missing diagnostics write");
    }
    const initialRows = initialWrite.value as OutputMatrix;
    const strategyRow = initialRows.find((row) => row[1] === "oa_read_strategy");
    const readRangeRow = initialRows.find((row) => row[1] === "oa_read_range");

    expect(String(strategyRow?.[6] ?? "")).toBe("grouped_ranges；列组=3；读取列=10；总行=2");
    expect(readRangeRow?.[2]).toBe(2);
    expect(readRangeRow?.[3]).toBe(10);
    expect(readRangeRow?.[6]).toBe("A1:C2,M1:O2,Z1:AC2");
  });
```

If `scatteredRequiredRow` is not currently in `macro-flow.test.ts`, copy the helper from `tests/macros/current-sheet-query.test.ts` with this exact implementation near `validErpRow()`:

```ts
function scatteredRequiredRow(columns: Record<number, string | number>): Array<string | number> {
  const width = Math.max(...Object.keys(columns).map(Number));
  return Array.from({ length: width }, (_, index) => columns[index + 1] ?? "");
}
```

- [ ] **Step 2: Run diagnostics tests and verify they fail before implementation**

Run:

```bash
npm test -- tests/macros/macro-flow.test.ts
```

Expected failure before implementation:

```text
expected output to contain grouped_ranges diagnostics
```

- [ ] **Step 3: Format grouped diagnostics in production code**

In `src/macros/performance-diagnostics.ts`, add this helper above `readDiagnosticsRows()`:

```ts
function readStrategyNote(diagnostics: SheetReadDiagnostics): string {
  if (diagnostics.strategy === "used_range_fallback" && diagnostics.fallbackReason) {
    return `${diagnostics.strategy}；原因：${cellSafeNote(diagnostics.fallbackReason)}`;
  }
  if (diagnostics.strategy === "grouped_ranges") {
    return `${diagnostics.strategy}；列组=${diagnostics.groupCount ?? 0}；读取列=${diagnostics.readCols}；总行=${diagnostics.readRows}`;
  }
  return diagnostics.strategy;
}
```

Then replace the existing `strategyNote` assignment in `readDiagnosticsRows()`:

```ts
  const strategyNote =
    diagnostics.strategy === "used_range_fallback" && diagnostics.fallbackReason
      ? `${diagnostics.strategy}；原因：${cellSafeNote(diagnostics.fallbackReason)}`
      : diagnostics.strategy;
```

with:

```ts
  const strategyNote = readStrategyNote(diagnostics);
```

- [ ] **Step 4: Run diagnostics tests and verify they pass**

Run:

```bash
npm test -- tests/macros/macro-flow.test.ts
```

Expected result:

```text
Test Files  1 passed
```

- [ ] **Step 5: Commit diagnostics update**

```bash
git add src/macros/performance-diagnostics.ts tests/macros/macro-flow.test.ts
git commit -m "feat: report grouped range diagnostics"
```

## Task 5: Lock Formal Query Path to Grouped Reads

**Files:**
- Modify: `tests/macros/current-sheet-query.test.ts`
- Test: `tests/macros/current-sheet-query.test.ts`

- [ ] **Step 1: Strengthen the existing scattered-column query path assertion**

In `runCurrentSheetQuery can read scattered required columns without full UsedRange reads`, replace the final range assertion block:

```ts
    expect(oaSheet.rangeReads).toContain("A1:AC20");
    expect(oaSheet.rangeReads).not.toContain("A1:AC25");
    expect(oaSheet.rangeReads).toEqual(expect.arrayContaining(["A1:C25", "M1:O25", "Z1:AC25"]));
```

with:

```ts
    expect(oaSheet.rangeReads).toContain("A1:AC20");
    expect(oaSheet.rangeReads).not.toContain("A1:AC25");
    expect(oaSheet.rangeReads).not.toContain("A1:AJ25");
    expect(oaSheet.rangeReads).toEqual(expect.arrayContaining(["A1:C25", "M1:O25", "Z1:AC25"]));
    expect(oaSheet.rangeReads.filter((address) => address !== "A1:AC20")).toEqual(["A1:C25", "M1:O25", "Z1:AC25"]);
```

- [ ] **Step 2: Run the current-sheet query tests**

Run:

```bash
npm test -- tests/macros/current-sheet-query.test.ts
```

Expected result:

```text
Test Files  1 passed
```

- [ ] **Step 3: Commit formal query path test**

```bash
git add tests/macros/current-sheet-query.test.ts
git commit -m "test: lock formal query grouped reads"
```

## Task 6: Build, Bundle Sync, Review, and Final Verification

**Files:**
- Modify: `main.js`
- Verify: `src/wps-api/read-sheet-data.ts`
- Verify: `src/macros/performance-diagnostics.ts`
- Verify: `tests/wps-api/read-sheet-data.test.ts`
- Verify: `tests/macros/current-sheet-query.test.ts`
- Verify: `tests/macros/macro-flow.test.ts`

- [ ] **Step 1: Run full build to typecheck and sync bundle**

Run:

```bash
npm run build
```

Expected result:

```text
tsc --noEmit
esbuild src/entry.ts
Done
```

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected result:

```text
Test Files  27 passed
```

The exact test count may increase after this plan's tests are added. A passing run with zero failed tests is required.

- [ ] **Step 3: Run benchmark smoke**

Run:

```bash
npm run bench -- --no-json
```

Expected result:

```text
dataset     stage
10k         total
50k         total
```

- [ ] **Step 4: Run whitespace and WPS-runtime red-flag checks**

Run:

```bash
git diff --check
rg -n "document\\.write|require\\(|process\\.|child_process|\\bfs\\b|\\bpath\\b|src/macros|ribbon\\.js" main.js
```

Expected result:

```text
git diff --check exits 0
rg exits 1 with no matches
```

- [ ] **Step 5: Commit bundle sync and final changes**

Run:

```bash
git status --short
git add main.js
git commit -m "chore: sync bundle for grouped reads"
```

If `git status --short` shows source/test files that were not committed by earlier tasks, add those exact files with `main.js` and use this commit message instead:

```bash
git commit -m "chore: verify grouped source reads"
```

- [ ] **Step 6: Request final TypeScript/JavaScript review**

Dispatch a `js_reviewer` with this review scope:

```text
Review grouped source read implementation from d10af9c..HEAD.

Check:
- grouped_ranges is now the primary source read strategy.
- required header order is preserved after stitching.
- UsedRange fallback still works when any group fails or returns malformed shape.
- performance diagnostics records group count, read columns, total rows, and fallback reason.
- WPS runtime code does not use Node-only APIs.
- main.js is a generated bundle sync.
```

Fix any `Critical` or `Important` findings before proceeding.

- [ ] **Step 7: Final clean-state check**

Run:

```bash
git status --short
```

Expected result:

```text
no output
```
