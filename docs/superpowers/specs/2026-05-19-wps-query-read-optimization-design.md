# WPS 查询读表性能优化设计

## 目标

本次优化目标是让真实 WPS 点击查询更快，优先减少 WPS 表格读取成本，同时保持业务输出完全不变。

用户提供的性能诊断显示，当前主要耗时集中在两张源表的 `UsedRange.Value2` 读取：

- `read_oa_used_range`: 约 `113.7ms`
- `read_erp_used_range`: 约 `209.4ms`
- 两项合计约 `323.1ms`

这部分明显高于解析和 core 计算阶段。因此，本次不优先继续抠 core pipeline，而是把正式查询和性能诊断的源表读取从整块 `UsedRange` 改为自适应窄读。

核心目标：

- 不要求用户清理 OA/ERP 原始导出文件。
- 不依赖用户删除说明行、无用列或格式污染区域。
- 继续兼容表头不在第一行的旧文件。
- 优先只读取工具必需字段所在列，降低 WPS 到 JavaScript 的数据搬运量。
- 如果窄读失败，自动降级到当前全量 `UsedRange` 读取，保证可用性优先。
- 诊断表必须展示实际读取策略和范围，避免静默降级或误判性能。

本次不改变金额、数量、差异类型、表头字段名、输出列顺序、排序规则、隐藏元数据、输出清理策略和业务判断口径。

## 输入

### 源工作表

正式查询和性能诊断继续读取现有源表：

```text
查询OA-存货报废申请单
查询ERP-报废明细表
```

源文件可以保持原始导出结构。实现不能假设：

- 表头一定在第 1 行。
- 用户已经删除前置说明行。
- 用户已经删除无用列。
- `UsedRange` 只包含有效业务列。
- 必需字段在连续列中。

### 必需字段

OA 表继续以 `OA_REQUIRED_HEADERS` 为读取契约：

```text
表单编号
金蝶云单据编号
申请日期
公司简称
一级部门
二级部门
物料代码
物料名称
数量
实际预算金额mx
```

ERP 表继续以 `ERP_REQUIRED_HEADERS` 为读取契约：

```text
单据编号
日期
源单单号
区分公司简称
一级部门
二级部门
物料编码
物料名称
实发数量
总成本
```

字段名仍要求精确匹配。字段名变更不属于本次优化范围。

### 查询条件

查询条件沿用当前弹窗或旧面板状态进入查询编排层：

- 公司简称
- 一级部门
- 二级部门
- 开始日期
- 结束日期
- 查询方向

读表优化不改变 `parseFilters()`、`runQueryCorePipeline()`、`buildOaDocCompare()`、`buildErpDocCompare()` 的业务输入语义。

## 输出

### 正式查询输出

正式查询输出保持现有行为：

- `报废差异明细`
- `OA视角单据对比`
- `ERP视角单据对比`

本次优化只改变源表读取方式，不改变输出矩阵内容、列顺序、差异类型、无结果消息和错误消息主体。

### 性能诊断输出

`性能诊断结果` 继续使用现有表头：

```text
类别 | 阶段 | 输入行数 | 输出行数 | 耗时ms | 内存MB | 说明
```

新增读表策略和范围信息，以诊断行形式写入。建议行示例：

```text
读表策略 | oa_read_strategy | 不适用 | 不适用 | 不适用 | 不适用 | grouped_columns
读表范围 | oa_used_range | 2881 | 60 | 不适用 | 不适用 | A1:BH2881
读表范围 | oa_read_range | 2881 | 10 | 不适用 | 不适用 | A:C,H:H,M:M,Z:Z
读表策略 | erp_read_strategy | 不适用 | 不适用 | 不适用 | 不适用 | narrow_rectangle
读表范围 | erp_used_range | 4994 | 18 | 不适用 | 不适用 | A1:R4994
读表范围 | erp_read_range | 4994 | 10 | 不适用 | 不适用 | A:J
```

如果窄读失败并降级：

```text
读表策略 | oa_read_strategy | 不适用 | 不适用 | 不适用 | 不适用 | used_range_fallback；原因：...
```

其中：

- `used_range` 表示 WPS 报告的源表 UsedRange。
- `read_range` 表示本次实际尝试读取的范围。
- `read_strategy` 至少包含：
  - `narrow_rectangle`
  - `grouped_columns`
  - `used_range_fallback`

## 运行环境

运行环境保持现状：

- Linux 本地开发和验证。
- TypeScript + esbuild。
- Vitest 单元测试。
- WPS JS 加载项运行环境。
- 不假设 Node API 在 WPS 宏运行时可用。

WPS 读表代码必须继续放在 `src/wps-api` 边界内，core 计算模块不得直接调用 WPS 对象模型。

## 架构

### 模块边界

本次优化集中在 WPS 读表边界：

```text
src/wps-api/read-sheet-data.ts
```

建议在该模块中新增自适应读取能力，并保留现有全量读取能力作为兜底。

正式查询侧：

```text
src/macros/current-sheet-query.ts
  -> readSourceRows()
  -> readSheetTableOptimized()
  -> core 查询或单据对比
```

性能诊断侧：

