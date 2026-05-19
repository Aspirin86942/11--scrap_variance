# WPS 源表连续列组读取优化设计

## 目标

本次优化目标是在上一轮“矩形窄读”的基础上，把 OA/ERP 源表读取主策略升级为“连续列组读取”。

用户提供的真实 WPS 诊断结果显示，上一轮优化已经启用，但 `narrow_rectangle` 仍然会读取大量非必需列：

- OA：`A1:AK2879` -> `A1:AJ2879`，只少读 1 列。
- ERP：`A1:AR4994` -> `C1:AI4994`，少读 11 列，但仍读取 33 列。
- 实际业务只需要 OA 10 个字段、ERP 10 个字段。

因此，本轮目标是：

- 以“只读必需字段所在连续列组”为主策略。
- 不再让 `MAX_GROUPED_RANGES = 4` 这类固定列组数量上限阻止真实数据进入分组读取主路径。
- 每个连续列组独立批量读取，读取后按字段定义顺序拼接为下游矩阵。
- 不改变业务语义、字段顺序、金额/数量计算、差异判断、异常分类和输出格式。
- 任意列组读取失败、返回结构异常或行数不一致时，整体回退 `UsedRange`。
- 性能诊断保留可审计信息，记录读取策略、列组数量、读取列数、总行数和回退原因。

本次不引入新的第三方依赖，不改变 WPS 外部交互入口，不改变查询弹窗和输出页行为。

## 输入

### 源工作表

继续读取现有源表：

```text
查询OA-存货报废申请单
查询ERP-报废明细表
```

源表可以包含前置说明行、额外列、尾部空列和格式污染。实现不能要求用户清理源文件。

### 字段契约

OA 侧仍以 `OA_REQUIRED_HEADERS` 为唯一读取字段契约：

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

ERP 侧仍以 `ERP_REQUIRED_HEADERS` 为唯一读取字段契约：

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

字段名和顺序是业务契约。本轮优化不能新增、删除、重命名或重排字段。

### 上下文信息

读取逻辑继续接收：

- `WpsSheet`
- `requiredHeaders`
- `minMatchCount`
- `maxScanRows`

读取逻辑继续从 `sheet.UsedRange` 获取：

- 起始行 `Row`
- 起始列 `Column`
- 行数 `Rows.Count`
- 列数 `Columns.Count`
- 地址 `Address`

## 输出

### 成功输出

成功时返回与现有读取接口兼容的结构：

- `matrix`: 拼接后的源表矩阵。
- `usedRangeStartRow`: 下游行号计算需要的真实起始行。
- `diagnostics`: 读取诊断信息。

拼接后的 `matrix` 必须满足：

- 第 1 行为表头行。
- 表头顺序严格等于 `requiredHeaders`。
- 后续每行按同一字段顺序排列。
- 行数从真实表头行开始到 UsedRange 末行，保持现有数据行范围语义。

### 回退输出

如果任意分组读取步骤失败，则整体回退当前全量 `UsedRange` 读取：

- `diagnostics.strategy = "used_range_fallback"`
- `diagnostics.fallbackReason` 记录分组读取失败原因。
- `usedRangeRows` / `usedRangeCols` 优先使用 WPS UsedRange 元数据。
- `readRows` / `readCols` 记录实际回退矩阵规模。

### 副作用

读取函数本身不写工作表、不写文件、不改配置。

性能诊断宏会继续写入 `性能诊断结果` 工作表，并新增或强化说明信息。

## 运行环境

运行环境保持现状：

- WPS JS / Office 自动化受限运行环境。
- TypeScript 源码。
- esbuild 打包为 `main.js`。
- Vitest 本地测试。
- Linux 本地开发环境。

WPS 运行时代码不得依赖 Node-only API，例如 `fs`、`path`、`process`、`require()`。

## 架构

### 改动边界

核心改动集中在：

```text
src/wps-api/read-sheet-data.ts
```

该模块继续承担 WPS Range 读取、读取策略选择、矩阵拼接和 UsedRange 回退职责。

