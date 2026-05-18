# 性能诊断缺失指标补齐设计

## 目标

改进 WPS 报废差异加载项的 `性能诊断结果` 表，让用户能区分“字段不适用”和“运行时无法提供确切信息”，同时在不猜测、不估算的前提下尽量补充可靠的内存数据。

本次变更范围只覆盖性能诊断输出和内存采样口径，不改变正式查询逻辑、差异判断、输出明细、汇总结果或功能区入口。

## 输入

- WPS 诊断宏当前使用的运行时对象：
  - `root` 参数。
  - `globalThis` 兜底对象。
- 当前工作簿固定工作表：
  - `查询OA-存货报废申请单`
  - `查询ERP-报废明细表`
  - `查询面板`
  - `性能诊断结果`
- 运行时内存候选 API：
  - Node: `process.memoryUsage().heapUsed` 和 `process.memoryUsage().rss`。
  - WPS/浏览器候选：`performance.memory.usedJSHeapSize` 和 `performance.memory.totalJSHeapSize`。

## 输出

`性能诊断结果` 表继续使用现有 7 列：

```text
类别 | 阶段 | 输入行数 | 输出行数 | 耗时ms | 内存MB | 说明
```

输出口径调整如下：

- `运行时能力` 行：
  - `输入行数`、`输出行数`、`耗时ms`、`内存MB` 写 `不适用`。
  - `说明` 继续写 `支持` 或 `不支持`。
- `阶段耗时` 行：
  - 保留输入行数、输出行数、耗时。
  - `内存MB` 继续表示阶段前后 heap 使用量差值。
  - 能可靠采样时写数字，不能可靠采样时写 `无确切信息`。
- `结果规模` 行：
  - `耗时ms` 和 `内存MB` 写 `不适用`。
  - `说明` 继续写聚合规模，例如 `OA聚合=8；ERP匹配聚合=5；ERP-only聚合=0`。
- `错误` 行：
  - 不属于错误原因的统计字段写 `不适用`。
  - `说明` 写错误信息。

## 架构

本次设计沿用现有边界：

- `src/perf/memory.ts`
  - 继续作为唯一内存采样入口。
  - 在 Node 采样之外增加 `performance.memory` 采样。
  - 只接受明确存在、类型为数字、数值有限、单位为 bytes 的字段。
- `src/perf/metrics.ts`
  - 继续负责阶段计时和阶段内存差值。
  - 不直接关心内存来源细节。
- `src/perf/runtime-probe.ts`
  - 增加 `memory_api` 能力探针，用于解释为什么内存列可能是 `无确切信息`。
- `src/macros/performance-diagnostics.ts`
  - 负责把不适用字段写成 `不适用`。
  - 继续只写诊断表，不覆盖正式查询结果。

## 数据流

诊断主流程保持不变：

```text
读取查询条件
  -> 读取 OA UsedRange
  -> 解析 OA 表
  -> 读取 ERP UsedRange
  -> 解析 ERP 表
  -> 执行 core 管线并记录阶段指标
  -> 构造诊断输出矩阵
  -> 写入性能诊断结果
```

内存采样流程调整为：

```text
尝试 process.memoryUsage()
  -> 成功：使用 heapUsed 计算阶段差值
  -> 不可用或异常：继续尝试 performance.memory

尝试 performance.memory.usedJSHeapSize
  -> 成功：使用 usedJSHeapSize 计算阶段差值
  -> 不可用、字段不完整或数值异常：返回 无确切信息
```

不根据矩阵行数、单元格数量或字符串长度估算 MB。估算值不能代表运行时真实内存，容易误导性能判断。

## 错误处理

- `process.memoryUsage()` 抛错时，内存采样必须回退为 `无确切信息`，不能影响诊断主流程。
- `performance.memory` 存在但字段异常时，内存采样必须回退为 `无确切信息`。
- 内存采样失败不能覆盖原始业务错误。若诊断读取工作表、解析表头或写表失败，仍按现有错误行输出错误原因。
- 不适用字段统一使用 `不适用`，避免空白字段被误认为采集失败。