```text
src/macros/performance-diagnostics.ts
  -> readSheetTableOptimized()
  -> 写出读取策略和阶段耗时
```

核心原则：正式查询和诊断必须共用同一读取函数，避免“诊断测的是窄读，正式跑的仍是全量 UsedRange”。

### 读取策略

读取策略分三层。

第一层：表头探测。

- 从 `UsedRange` 起始行开始，只读取前 `MAX_HEADER_SCAN_ROWS` 行。
- 使用现有 `detectHeaderRow()` 识别表头。
- 继续兼容表头在第 1 行、第 3 行或其他前置说明行之后的情况。

第二层：自适应窄读。

- 根据表头识别结果，取得所有必需字段的列号。
- 如果必需列集中，读取单个矩形窄区域。
- 如果必需列分散，按连续列分组读取多个窄区域，再在 JS 内拼回标准矩阵。
- 拼回后的矩阵仍交给现有 `parseTableFromMatrix()`，避免重写表头和 RawRow 解析规则。

第三层：全量兜底。

- 如果表头探测、窄矩形读取、分组列读取或矩阵拼接失败，降级到当前 `UsedRange.Value2` 全量读取。
- 降级不能静默发生，必须返回诊断信息。
- 如果全量读取也失败，沿用现有可读错误。

### 策略选择规则

策略选择以减少 WPS 数据搬运为目标，同时避免过多 WPS Range 调用带来的反向开销。

建议规则：

- 如果必需列最大跨度接近必需列数量，使用 `narrow_rectangle`。
- 如果必需列最大跨度明显大于必需列数量，使用 `grouped_columns`。
- 连续列合并为一个读取组，避免逐列读取。
- 分组数量过多时，可以回退到 `narrow_rectangle`，避免 WPS Range 调用过多。

具体阈值在实施计划中确定，并通过测试锁定。阈值属于性能策略，不影响业务结果。

## 数据流

### 正式查询数据流

```text
用户点击查询当前页
  -> 查询弹窗或现有状态生成 QueryState
  -> 读取 OA 表：readSheetTableOptimized()
  -> 读取 ERP 表：readSheetTableOptimized()
  -> 根据当前输出页分发
  -> runQueryCorePipeline() 或 doc compare
  -> 清理当前工具输出区域
  -> 写入当前输出表和隐藏元数据
```

### 性能诊断数据流

```text
用户点击性能诊断
  -> 读取运行时能力
  -> 读取查询条件
  -> 读取 OA 表：记录策略、范围、耗时、行列数
  -> 解析 OA 表
  -> 读取 ERP 表：记录策略、范围、耗时、行列数
  -> 解析 ERP 表
  -> runQueryCorePipeline()
  -> 构建输出矩阵
  -> 写入性能诊断结果
```

诊断阶段命名可以从 `read_oa_used_range` / `read_erp_used_range` 调整为更准确的：

```text
read_oa_source_table
read_erp_source_table
```

如果为了兼容历史观察，也可以保留旧名称，但说明中必须写出实际策略。

## 错误处理

### 窄读失败

窄读失败时不直接中断正式查询，而是降级全量读取。

返回结果必须携带：

- `strategy: "used_range_fallback"`
- `fallbackReason`
- `usedRangeAddress`
- `attemptedReadRanges`

性能诊断要把这些信息写入 `性能诊断结果`。

### 全量兜底失败

如果全量 `UsedRange.Value2` 也失败，沿用当前错误模型：

```text
读取工作表失败：<sheet.Name>；<原因>
```

正式查询错误继续写入当前输出表。诊断错误继续写入 `性能诊断结果`。

### 表头错误

表头缺失、表头识别不唯一、关键列重复等错误仍由现有 `HeaderDetectionError` 表达。窄读不能降低错误质量，也不能把表头错误吞成通用读取失败。

如果表头探测失败，但全量 UsedRange 能识别表头，允许降级成功；诊断中必须记录探测失败原因。

## 风险点 / 边界条件

- WPS Range 地址在不同版本中可能对整行、整列、区域地址支持不完全一致，因此必须保留全量兜底。
- 多区域分组读取会增加 WPS Range 调用次数。列非常分散但分组很多时，过度分组可能反而变慢。
- 拼回矩阵时必须保留表头行和工作表行号关系，否则错误行号、隐藏元数据或后续排查会变差。
- 必需列不连续时，拼回矩阵不能改变字段名，也不能丢失空值。
- `UsedRange` 可能被格式污染撑大行数。窄读可以减少列宽成本，但不能消除过多行导致的读取成本。
- 真实 WPS 性能只能在 WPS 环境内验证，Node benchmark 不能模拟 `Range.Value2` 读写开销。
- 不做缓存，因此连续切换三张输出表仍会重新读取源表；这是为了避免缓存失效导致错误结果。

## 不做范围

本次明确不做：

- 不要求用户修改源文件。
- 不实现运行时缓存。
- 不启用 Web Worker。
- 不改 core 差异判断。
- 不改金额和数量舍入规则。
- 不改输出表结构和列顺序。
- 不改输出清理策略。
- 不新增大型依赖。
- 不把 WPS API 调用下沉到 core 模块。