性能诊断继续在：

```text
src/macros/performance-diagnostics.ts
```

消费读取诊断信息并写出诊断行。

正式查询、预检、查询建议、展开物料等上层调用继续通过 `readSheetTable()` 共享同一读取路径。不得在上层为 OA/ERP 复制读取策略。

### 策略命名

读取策略建议收敛为：

```text
grouped_ranges
used_range_fallback
```

上一轮已有 `narrow_rectangle` 可以保留为兼容诊断枚举，但本轮主路径不再优先生成一个大矩形。即使必需字段刚好连续，`grouped_ranges` 也可以只有 1 个连续列组。

### 连续列组

连续列组从必需字段真实列号生成：

```text
required columns: A, B, C, M, N, O, Z, AA, AB, AC
groups: A:C, M:O, Z:AC
```

如果字段完全分散，最多约 10 个单列组。由于当前必需字段约 10 个，调用次数可控，可以接受。

不再使用 `MAX_GROUPED_RANGES = 4` 作为进入主路径的硬限制。实现可以删除该常量，或者只保留为测试/注释中的历史说明，不得让它阻止真实数据使用分组读取。

### 矩阵拼接

每个连续列组读取后，必须按字段定义顺序拼接，而不是按工作表自然列顺序直接交给下游。

原因：

- 下游业务契约来自 `OA_REQUIRED_HEADERS` / `ERP_REQUIRED_HEADERS`。
- 分组读取可能返回 `A:C,M:O,Z:AC`，自然列顺序不一定等于 required header 定义顺序。
- 显式按 required header 顺序拼接可以冻结字段顺序，降低后续输出和聚合回归风险。

## 数据流

### 正式查询

```text
readSheetTable(sheet, requiredHeaders, minMatchCount, maxScanRows)
  -> readSheetTableWithDiagnostics()
  -> readSheetMatrixOptimized()
  -> 读取 UsedRange 元数据
  -> 读取表头探测范围
  -> detectHeaderRow()
  -> buildGroupedReadPlan()
  -> readGroupedRanges()
  -> stitchRequiredHeaderMatrix()
  -> parseTableFromMatrix()
  -> runQueryCorePipeline() 或单据对比逻辑
```

### 性能诊断

```text
runPerformanceDiagnostics()
  -> readSheetMatrixOptimized(OA)
  -> 写出 oa_read_strategy / oa_used_range / oa_read_range
  -> parse_oa_table
  -> readSheetMatrixOptimized(ERP)
  -> 写出 erp_read_strategy / erp_used_range / erp_read_range
  -> parse_erp_table
  -> core pipeline
  -> write_diagnostics_sheet
```

性能诊断必须反映正式查询同一读取函数的真实行为。

## 错误处理

### 必须整体回退的情况

以下任意情况发生时，分组读取整体失败并回退 `UsedRange`：

- 表头探测 Range 读取失败。
- 表头识别失败。
- 任意列组 Range 读取失败。
- 任意列组返回无法标准化为矩阵的结构。
- 任意列组行数与预期行数不一致。
- 拼接后矩阵为空或没有任何非空行。
- 拼接过程中发现必需字段列映射缺失。

回退策略保持现状：

- 先尝试 `readUsedRangeMatrix()`。
- 如果 UsedRange 也失败，则抛出当前可读错误。
- 不静默吞掉原始分组读取失败原因，原因写入 `fallbackReason`。

### 不改变的异常语义

本轮不改变：

- 表头识别的错误类型。
- 预验证问题分类。
- 金额/数量解析错误。
- 查询输出错误提示主体。
- `HeaderDetectionError` 的语义。

## 诊断与日志

性能诊断继续写出：

```text
读表策略
读表范围
阶段耗时
结果规模
```

主策略成功时：

```text
读表策略 | oa_read_strategy | 不适用 | 不适用 | 不适用 | 不适用 | grouped_ranges；列组=3；读取列=10；总行=2879
读表范围 | oa_used_range | 2879 | 37 | 不适用 | 不适用 | A1:AK2879
读表范围 | oa_read_range | 2879 | 10 | 不适用 | 不适用 | A1:C2879,M1:O2879,Z1:AC2879
```

