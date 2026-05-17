# 性能基准与低内存优化设计

## 目标

进一步优化 WPS 报废差异加载项的性能与内存占用，但不直接凭经验改核心逻辑。第一阶段先建立可重复、可对比、可定位瓶颈的 benchmark 与 WPS 诊断体系，再在严格保持业务输出一致的前提下做低风险优化。

本次设计采用“可测量管线 + 低风险数据结构优化 + WPS 兼容性探针”的主线：

- 新增 Node 侧 `npm run bench`，用于稳定测量 core 计算耗时和内存变化。
- 新增 WPS 侧“性能诊断”入口，用真实工作簿测 `UsedRange.Value2` 读取、解析、计算、清理和写表耗时。
- 新增运行时兼容性探针，记录 WPS JS 环境是否支持 `performance.now`、`console`、`setTimeout`、`Promise`、`Worker` 等能力。
- 第一阶段只做不改变输出的内部优化；Worker、异步分块、可中断执行只作为第二阶段候选，不在本轮直接启用。

第一版 benchmark 只建立基线和报告格式。等拿到真实基线后，再固化回归阈值，例如核心计算不能比最佳基线慢 `10%`。

## 输入

### Node benchmark 输入

- 模拟 OA 原始行，字段与当前 OA 必需表头一致。
- 模拟 ERP 原始行，字段与当前 ERP 必需表头一致。
- 固定查询筛选条件，用于覆盖现有 `parseFilters()` / `buildOaRows()` / `buildErpOnlyRows()` 筛选路径。
- benchmark 参数：
  - 默认规模：`1万 / 5万` 行。
  - 压力规模：通过参数开启 `20万` 行。
  - 非法参数必须给出明确错误并退出非零状态码。

模拟数据必须是确定性的，不能使用不可复现的随机数。生成器需要覆盖：

- OA-only。
- ERP-only。
- OA/ERP 完全匹配。
- 物料明细不一致。
- 数量不一致。
- 多日期聚合。
- 多 ERP 出库单号聚合。

### WPS 性能诊断输入

- 当前工作簿中的固定工作表：
  - `查询OA-存货报废申请单`
  - `查询ERP-报废明细表`
  - `查询面板`
- 查询面板筛选条件：
  - `B2`: 公司简称。
  - `B3`: 一级部门。
  - `B4`: 二级部门。
  - `B5`: 开始日期。
  - `B6`: 结束日期。
- WPS 运行时能力：
  - `performance.now`
  - `console`
  - `setTimeout`
  - `Promise`
  - `Worker`

## 输出

### Node benchmark 输出

`npm run bench` 默认输出人可读表格，并写入机器可读 JSON：

```text
bench-results/latest.json
```

表格示例：

```text
dataset     stage                  rows      time_ms   heap_delta_mb
10k         generate_data           20000     85.3      18.4
10k         build_oa_rows           10000     42.1      7.8
10k         build_erp_rows_for_oa   8000      31.6      5.2
10k         build_erp_only_rows     2000      9.4       1.1
10k         compare_rows            9500      18.9      4.3
10k         build_summary_rows      9500      11.2      1.8
10k         build_output_matrix     9500      15.5      6.9
10k         total                   20000     214.0     45.5
```

JSON 报告结构：

```ts
interface BenchReport {
  generatedAt: string;
  gitCommit: string;
  nodeVersion: string;
  datasets: DatasetBenchResult[];
}

interface DatasetBenchResult {
  name: "10k" | "50k" | "200k";
  oaRows: number;
  erpRows: number;
  resultRows: {
    oaGroups: number;
    erpForOaGroups: number;
    erpOnlyGroups: number;
    detailRows: number;
    summaryRows: number;
  };
  stages: StageMetric[];
  total: StageMetric;
}
```

`bench-results/latest.json` 是本地运行结果，默认不作为必须提交的稳定产物，避免不同机器的性能结果污染仓库历史。应提交 benchmark 代码、报告目录规则和必要的 `.gitignore` 规则。

### WPS 诊断输出

新增或刷新工作表：

```text
性能诊断结果
```

建议表头：

```text
类别 | 阶段 | 输入行数 | 输出行数 | 耗时ms | 内存MB | 说明
```

WPS 内存如果没有可靠 API，必须写 `无确切信息`，不能写猜测数字。

第一版 WPS 诊断不覆盖 `查询面板` 的正式查询结果，只写诊断表。原因是诊断动作不应意外破坏用户当前查询输出。正式输出写回耗时可以在后续版本通过明确模式追加。