## 测试

### 单元测试

新增或扩展 `read-sheet-data` 测试，覆盖：

- 表头在第 1 行时使用窄读。
- 表头在第 3 行时仍能识别并正确解析。
- `UsedRange.Row` 不等于 1 时，工作表行号仍正确。
- 必需列连续时选择 `narrow_rectangle`。
- 必需列分散时选择 `grouped_columns`。
- 分组读取拼回后的 RawRow 与全量读取一致。
- 窄读失败时降级全量读取，并返回 `used_range_fallback` 诊断。
- 全量兜底也失败时抛出当前格式的读取错误。
- 表头缺失、重复和识别不唯一仍返回现有错误语义。

### 查询集成测试

覆盖：

- `runCurrentSheetQuery()` 使用优化后的读取函数。
- `toggleMaterialRows()` 重新读取源表时也使用同一读取函数。
- `runPerformanceDiagnostics()` 和正式查询共用读取函数。
- 三张输出表的结果与优化前测试数据一致。
- 诊断表包含读取策略和读取范围行。

### 构建验证

完成实现后执行：

```bash
npm test
npm run typecheck
npm run build
npm run bench -- --no-json
git diff --check
```

如果源码改动影响 bundle，必须用 `npm run build` 同步 `main.js`。

## 验收方式

代码层验收：

- 所有测试通过。
- `main.js` 与 TypeScript 源码同步。
- 没有新增 Node-only API 进入 WPS 运行路径。
- 正式查询输出和现有测试期望一致。

WPS 手工验收：

- 在真实工作簿中点击 `性能诊断`。
- 诊断表显示 OA/ERP 的 `used_range`、`read_range` 和 `read_strategy`。
- 当源文件列很多且必需列较少时，`read_range` 列数小于 `used_range` 列数。
- 正式点击 `查询当前页` 后，输出结果与优化前一致。
- `read_oa_source_table` / `read_erp_source_table` 或对应读取阶段耗时比全量读取基线下降。具体下降幅度以真实 WPS 工作簿为准，不在代码中硬编码百分比。

## 伪代码草案

```ts
type ReadStrategy = "narrow_rectangle" | "grouped_columns" | "used_range_fallback";

interface ReadDiagnostics {
  strategy: ReadStrategy;
  usedRangeAddress: string;
  usedRangeRows: number;
  usedRangeCols: number;
  readRangeDescription: string;
  readRows: number;
  readCols: number;
  fallbackReason?: string;
}

interface OptimizedTableReadResult {
  table: ParsedTable;
  diagnostics: ReadDiagnostics;
}

function readSheetTableOptimized(
  sheet: WpsSheet,
  requiredHeaders: string[],
  options: HeaderDetectionOptions,
): OptimizedTableReadResult {
  const usedRange = sheet.UsedRange;
  if (!usedRange) {
    throw new Error("UsedRange 不存在");
  }

  try {
    // 只读前 N 行定位表头，避免一开始就把整张 UsedRange 搬进 JS。
    const headerProbeAddress = buildHeaderProbeAddress(usedRange, options.maxScanRows);
    const headerProbeMatrix = normalizeMatrix(sheet.Range(headerProbeAddress).Value2);
    const headerResult = detectHeaderRow(headerProbeMatrix, requiredHeaders, {
      ...options,
      usedRangeStartRow: getUsedRangeStartRow(usedRange),
    });
    if (!headerResult.ok) {
      throw new HeaderDetectionError(headerResult);
    }

    // 根据必需列分布选择单矩形读取或分组列读取。
    const readPlan = buildReadPlan(usedRange, headerResult.columnIndex, requiredHeaders);
    const narrowMatrix =
      readPlan.strategy === "grouped_columns"
        ? readGroupedColumnMatrix(sheet, readPlan)
        : readRectangleMatrix(sheet, readPlan);

    return {
      table: parseTableFromMatrix(narrowMatrix, requiredHeaders, {
        ...options,
        usedRangeStartRow: readPlan.startRow,
      }),
      diagnostics: {
        strategy: readPlan.strategy,
        usedRangeAddress: readPlan.usedRangeAddress,
        usedRangeRows: readPlan.usedRangeRows,
        usedRangeCols: readPlan.usedRangeCols,
        readRangeDescription: readPlan.description,
        readRows: narrowMatrix.length,
        readCols: requiredHeaders.length,
      },
    };
  } catch (narrowError) {
    // 兼容优先：窄读失败时回到当前全量 UsedRange 逻辑，但必须记录原因。
    const fallbackMatrix = normalizeMatrix(usedRange.Value2);
    return {
      table: parseTableFromMatrix(fallbackMatrix, requiredHeaders, options),
      diagnostics: {
        strategy: "used_range_fallback",
        usedRangeAddress: readAddress(usedRange),
        usedRangeRows: fallbackMatrix.length,
        usedRangeCols: maxWidth(fallbackMatrix),
        readRangeDescription: readAddress(usedRange),
        readRows: fallbackMatrix.length,
        readCols: maxWidth(fallbackMatrix),
        fallbackReason: errorMessage(narrowError),
      },
    };
  }
}
```
