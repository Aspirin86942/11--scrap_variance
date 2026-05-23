# 输出页查询诊断基线设计

## 目标

本轮目标是让性能诊断和 Node benchmark 对齐当前真实查询路径，回答“每张输出页各自慢在哪里”。

当前项目已经有 `npm run bench` 和 WPS 侧 `性能诊断结果`，但它们主要围绕旧的 `runQueryCorePipeline()` 核心管线。正式查询当前已经按三张输出页分流：

- `报废差异汇总`
- `OA视角单据对比`
- `ERP视角单据对比`

因此本轮只做诊断基线对齐：

- 不做真正性能优化。
- 不引入源表缓存。
- 不改变三张业务输出表字段、排序、空值、金额或数量舍入规则。
- 不改变 WPS 功能区按钮行为。
- 不让性能诊断覆盖三张业务输出页。

核心方案是新增一个纯 TypeScript 输出页查询执行器，让正式查询、Node benchmark 和 WPS 性能诊断共享同一套“按输出页构建结果”的核心逻辑。

## 输入

### 纯查询执行器输入

新增纯业务模块：

```text
src/core/output-query-runner.ts
```

输入包括：

- `kind`: 当前输出页类型，只允许：
  - `variance_summary`
  - `oa_doc_compare`
  - `erp_doc_compare`
- `oaRows`: 已解析好的 OA 源表行。
- `erpRows`: 已解析好的 ERP 源表行。
- `queryState`: 当前查询条件和查询方向。
- `metrics`: 统一阶段指标记录器。

执行器不读取 WPS 对象，不清理工作表，不写单元格，不保存 metadata。

### WPS 正式查询输入

正式查询仍来自当前 WPS 工作簿：

- 当前活动工作表决定输出页类型。
- 查询条件来自弹窗返回的 `RibbonQueryState`。
- OA 源表：`查询OA-存货报废申请单`
- ERP 源表：`查询ERP-报废明细表`

正式查询仍只刷新当前活动输出页，不覆盖其他输出页。

### WPS 性能诊断输入

性能诊断读取同一份真实工作簿源表和当前功能区查询条件：

- 读取并解析 OA 源表一次。
- 读取并解析 ERP 源表一次。
- 用同一份 `oaRows` / `erpRows` 分别跑三张输出页的纯查询执行器。

诊断动作只写 `性能诊断结果`，不写三张业务输出页。

### Node benchmark 输入

`npm run bench` 继续使用确定性模拟数据：

- 默认规模：`10k / 50k`
- 压力规模：`10k / 50k / 200k`
- 自定义规模：正整数

每个 dataset 下分别执行：

- `variance_summary`
- `oa_doc_compare`
- `erp_doc_compare`

## 输出

### 纯查询执行器输出

执行器返回结构化结果：

```ts
type RunnableOutputSheetKind = "variance_summary" | "oa_doc_compare" | "erp_doc_compare";

interface OutputQueryRunnerResult {
  kind: RunnableOutputSheetKind;
  values: OutputMatrix | null;
  noResultMessage: string | null;
  rowCounts: {
    sourceRows: number;
    outputRows: number;
    summaryRows?: number;
    materialRows?: number;
  };
}
```

规则：

- `values !== null` 表示有可写输出矩阵。
- `values === null` 且 `noResultMessage !== null` 表示无结果提示，不是错误。
- 异常不在执行器内吞掉，由调用方处理。
- `rowCounts` 只用于诊断和 benchmark，不改变业务输出。

### WPS 性能诊断输出

继续写入：

```text
性能诊断结果
```

表头保持现有结构，不新增列：

```text
类别 | 阶段 | 输入行数 | 输出行数 | 耗时ms | 内存MB | 说明
```

诊断阶段分为两层：

- WPS 外壳阶段：读表、解析、写诊断表。
- 输出页计算阶段：三张输出页各自的核心计算和矩阵构建。

建议阶段名：

```text
read_filters
read_oa_source_table
parse_oa_table
read_erp_source_table
parse_erp_table
build_variance_summary_rows
build_variance_summary_matrix
build_oa_doc_compare_rows
build_oa_doc_compare_matrix
build_erp_doc_compare_rows
build_erp_doc_compare_matrix
write_diagnostics_sheet
```

每个输出页阶段的 `说明` 写入 `output=<kind>`，例如：