## 架构

在现有 TypeScript + esbuild 架构上新增性能可观测与 benchmark 模块，不打乱当前 `src/core`、`src/wps-api`、`src/macros` 边界。

建议新增结构：

```text
src/
├── perf/
│   ├── timer.ts
│   ├── memory.ts
│   ├── metrics.ts
│   ├── benchmark-data.ts
│   └── runtime-probe.ts
├── bench/
│   └── query-benchmark.ts
└── macros/
    └── performance-diagnostics.ts
```

模块职责：

- `src/perf/timer.ts`
  - 提供统一计时 API。
  - 优先使用 `performance.now()`。
  - 不可用时退回 `Date.now()`。

- `src/perf/memory.ts`
  - 在 Node 中使用 `process.memoryUsage()`。
  - 在 WPS 或浏览器环境中如果没有可靠 API，返回 `无确切信息`。

- `src/perf/metrics.ts`
  - 定义 `BenchmarkResult`、`StageMetric`、`RuntimeCapability` 等类型。
  - 提供阶段计时、内存采样和报告汇总工具。

- `src/perf/benchmark-data.ts`
  - 生成确定性的 OA/ERP 模拟数据。
  - 控制匹配比例、ERP-only 比例、数量差异比例、物料不一致比例和多日期比例。

- `src/perf/runtime-probe.ts`
  - 检测 WPS JS 环境能力。
  - 单个能力不存在不能导致诊断失败，只记录支持状态。

- `src/bench/query-benchmark.ts`
  - Node benchmark CLI 入口。
  - 调用模拟数据生成和现有 core 函数。
  - 输出表格和 JSON 报告。
  - 该入口只用于开发 benchmark，不进入 WPS 业务宏。

- `src/macros/performance-diagnostics.ts`
  - WPS 诊断宏。
  - 读取真实工作簿。
  - 测量读取、解析、计算、输出矩阵构建和诊断表写入耗时。
  - 输出 `性能诊断结果`。

现有模块调整：

- `src/macros/scrap-variance-query.ts`
  - 保持正式查询入口行为不变。
  - 可把主要步骤拆成更清楚的阶段函数，方便 WPS 诊断复用计时。

- `src/ribbon/handlers.ts` 和 `ribbon.xml`
  - 增加 `性能诊断` 按钮。
  - 按钮只运行诊断，不替代正式查询。

核心原则：benchmark 和诊断必须调用同一批 core 函数，避免“测的是一套代码，实际跑的是另一套代码”。WPS API 真实耗时只在 WPS 诊断里测，Node benchmark 不模拟 `UsedRange.Value2` 和 `Range.Value2` 写回成本。

## 数据流

### Node benchmark 数据流

```text
生成模拟数据
  -> buildOaRows()
  -> collectSelectedOaForms()
  -> buildErpRowsForOa()
  -> buildErpOnlyRows()
  -> compareRows()
  -> buildSummaryRows()
  -> summaryRowsToValues()
  -> detailRowsToValues()
  -> 汇总报告
```

### WPS 性能诊断数据流

```text
读取查询面板筛选条件
  -> 读取 OA UsedRange.Value2
  -> 解析 OA 表头和行
  -> 读取 ERP UsedRange.Value2
  -> 解析 ERP 表头和行
  -> 执行 core 计算
  -> 构建输出矩阵
  -> 清理诊断结果表
  -> 写入诊断结果
```

诊断阶段至少覆盖：

- `read_filters`
- `read_oa_used_range`
- `parse_oa_table`
- `read_erp_used_range`
- `parse_erp_table`
- `build_oa_rows`
- `collect_oa_forms`
- `build_erp_rows_for_oa`
- `build_erp_only_rows`
- `compare_rows`
- `build_summary_rows`
- `build_output_matrix`
- `write_diagnostics_sheet`
- `total`

## 优化策略

第一阶段只做可证明低风险的结构优化：

1. 阶段函数化
   - 抽出 `runQueryCorePipeline()`。
   - Node benchmark 和 WPS 诊断共用同一条 core 路径。

2. 减少重复 `Map` 查找
   - 将 `get -> set -> get` 改为 `let target = map.get(key); if (!target) { target = ...; map.set(key, target); }`。

3. 减少重复标准化
   - 行循环里同一字段如果后续多次使用，先存局部变量。
   - 重点减少 `normalizeText()`、`normalizeDateKey()` 重复调用。