回退时：

```text
读表策略 | oa_read_strategy | 不适用 | 不适用 | 不适用 | 不适用 | used_range_fallback；原因：...
读表范围 | oa_used_range | 2879 | 37 | 不适用 | 不适用 | A1:AK2879
读表范围 | oa_read_range | 2879 | 37 | 不适用 | 不适用 | A1:AK2879
```

说明字段继续走 cell-safe 处理：

- 折叠换行和重复空白。
- 限制长度。
- 公式敏感前缀加 `'`。

## 测试策略

### 单元测试

在 `tests/wps-api/read-sheet-data.test.ts` 中覆盖：

- 必需字段连续时使用 1 个 grouped range，输出字段顺序等于 `requiredHeaders`。
- 必需字段分散时使用多个 grouped ranges，不读取大矩形。
- 字段定义顺序和工作表自然列顺序不一致时，拼接矩阵仍按 `requiredHeaders` 输出。
- UsedRange 不从 `A1` 开始时，列组地址和 `_rowNumber` 仍正确。
- 任意列组读取失败时，整体回退 UsedRange。
- 任意列组行数不一致时，整体回退 UsedRange。
- fallback 诊断保留 UsedRange 元数据行列数。

### 宏路径测试

在正式查询相关测试中覆盖：

- `runCurrentSheetQuery()` 使用 grouped ranges，不读取完整 UsedRange。
- 真实查询输出行数和关键字段内容不变。
- 性能诊断写出 `grouped_ranges`、列组数量、读取列数和 range 描述。

### 构建与回归

完成实现后必须执行：

```bash
npm run build
npm test
npm run bench -- --no-json
git diff --check
```

并确认 `main.js` 与源码同步。

## 验收方式

本地验收：

- TypeScript 类型检查通过。
- 全量 Vitest 通过。
- benchmark 命令通过。
- `main.js` bundle 同步测试通过。
- 工作区无非预期生成物。

WPS 真实宿主验收：

- 性能诊断中 OA/ERP 主策略显示 `grouped_ranges`，除非真实读取失败后 fallback。
- `oa_read_range` / `erp_read_range` 显示多个连续列组，或在字段刚好连续时显示单个列组。
- `read_range` 的读取列数应接近必需字段数，例如 10 列，而不是 33 或 36 列。
- 业务输出行数、差异类型、金额、数量与上一版保持一致。
- 如果 WPS 对某些分组 Range 读取不兼容，应自动回退 UsedRange 并显示 fallback 原因。

## 风险点 / 边界条件

- 多次 `Range()` 调用可能在极小表上不如单个矩形读快。但真实瓶颈来自几千行大表的无关列搬运，优先减少读取单元格数。
- WPS 对不连续 Range 的支持不稳定，因此本设计不使用一个 Union/逗号 Range 调用，而是逐个连续列组批量读取。
- 分组读取返回的矩阵可能因为尾部空行/空列被宿主裁剪，必须校验行数，不一致则回退。
- 表头探测仍需要读 UsedRange 前若干行的完整宽度。这个成本相对读取全量数千行可接受。
- 诊断中的 `readRows/readCols` 表示实际拼接矩阵规模，`usedRangeRows/usedRangeCols` 表示宿主 UsedRange 元数据，两者不能混淆。

## 伪代码草案