```text
output=variance_summary
output=oa_doc_compare
output=erp_doc_compare
```

结果规模行写出每张输出页的关键行数，例如：

```text
类别=结果规模
阶段=result_rows
说明=output=oa_doc_compare；summaryRows=45000；materialRows=5000；outputRows=45001
```

内存拿不到时继续写 `无确切信息`，不能写猜测值。非阶段行继续用 `不适用` 区分。

### Node benchmark 输出

控制台表格新增输出页维度：

```text
dataset output           stage                         input_rows time_ms heap_delta_mb_or_max
50k     variance_summary build_variance_summary_rows   105000    120.5   18.2
50k     variance_summary build_variance_summary_matrix 120      2.4     0.5
50k     oa_doc_compare   build_oa_doc_compare_rows     105000    310.8   42.7
50k     oa_doc_compare   build_oa_doc_compare_matrix   45000    15.6    7.3
50k     erp_doc_compare  build_erp_doc_compare_rows    105000    295.1   40.9
50k     erp_doc_compare  build_erp_doc_compare_matrix  46000    16.2    7.5
```

JSON 报告按 dataset 和 output 分组：

```ts
interface BenchReport {
  generatedAt: string;
  gitCommit: string;
  nodeVersion: string;
  datasets: DatasetBenchResult[];
}

interface DatasetBenchResult {
  name: string;
  oaRows: number;
  erpRows: number;
  outputs: OutputBenchResult[];
}

interface OutputBenchResult {
  kind: RunnableOutputSheetKind;
  resultRows: {
    sourceRows: number;
    outputRows: number;
    summaryRows?: number;
    materialRows?: number;
  };
  stages: StageMetric[];
  total: {
    name: "total";
    timeMs: number;
    maxStageHeapDeltaMb: MemoryValue;
  };
}
```

`bench-results/latest.json` 仍是本地运行结果，不作为必须提交的稳定产物。

## 运行环境

运行环境保持现有项目约束：

- Linux 本地开发。
- npm 包管理器。
- TypeScript 严格类型检查。
- WPS JS / 受限浏览器式运行环境。
- WPS 运行时代码不得依赖 Node-only API。
- Node benchmark 可以使用 Node API，但不能进入 WPS runtime bundle 的业务路径。
- `main.js` 是提交产物，源码变更后必须通过 `npm run build` 同步。

## 架构

新增模块职责：

```text
src/core/output-query-runner.ts
```

职责：

- 根据 `kind` 选择当前输出页真实业务路径。
- 调用现有核心函数：
  - `buildDepartmentVarianceSummaryRows`
  - `buildOaDocCompare`
  - `buildErpDocCompare`
  - `departmentVarianceSummaryRowsToValues`
  - `docCompareRowsToValues`
- 用 `metrics.measure()` 记录稳定阶段名。
- 返回 `values` 或 `noResultMessage`。

现有模块调整：

- `src/macros/current-sheet-query.ts`
  - 删除本文件内重复的三页构建分支。
  - 继续负责 WPS 副作用：读取源表、清理旧输出、写表、保存 metadata、错误写回。
  - 调用 `runOutputSheetQueryCore()` 获取输出矩阵或无结果提示。

- `src/macros/performance-diagnostics.ts`
  - 继续负责 WPS 真实读表、解析和写诊断表。
  - 源表读取和解析只执行一次。
  - 用同一份已解析数据分别调用三次输出页执行器。

- `src/bench/query-benchmark.ts`
  - 每个 dataset 下分别调用三次输出页执行器。
  - 输出表格和 JSON 改为按输出页分组。

边界原则：

- WPS 宏层处理副作用。
- 纯查询执行器处理业务路径选择和阶段指标。
- 现有 core 业务函数保持输出语义。

## 数据流

### 正式查询数据流

```text
runCurrentSheetQueryWithState
  -> setupOutputSheets
  -> detectOutputSheetKind
  -> parseFilters
  -> readSourceRows
      -> readSheetTable(OA)
      -> readSheetTable(ERP)
  -> runOutputSheetQueryCore(kind, oaRows, erpRows, queryState, metrics)
  -> clearPreviousToolOutput
  -> writeOutputWithMetadata
```

正式查询仍只写当前活动输出页。

### WPS 性能诊断数据流