4. 控制 Decimal 成本
   - 金额和数量继续使用 `decimal.js-light`，不能改成 `float`。
   - 汇总阶段评估使用 Decimal accumulator 到最后再转 number，减少 `number -> Decimal -> number -> Decimal` 往返。

5. 减少中间数组
   - 保持不构造 union key 数组的现状。
   - 最终输出矩阵因为 WPS 批量写需要，不能取消。
   - 要单独测 `build_output_matrix`，明确最终矩阵带来的内存峰值。

6. WPS 写入策略保持批量化
   - 保持 `writeMatrixBulkOrChunks()` 先整块写、失败后分块写。
   - 禁止新增逐行逐格兜底。

第二阶段候选只记录，不在第一阶段直接实现：

- 分块计算和进度反馈。
- `setTimeout` / `Promise` 让出 UI 的可中断执行。
- Web Worker 纯数据计算。
- 更紧凑的数组型 row representation，例如把 `RawRow` 对象转为列索引数组。

## 正确性约束

第一阶段严格保持现有业务输出：

- 查询筛选口径不变。
- 差异类型优先级不变。
- 汇总字段和明细字段不变。
- 输出列顺序不变。
- 日期拼接规则不变。
- ERP 单号拼接规则不变。
- WPS 正式查询入口行为不变。
- 现有测试必须继续通过。

对优化后的核心结果，需要新增等价或边界测试，至少覆盖：

- 完全匹配。
- OA-only。
- ERP-only。
- 物料不一致。
- 数量不一致。
- 多日期聚合。
- 多 ERP 出库单号聚合。

## 错误处理

- `npm run bench` 失败时退出非零状态码，并打印失败阶段、错误消息和堆栈摘要。
- benchmark 数据规模参数非法时给明确错误，例如 `--scale` 只能是 `default`、`stress` 或具体行数。
- WPS 性能诊断读取工作表失败、表头无法识别、日期非法、写诊断表失败时，优先写入 `性能诊断结果` 的错误行。
- 如果连诊断表也无法写入，则抛出明确错误。
- WPS 内存不可测时，诊断表写 `无确切信息`。
- 兼容性探针不能因为某个 API 不存在而中断诊断。

## 测试策略

需要补充 Vitest 覆盖：

- `src/perf/timer.ts`
  - `performance.now()` 可用时使用高精度计时。
  - `performance.now()` 不可用时退回 `Date.now()`。

- `src/perf/memory.ts`
  - Node 环境可返回内存采样。
  - 非 Node 或不可测环境返回 `无确切信息`。

- `src/perf/benchmark-data.ts`
  - 固定输入规模生成稳定行数。
  - 生成稳定关键字段。
  - 生成稳定匹配比例和异常类型覆盖。

- `src/perf/runtime-probe.ts`
  - 缺少 `Worker`、`Promise`、`performance` 等能力时不抛错。
  - 输出支持、不支持或无确切信息。

- `src/bench/query-benchmark.ts`
  - 小规模数据能跑通 CLI 核心路径。
  - 报告结构包含阶段耗时、内存、输入输出行数。

- `src/macros/performance-diagnostics.ts`
  - 使用现有 fake WPS API 测诊断表写入。
  - 测错误行写入。
  - 测诊断不会污染 `查询面板` 正式输出。

- query core 优化
  - 保持现有测试通过。
  - 增加等价测试，确认优化前后输出严格一致。

## 验收

建议验收命令：

```bash
npm test -- --run
npm run typecheck
npm run build
npm run bench
npm run bench -- --scale stress
```

如果 `20万` 压力档耗时较长，可以不作为普通 CI 默认门槛，但本地验收时需要至少运行一次并记录结果。

验收标准：

- 默认 `npm run bench` 能输出 `1万 / 5万` 两档报告。
- `bench-results/latest.json` 有完整阶段耗时、内存、输入输出行数和运行环境信息。
- WPS 功能区出现 `性能诊断` 入口。
- WPS 诊断能在真实工作簿中输出 `性能诊断结果`。
- 业务输出保持严格一致。
- 现有查询测试不因性能改造改变期望。
- 若 WPS 环境不支持 Worker 或其他能力，诊断能记录不支持，不影响正常查询。

## 伪代码草案