## 测试

需要补最小关键测试：

- `getMemorySample()` 继续支持 Node `process.memoryUsage()`。
- 没有 Node API 时，`getMemorySample()` 能读取 `performance.memory.usedJSHeapSize`。
- `performance.memory` 字段缺失、非数字、`NaN`、`Infinity` 时回退 `无确切信息`。
- `memoryDeltaMb()` 对 `performance.memory` 采样结果仍能计算阶段 heap 差值。
- `运行时能力` 行的不适用字段写 `不适用`，不再写空白。
- `结果规模` 行的耗时和内存写 `不适用`。
- 错误行的不适用统计字段写 `不适用`，错误说明保留。

## 伪代码草案

```ts
const NOT_APPLICABLE = "不适用" as const

function getMemorySample(root: unknown = globalThis): MemorySample {
  const nodeSample = tryReadNodeProcessMemory(root)
  if (nodeSample.available) {
    return nodeSample
  }

  const browserSample = tryReadPerformanceMemory(root)
  if (browserSample.available) {
    return browserSample
  }

  return unknownMemorySample()
}

function tryReadNodeProcessMemory(root: unknown): MemorySample {
  const usage = root.process?.memoryUsage
  if (typeof usage !== "function") {
    return unknownMemorySample()
  }

  try {
    const sample = usage()
    if (!isFiniteNumber(sample.heapUsed) || !isFiniteNumber(sample.rss)) {
      return unknownMemorySample()
    }

    return {
      available: true,
      source: "process.memoryUsage",
      heapUsedMb: bytesToMb(sample.heapUsed),
      rssMb: bytesToMb(sample.rss),
    }
  } catch {
    // 为什么这样做：性能诊断不能因为内存 API 不稳定而中断主流程
    return unknownMemorySample()
  }
}

function tryReadPerformanceMemory(root: unknown): MemorySample {
  const memory = root.performance?.memory

  // 为什么这样做：WPS/浏览器不保证暴露 performance.memory，字段不完整时不能猜测
  if (!isFiniteNumber(memory?.usedJSHeapSize)) {
    return unknownMemorySample()
  }

  return {
    available: true,
    source: "performance.memory",
    heapUsedMb: bytesToMb(memory.usedJSHeapSize),
    rssMb: isFiniteNumber(memory.totalJSHeapSize)
      ? bytesToMb(memory.totalJSHeapSize)
      : bytesToMb(memory.usedJSHeapSize),
  }
}

function capabilityRows(capabilities: RuntimeCapability[]): OutputMatrix {
  return capabilities.map((capability) => [
    "运行时能力",
    capability.name,
    NOT_APPLICABLE,
    NOT_APPLICABLE,
    NOT_APPLICABLE,
    NOT_APPLICABLE,
    capability.note,
  ])
}

function resultScaleRow(result: QueryCorePipelineResult): OutputRow {
  return [
    "结果规模",
    "result_rows",
    inputRows,
    outputRows,
    NOT_APPLICABLE,
    NOT_APPLICABLE,
    buildAggregationNote(result),
  ]
}
```

## 风险点 / 边界条件

- `performance.memory` 不是所有 WPS 或浏览器环境都支持；即使本机可用，也不能承诺所有用户都能看到内存数字。
- `performance.memory` 的 `usedJSHeapSize` 只代表 JS heap 口径，不能等同于 WPS 进程总内存。
- 阶段内存差值可能为负数，因为垃圾回收可能发生在阶段内或阶段间；负数不是错误。
- 若 WPS 暴露的 `performance.memory` 字段值异常，必须继续显示 `无确切信息`。
- 本次不增加估算内存、进度条、异步分块、Worker 执行或正式查询耗时写回。