```text
runPerformanceDiagnostics
  -> read_filters
  -> read_oa_source_table
  -> parse_oa_table
  -> read_erp_source_table
  -> parse_erp_table
  -> runOutputSheetQueryCore(variance_summary)
  -> runOutputSheetQueryCore(oa_doc_compare)
  -> runOutputSheetQueryCore(erp_doc_compare)
  -> write_diagnostics_sheet
```

性能诊断只写诊断表，不写三张业务输出页。

### Node benchmark 数据流

```text
generateBenchmarkData(scale)
  -> runOutputSheetQueryCore(variance_summary)
  -> runOutputSheetQueryCore(oa_doc_compare)
  -> runOutputSheetQueryCore(erp_doc_compare)
  -> renderBenchTable
  -> writeBenchJson
```

## 错误处理

纯查询执行器不吞异常。异常向外抛出，由调用方按场景处理：

- 正式查询：写当前输出页错误行。
- WPS 性能诊断：写 `性能诊断结果` 错误行。
- Node benchmark：打印错误并设置非零退出码。

无结果不是错误：

- `variance_summary` 在 OA 方向无结果时提示 `查询条件没有匹配到 OA 数据。`
- `variance_summary` 在 ERP 方向无结果时提示 `查询条件没有匹配到 ERP 数据。`
- `oa_doc_compare` 无结果时提示 `查询条件没有匹配到 OA 数据。`
- `erp_doc_compare` 无结果时提示 `查询条件没有匹配到 ERP 数据。`

错误信息写入失败时，继续保留现有“双重失败”错误模型，不能静默失败。

## 伪代码草案

```ts
// [伪代码草案]
// 目标：用同一个纯查询执行器统一正式查询、Node benchmark 和 WPS 性能诊断的三页核心路径。
// 输入：
// - kind: 当前输出页类型
// - oaRows / erpRows: 已解析源表行，执行器不碰 WPS Range
// - queryState: 查询条件和查询方向
// - metrics: 阶段耗时与内存记录器
// 输出：
// - values: 有结果时的输出矩阵
// - noResultMessage: 无结果时写给用户的一行提示
// - rowCounts: 诊断和 benchmark 使用的行数摘要

type RunnableOutputSheetKind = "variance_summary" | "oa_doc_compare" | "erp_doc_compare";

function runOutputSheetQueryCore(input: OutputQueryRunnerInput): OutputQueryRunnerResult {
  const filters = parseFilters(input.queryState);
  const sourceRows = input.oaRows.length + input.erpRows.length;

  if (input.kind === "variance_summary") {
    const summaryRows = input.metrics.measure(
      "build_variance_summary_rows",
      {
        inputRows: sourceRows,
        outputRows: (rows) => rows.length,
        note: "output=variance_summary"
      },
      () =>
        buildDepartmentVarianceSummaryRows(
          input.oaRows,
          input.erpRows,
          filters,
          input.queryState.queryDirection
        )
    );

    if (summaryRows.length === 0) {
      return {
        kind: input.kind,
        values: null,
        noResultMessage:
          input.queryState.queryDirection === "ERP源单查OA"
            ? "查询条件没有匹配到 ERP 数据。"
            : "查询条件没有匹配到 OA 数据。",
        rowCounts: { sourceRows, outputRows: 1, summaryRows: 0 }
      };
    }

    const values = input.metrics.measure(
      "build_variance_summary_matrix",
      {
        inputRows: summaryRows.length,
        outputRows: (matrix) => matrix.length,
        note: "output=variance_summary"
      },
      () => departmentVarianceSummaryRowsToValues(summaryRows)
    );

    return {
      kind: input.kind,
      values,
      noResultMessage: null,
      rowCounts: { sourceRows, outputRows: values.length, summaryRows: summaryRows.length }
    };
  }

  if (input.kind === "oa_doc_compare") {
    const result = input.metrics.measure(
      "build_oa_doc_compare_rows",
      {
        inputRows: sourceRows,
        outputRows: (value) => value.summaryRows.length,
        note: "output=oa_doc_compare"
      },
      () => buildOaDocCompare(input.oaRows, input.erpRows, filters)
    );

    if (result.summaryRows.length === 0) {
      return {
        kind: input.kind,
        values: null,
        noResultMessage: "查询条件没有匹配到 OA 数据。",
        rowCounts: { sourceRows, outputRows: 1, summaryRows: 0, materialRows: 0 }
      };
    }

    const values = input.metrics.measure(
      "build_oa_doc_compare_matrix",
      {
        inputRows: result.summaryRows.length,
        outputRows: (matrix) => matrix.length,
        note: "output=oa_doc_compare"
      },
      () => docCompareRowsToValues("oa_doc_compare", result.summaryRows)
    );

    return {
      kind: input.kind,
      values,
      noResultMessage: null,
      rowCounts: {
        sourceRows,
        outputRows: values.length,
        summaryRows: result.summaryRows.length,
        materialRows: countMaterialRows(result)
      }
    };
  }

  const result = input.metrics.measure(
    "build_erp_doc_compare_rows",
    {
      inputRows: sourceRows,
      outputRows: (value) => value.summaryRows.length,
      note: "output=erp_doc_compare"
    },
    () => buildErpDocCompare(input.oaRows, input.erpRows, filters)
  );

  if (result.summaryRows.length === 0) {
    return {
      kind: input.kind,
      values: null,
      noResultMessage: "查询条件没有匹配到 ERP 数据。",
      rowCounts: { sourceRows, outputRows: 1, summaryRows: 0, materialRows: 0 }
    };
  }

  const values = input.metrics.measure(
    "build_erp_doc_compare_matrix",
    {
      inputRows: result.summaryRows.length,
      outputRows: (matrix) => matrix.length,
      note: "output=erp_doc_compare"
    },
    () => docCompareRowsToValues("erp_doc_compare", result.summaryRows)
  );

  return {
    kind: input.kind,
    values,
    noResultMessage: null,
    rowCounts: {
      sourceRows,
      outputRows: values.length,
      summaryRows: result.summaryRows.length,
      materialRows: countMaterialRows(result)
    }
  };
}
```

