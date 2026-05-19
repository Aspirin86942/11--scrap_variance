# Chinese Learning Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add concise Chinese learning comments to `src/` so a TypeScript beginner can follow the WPS add-in's business flow without changing runtime behavior.

**Architecture:** This is a source-only documentation pass. Comments are added before important functions, branches, WPS runtime boundaries, aggregation loops, and error paths; obvious assignments, imports, exports, and generated files are left alone. Work is split by module responsibility so each batch can be reviewed and verified independently.

**Tech Stack:** TypeScript strict mode, WPS JS runtime APIs, esbuild bundle output, Vitest.

---

## File Structure

- Modify `src/entry.ts`, `src/main.ts`, `src/actions/button-actions.ts`, `src/ribbon/handlers.ts`, `src/ribbon/state.ts`: entrypoints and button dispatch comments.
- Modify `src/types/scrap.ts`, `src/types/wps.ts`, `src/constants.ts`, `src/utils/*.ts`: domain type, WPS type, constant, and utility comments.
- Modify `src/core/*.ts`: core reconciliation, aggregation, table parsing, header detection, precheck, and output-shape comments.
- Modify `src/wps-api/*.ts`, `src/macros/*.ts`: WPS adapter, workbook interaction, output writing, and macro workflow comments.
- Modify `src/query-dialog/*.ts`, `src/perf/*.ts`, `src/bench/query-benchmark.ts`: dialog bridge, state memory, performance metrics, memory sampling, and benchmark comments.
- Do not modify `tests/`, `main.js`, `ui/query-dialog.js`, `package.json`, `ribbon.xml`, or generated artifacts.

## Comment Rules

Use comments like this:

```ts
// 这里先把 OA 行聚合成稳定业务键，后面的 ERP 比对依赖这个 key 判断“一张单据同一物料”的差异。
const groupedRows = new Map<string, OaAggRow>();
```

Avoid comments like this:

```ts
// 创建一个 Map。
const groupedRows = new Map<string, OaAggRow>();
```

## Task 1: Entrypoints, Actions, Types, Constants, And Utilities

**Files:**
- Modify: `src/entry.ts`
- Modify: `src/main.ts`
- Modify: `src/actions/button-actions.ts`
- Modify: `src/ribbon/handlers.ts`
- Modify: `src/ribbon/state.ts`
- Modify: `src/types/scrap.ts`
- Modify: `src/types/wps.ts`
- Modify: `src/constants.ts`
- Modify: `src/utils/date.ts`
- Modify: `src/utils/decimal.ts`
- Modify: `src/utils/matrix.ts`
- Modify: `src/utils/text.ts`

- [ ] **Step 1: Review files before editing**

Run:

```bash
sed -n '1,220p' src/entry.ts
sed -n '1,220p' src/main.ts
sed -n '1,220p' src/actions/button-actions.ts
sed -n '1,220p' src/ribbon/handlers.ts
sed -n '1,220p' src/ribbon/state.ts
sed -n '1,220p' src/types/scrap.ts
sed -n '1,220p' src/types/wps.ts
sed -n '1,220p' src/constants.ts
sed -n '1,220p' src/utils/date.ts
sed -n '1,220p' src/utils/decimal.ts
sed -n '1,220p' src/utils/matrix.ts
sed -n '1,220p' src/utils/text.ts
```

Expected: files are read-only inspected; no source changes.

- [ ] **Step 2: Add entrypoint and dispatch comments**

Add block comments that explain these exact ideas:

```ts
// WPS 只认识挂到全局对象上的 ribbon 回调；这里把 TypeScript 模块里的实现注册成 WPS 能调用的入口。
// 测试入口也挂到全局对象，便于真机 WPS 环境验证每个按钮背后的 action。
```

```ts
// 按钮 registry 把 ribbon.xml 的 control id 映射到真实业务函数，避免每个按钮分散写 try/catch 和 WPS 适配逻辑。
```

- [ ] **Step 3: Add type and constant comments**

Add comments that explain domain types and constants using this pattern:

```ts
// 这些字段名是 OA 源表读取契约，下游表头识别、预验证和正式查询都依赖同一份顺序。
export const OA_REQUIRED_HEADERS = [...]
```

```ts
// WPS 对象模型在测试环境里只能用 mock 表达，所以类型只描述本项目实际访问到的最小接口面。
export interface WpsSheet { ... }
```

- [ ] **Step 4: Add utility comments**

Add comments before date, decimal, matrix, and text helpers that explain normalization intent:

```ts
// Excel/WPS 会把日期暴露成字符串、数字或对象；统一成 key 后，后续比较才不会受显示格式影响。
```

```ts
// WPS Range 可能返回标量、一维数组或二维数组；这里统一成矩阵，避免调用方到处判断形状。
```

- [ ] **Step 5: Verify Task 1**

Run:

```bash
npm run typecheck
git diff --check -- src/entry.ts src/main.ts src/actions/button-actions.ts src/ribbon/handlers.ts src/ribbon/state.ts src/types/scrap.ts src/types/wps.ts src/constants.ts src/utils/date.ts src/utils/decimal.ts src/utils/matrix.ts src/utils/text.ts
```

Expected: typecheck exits 0 and diff check prints no errors.

## Task 2: Core Reconciliation Comments

**Files:**
- Modify: `src/core/build-oa-rows.ts`
- Modify: `src/core/build-erp-rows.ts`
- Modify: `src/core/build-summary-rows.ts`
- Modify: `src/core/compare-rows.ts`
- Modify: `src/core/doc-compare.ts`
- Modify: `src/core/header-detection.ts`
- Modify: `src/core/output-sheets.ts`
- Modify: `src/core/precheck.ts`
- Modify: `src/core/query-direction.ts`
- Modify: `src/core/query-pipeline.ts`
- Modify: `src/core/table-parser.ts`

- [ ] **Step 1: Review files before editing**

Run:

```bash
sed -n '1,260p' src/core/build-oa-rows.ts
sed -n '1,280p' src/core/build-erp-rows.ts
sed -n '1,220p' src/core/build-summary-rows.ts
sed -n '1,220p' src/core/compare-rows.ts
sed -n '1,260p' src/core/doc-compare.ts
sed -n '1,260p' src/core/header-detection.ts
sed -n '1,180p' src/core/output-sheets.ts
sed -n '1,320p' src/core/precheck.ts
sed -n '1,160p' src/core/query-direction.ts
sed -n '1,240p' src/core/query-pipeline.ts
sed -n '1,160p' src/core/table-parser.ts
```

Expected: files are read-only inspected; no source changes.

- [ ] **Step 2: Add aggregation and comparison comments**

Add comments that explain stable keys, Map/Set usage, amount/quantity rules, and detail/summary separation:

```ts
// Map 的 key 是业务维度组合，不是行号；这样同一单据同一物料的多行可以先聚合，再进入差异比较。
```

```ts
// summary 只统计差异类型和数量，detail 保留单据和物料层级信息；两种输出不能混用字段。
```

- [ ] **Step 3: Add table parsing and header detection comments**

Add comments explaining why header detection tolerates leading rows and why required headers are the contract:

```ts
// ERP/OA 导出表前面可能有说明行，所以不能假设第 1 行就是表头；这里按必需字段命中数量识别真实表头。
```

- [ ] **Step 4: Add precheck and query direction comments**

Add comments explaining blocking errors, reminders, and query-direction differences:

```ts
// 预验证只拦截会破坏关联或金额/数量解析的问题；像 OA 金蝶编号为空这类情况只提醒，不阻断用户继续查询。
```

```ts
// 查询方向决定先筛 OA 还是先筛 ERP，后续聚合函数必须保持同一方向语义，否则输出页会出现错配。
```

- [ ] **Step 5: Verify Task 2**

Run:

```bash
npm run typecheck
git diff --check -- src/core
```

Expected: typecheck exits 0 and diff check prints no errors.

## Task 3: WPS Adapter And Macro Workflow Comments

**Files:**
- Modify: `src/wps-api/active-context.ts`
- Modify: `src/wps-api/output-metadata.ts`
- Modify: `src/wps-api/read-sheet-data.ts`
- Modify: `src/wps-api/workbook.ts`
- Modify: `src/wps-api/write-results.ts`
- Modify: `src/macros/current-sheet-query.ts`
- Modify: `src/macros/output-sheets.ts`
- Modify: `src/macros/performance-diagnostics.ts`
- Modify: `src/macros/scrap-variance-precheck.ts`
- Modify: `src/macros/scrap-variance-query.ts`
- Modify: `src/macros/setup-query-panel.ts`

- [ ] **Step 1: Review files before editing**

Run:

```bash
sed -n '1,260p' src/wps-api/active-context.ts
sed -n '1,260p' src/wps-api/output-metadata.ts
sed -n '1,380p' src/wps-api/read-sheet-data.ts
sed -n '1,180p' src/wps-api/workbook.ts
sed -n '1,240p' src/wps-api/write-results.ts
sed -n '1,360p' src/macros/current-sheet-query.ts
sed -n '1,120p' src/macros/output-sheets.ts
sed -n '1,260p' src/macros/performance-diagnostics.ts
sed -n '1,180p' src/macros/scrap-variance-precheck.ts
sed -n '1,180p' src/macros/scrap-variance-query.ts
sed -n '1,80p' src/macros/setup-query-panel.ts
```

Expected: files are read-only inspected; no source changes.

- [ ] **Step 2: Add WPS boundary comments**

Add comments explaining WPS runtime limitations, grouped reads, fallback behavior, and bulk writes:

```ts
// WPS Range.Value2 的返回形状不稳定，读取后必须先标准化矩阵，再交给表头识别和解析逻辑。
```

```ts
// 优先读必需字段所在列组，失败后整体回退 UsedRange；回退保留正确性，只牺牲性能。
```

```ts
// 写表必须优先整块 Range 写入，避免逐格写入在 WPS 大表里变成主要性能瓶颈。
```

- [ ] **Step 3: Add macro flow comments**

Add comments explaining current-sheet isolation, output metadata, query cleanup, and diagnostics:

```ts
// 三张输出页共享弹窗条件格式，但刷新时只处理当前输出表，避免一次查询意外覆盖其他页面。
```

```ts
// 隐藏 metadata 记录上次由工具生成的输出范围，下次清理时只清理工具自己的区域。
```

- [ ] **Step 4: Verify Task 3**

Run:

```bash
npm run typecheck
git diff --check -- src/wps-api src/macros
```

Expected: typecheck exits 0 and diff check prints no errors.

## Task 4: Dialog, Performance, Benchmark, And Final Verification

**Files:**
- Modify: `src/query-dialog/open-query-dialog.ts`
- Modify: `src/query-dialog/state.ts`
- Modify: `src/query-dialog/suggestions.ts`
- Modify: `src/perf/benchmark-data.ts`
- Modify: `src/perf/memory.ts`
- Modify: `src/perf/metrics.ts`
- Modify: `src/perf/runtime-probe.ts`
- Modify: `src/perf/timer.ts`
- Modify: `src/bench/query-benchmark.ts`

- [ ] **Step 1: Review files before editing**

Run:

```bash
sed -n '1,260p' src/query-dialog/open-query-dialog.ts
sed -n '1,120p' src/query-dialog/state.ts
sed -n '1,140p' src/query-dialog/suggestions.ts
sed -n '1,180p' src/perf/benchmark-data.ts
sed -n '1,180p' src/perf/memory.ts
sed -n '1,160p' src/perf/metrics.ts
sed -n '1,120p' src/perf/runtime-probe.ts
sed -n '1,80p' src/perf/timer.ts
sed -n '1,240p' src/bench/query-benchmark.ts
```

Expected: files are read-only inspected; no source changes.

- [ ] **Step 2: Add dialog bridge comments**

Add comments explaining token-scoped storage, polling, ShowDialog, and per-output-sheet memory:

```ts
// token 把本次弹窗的初始条件和返回结果隔离开，避免旧弹窗结果误触发当前查询。
```

```ts
// 弹窗只负责收集条件，真正查询仍在主加载项上下文执行，避免静态 dialog 直接操作工作簿。
```

- [ ] **Step 3: Add performance and benchmark comments**

Add comments explaining metrics boundaries, memory reliability, and benchmark inputs:

```ts
// 这里记录的是阶段级耗时和行数，不把 WPS 无法可靠提供的内存值伪装成精确指标。
```

```ts
// benchmark 使用固定样本生成可重复输入，目标是比较读取和聚合策略，不代表真实工作簿绝对耗时。
```

- [ ] **Step 4: Run full verification**

Run:

```bash
npm run typecheck
npm test
git diff --check
git diff --stat
git diff --name-only
```

Expected:

- `npm run typecheck` exits 0.
- `npm test` exits 0.
- `git diff --check` prints no errors.
- `git diff --name-only` lists only `docs/superpowers/plans/2026-05-19-chinese-learning-comments.md` and intended `src/` files, plus the pre-existing untracked `AGENTS.md` remains separate in `git status --short`.

- [ ] **Step 5: Confirm bundle was not manually edited**

Run:

```bash
git diff -- main.js
git status --short
```

Expected: no `main.js` diff. `AGENTS.md` may still appear as an unrelated untracked file from the previous contributor-guide request.