```ts
// 目标：让 Node benchmark 和 WPS 诊断复用同一条核心计算路径，避免测量逻辑和真实逻辑分叉
// 输入：
// - oaRows: 已从 OA 表解析出的 RawRow[]
// - erpRows: 已从 ERP 表解析出的 RawRow[]
// - filters: 查询面板筛选条件
// - metrics: 阶段计时与内存采样器
// 输出：
// - pipelineResult: 查询核心结果，包括 grouped rows、detailRows、summaryRows、output matrices
// - benchmarkReport: 每个阶段的耗时、内存变化、输入输出行数

function runQueryCorePipeline(oaRows, erpRows, filters, metrics) {
  // 为什么这样做：所有性能入口共用同一条 core 路径，避免 benchmark 测到的是另一套简化逻辑
  const oaGroupedRows = metrics.measure("build_oa_rows", () => {
    return buildOaRows(oaRows, filters);
  });

  const currentOaFormNumbers = metrics.measure("collect_oa_forms", () => {
    return collectSelectedOaForms(oaGroupedRows);
  });

  const erpRowsForOa = metrics.measure("build_erp_rows_for_oa", () => {
    return buildErpRowsForOa(erpRows, oaGroupedRows);
  });

  const erpOnlyRows = metrics.measure("build_erp_only_rows", () => {
    return buildErpOnlyRows(erpRows, currentOaFormNumbers, filters);
  });

  const detailRows = metrics.measure("compare_rows", () => {
    return compareRows(oaGroupedRows, erpRowsForOa, erpOnlyRows);
  });

  const summaryRows = metrics.measure("build_summary_rows", () => {
    return buildSummaryRows(detailRows);
  });

  const outputMatrices = metrics.measure("build_output_matrix", () => {
    return {
      summaryValues: summaryRowsToValues(summaryRows),
      detailValues: detailRowsToValues(detailRows)
    };
  });

  return {
    oaGroupedRows,
    erpRowsForOa,
    erpOnlyRows,
    detailRows,
    summaryRows,
    outputMatrices
  };
}

// 目标：Node 环境生成稳定 benchmark 报告
// 为什么这样做：先得到当前版本基线，再谈优化效果和回归阈值
function runNodeBenchmark(options) {
  const scales = resolveScales(options); // default: 10k/50k, stress adds 200k
  const report = createBenchReport();

  for (const scale of scales) {
    const data = measure("generate_data", () => generateBenchmarkData(scale));
    const filters = parseFilters(data.filters);
    const result = runQueryCorePipeline(data.oaRows, data.erpRows, filters, metrics);

    report.datasets.push(buildDatasetReport(scale, data, result, metrics));
  }

  writeJson("bench-results/latest.json", report);
  printHumanTable(report);
}

// 目标：WPS 内诊断真实读取、解析、计算、写诊断表耗时
// 为什么这样做：Node 无法模拟 WPS API 成本，必须在真实 WPS 环境里分段测量
function runWpsPerformanceDiagnostics(root) {
  const diagnosticsSheet = getOrCreateSheet("性能诊断结果");

  try {
    const capabilities = probeRuntimeCapabilities(root);
    const filters = measure("read_filters", () => readPanelFilters());

    const oaMatrix = measure("read_oa_used_range", () => readUsedRangeMatrix(oaSheet));
    const oaTable = measure("parse_oa_table", () => parseTableFromMatrix(oaMatrix));

    const erpMatrix = measure("read_erp_used_range", () => readUsedRangeMatrix(erpSheet));
    const erpTable = measure("parse_erp_table", () => parseTableFromMatrix(erpMatrix));

    const result = runQueryCorePipeline(oaTable.rows, erpTable.rows, filters, metrics);

    writeDiagnosticsSheet(diagnosticsSheet, capabilities, metrics, result);
  } catch (error) {
    writeDiagnosticsError(diagnosticsSheet, error);
  }
}
```

## 风险点 / 边界条件

- Node benchmark 不能代表 WPS API 耗时。
  - 处理方式：Node 只测 core 计算，WPS 诊断单独测 `UsedRange.Value2` 和写表。

- WPS 内存指标可能不可测。
  - 处理方式：不可测时明确写 `无确切信息`。

- 模拟数据可能失真。
  - 处理方式：生成器必须覆盖典型差异类型和多日期、多单号聚合。

- 性能优化可能引入业务变化。
  - 处理方式：第一阶段要求现有测试全部通过，并补充等价测试。

- Worker 和异步能力在 WPS 中不稳定。
  - 处理方式：第一阶段只做兼容性探针，不启用相关架构。

- `bench-results/latest.json` 会随机器和运行时变化。
  - 处理方式：默认生成但不作为稳定结果提交，只提交报告规则和代码。