```ts
type SheetReadStrategy = "grouped_ranges" | "used_range_fallback";

interface ColumnGroup {
  startCol: number;
  endCol: number;
}

interface GroupedReadPlan {
  startRow: number;
  rowCount: number;
  groups: ColumnGroup[];
  requiredColumnsByHeader: Map<string, number>;
  requiredHeaders: string[];
}

function readSheetMatrixOptimized(
  sheet: WpsSheet,
  requiredHeaders: string[],
  minMatchCount: number,
  maxScanRows: number,
): OptimizedMatrixReadResult {
  const usedRange = readUsedRangeDimensions(sheet.UsedRange);

  try {
    // 先读前若干行完整宽度，只用于找表头；不读取全量数据。
    const probeMatrix = readRangeMatrix(sheet, {
      startRow: usedRange.startRow,
      startCol: usedRange.startCol,
      rowCount: Math.min(maxScanRows, usedRange.rowCount),
      colCount: usedRange.colCount,
    });

    const header = detectHeaderRow(probeMatrix, requiredHeaders, {
      minMatchCount,
      maxScanRows,
      usedRangeStartRow: usedRange.startRow,
    });
    if (!header.ok) {
      throw new HeaderDetectionError(header);
    }

    const plan = buildGroupedReadPlan(usedRange, header, requiredHeaders);
    const groupMatrices = readGroupedRanges(sheet, plan);

    // 按 requiredHeaders 顺序重建矩阵，冻结字段顺序，避免下游业务感知列组布局。
    const matrix = stitchRequiredHeaderMatrix(plan, groupMatrices);
    validateGroupedMatrix(matrix, plan.rowCount, requiredHeaders.length);

    return {
      matrix,
      usedRangeStartRow: plan.startRow,
      diagnostics: {
        strategy: "grouped_ranges",
        usedRangeAddress: usedRange.address,
        usedRangeRows: usedRange.rowCount,
        usedRangeCols: usedRange.colCount,
        readRangeDescription: describeGroups(plan.groups, plan.startRow, plan.rowCount),
        readRows: matrix.length,
        readCols: requiredHeaders.length,
        groupCount: plan.groups.length,
      },
    };
  } catch (groupedReadError) {
    // 分组读是性能优化，不是业务前置条件；失败时必须保可用。
    const fallback = readUsedRangeMatrix(sheet);
    return {
      matrix: fallback.matrix,
      usedRangeStartRow: fallback.usedRangeStartRow,
      diagnostics: {
        strategy: "used_range_fallback",
        usedRangeAddress: usedRange?.address ?? "无确切信息",
        usedRangeRows: usedRange?.rowCount ?? fallback.matrix.length,
        usedRangeCols: usedRange?.colCount ?? matrixWidth(fallback.matrix),
        readRangeDescription: usedRange?.address ?? "UsedRange.Value2",
        readRows: fallback.matrix.length,
        readCols: matrixWidth(fallback.matrix),
        fallbackReason: errorMessage(groupedReadError),
      },
    };
  }
}

function buildGroupedReadPlan(
  usedRange: RangeDimensions,
  header: HeaderDetectionSuccess,
  requiredHeaders: string[],
): GroupedReadPlan {
  const requiredColumns = requiredHeaders.map((field) => {
    const relativeCol = header.columnIndex[field];
    if (relativeCol === undefined) {
      throw new Error(`缺少必需字段列映射：${field}`);
    }
    return usedRange.startCol + relativeCol;
  });

  return {
    startRow: usedRange.startRow + header.headerRowIndex,
    rowCount: usedRange.rowCount - header.headerRowIndex,
    groups: mergeAdjacentColumns(requiredColumns),
    requiredColumnsByHeader: mapHeadersToAbsoluteColumns(requiredHeaders, requiredColumns),
    requiredHeaders,
  };
}

function stitchRequiredHeaderMatrix(
  plan: GroupedReadPlan,
  groupMatrices: Map<string, WpsMatrix>,
): WpsMatrix {
  const output: WpsMatrix = [];

  for (let rowIndex = 0; rowIndex < plan.rowCount; rowIndex += 1) {
    const row = plan.requiredHeaders.map((header) => {
      const absoluteCol = plan.requiredColumnsByHeader.get(header);
      const group = findGroupForColumn(plan.groups, absoluteCol);
      const matrix = groupMatrices.get(groupKey(group));
      const relativeColInGroup = absoluteCol - group.startCol;
      return matrix?.[rowIndex]?.[relativeColInGroup] ?? "";
    });
    output.push(row);
  }

  return output;
}
```