## 风险点 / 边界条件

- `current-sheet-query.ts` 当前有业务分支和 WPS 副作用混在一起，抽执行器时必须保持无结果提示、输出矩阵字段和错误写回行为一致。
- `performance-diagnostics.ts` 一次诊断跑三张输出页，计算阶段会比单页正式查询多；诊断表必须说明各阶段 output，避免误读为一次正式查询耗时。
- WPS 读写耗时只能在真机诊断里测，Node benchmark 不能代表 `Range.Value2` 的真实成本。
- `materialRows` 只作为诊断行数摘要，不能改变展开物料的现有行为。
- `main.js` 是提交产物，后续实现必须重新构建并通过 bundle 同步测试。

## 测试方案

新增或调整测试：

- `tests/core/output-query-runner.test.ts`
  - 覆盖三种输出页返回正确矩阵。
  - 覆盖三种输出页无结果提示。
  - 覆盖 metrics 阶段名和 `output=<kind>` 说明。
  - 覆盖 `rowCounts`。

- `tests/bench/query-benchmark.test.ts`
  - 覆盖 benchmark report 按 `outputs` 分组。
  - 覆盖每个 dataset 包含三种输出页。
  - 覆盖控制台表格包含 output kind。

- `tests/macros/current-sheet-query.test.ts`
  - 覆盖正式查询仍只写当前活动输出页。
  - 覆盖错误写回行为不变。

- `tests/macros/macro-flow.test.ts`
  - 覆盖 WPS 性能诊断输出三张输出页阶段。
  - 覆盖诊断不清理三张业务输出页。

- `tests/build/build-output.test.ts`
  - 保持 `main.js` 与源码构建结果同步。
  - 保持 WPS runtime 禁用模式扫描。

## 验收方式

后续实现完成后，至少执行：

```bash
npm run build
npm test
npm run bench -- --no-json
npm run bench -- --scale stress --no-json
git diff --check
rg -n "document\\.write|src/macros|ribbon\\.js|require\\(|process\\.|child_process|fs\\b|path\\b" main.js
```

验收标准：

- `npm run bench -- --no-json` 输出每个 dataset 下三张输出页的阶段耗时。
- `npm run bench -- --scale stress --no-json` 输出 `10k / 50k / 200k` 三种规模下三张输出页的阶段耗时。
- WPS 性能诊断结果包含源表读取/解析阶段和三张输出页核心阶段。
- 正式查询三张业务输出表内容保持现有测试契约。
- `main.js` 已由 `npm run build` 重新生成并通过同步测试。
