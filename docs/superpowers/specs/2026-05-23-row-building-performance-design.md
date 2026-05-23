# 输出页 Row Building 性能优化设计

## 目标

本轮目标是优化三张输出页的 core row-building 性能，同时保持业务输出完全不变。

当前 benchmark 已经把正式查询、Node benchmark 和 WPS 性能诊断对齐到同一套输出页查询执行器。最新压力结果显示，主要瓶颈不在矩阵转换，而在 row-building：

```text
200k variance_summary build_variance_summary_rows 约 2477ms
200k oa_doc_compare   build_oa_doc_compare_rows   约 2235ms
200k erp_doc_compare  build_erp_doc_compare_rows  约 2287ms
```

其中 `variance_summary` 最重，因为它先构造 doc compare 结果，再从展示用的 compare rows 反推部门汇总状态。这个设计保证了规则一致，但引入了重复解析和重复查找。

本轮采用低风险路线：

- 先增加细分指标，确认 row-building 内部真正耗时点。
- 再优化 `doc-compare` 和 `department-variance-summary` 的内部数据传递。
- 保持三张输出页的 worksheet 矩阵完全不变。
- 不引入 Worker、异步分块、外部缓存或大型依赖。
- 不改变金额、数量、匹配、分类、排序、空值或输出字段规则。

## 输入

### Core 输入

优化范围继续使用当前核心输入：

- `oaRows`: 已解析的 OA 源表行。
- `erpRows`: 已解析的 ERP 源表行。
- `queryState`: 查询条件和查询方向。
- `kind`: 当前输出页类型：
  - `variance_summary`
  - `oa_doc_compare`
  - `erp_doc_compare`
- `metrics`: 可选阶段指标记录器。

这些输入由 `src/core/output-query-runner.ts` 承接。core 模块不得直接访问 WPS 对象模型。

### 业务边界输入

必须保留现有业务边界：

- 查询方向决定当前以 OA 还是 ERP 为主视角。
- `报废差异汇总` 继续复用 doc compare 的匹配语义。
- `OA视角单据对比` 和 `ERP视角单据对比` 的明细行、物料行和汇总行结构不变。
- 金额和数量继续使用现有 `decimal.js-light` 与现有舍入工具。
- 当前 `amountDiff` 的展示语义不改变统计口径。

## 输出

### 用户可见输出

三张业务输出页的输出契约不变：

- 表头不变。
- 列顺序不变。
- 行排序不变。
- 空值展示不变。
- 数量和金额展示不变。
- 无结果提示不变。
- WPS 批量写入策略不变。

本轮可以新增或调整内部类型，但不能要求用户重新理解输出表。

### 性能诊断输出

`npm run bench` 和 WPS `性能诊断结果` 需要能看到更细的 row-building 阶段。

建议新增阶段名：

```text
build_primary_doc_groups
build_counterpart_doc_groups
build_doc_compare_summary_rows
build_doc_compare_material_rows
build_summary_document_set
classify_summary_rows
build_summary_group_rows
```

阶段名可以带输出页前缀或说明字段，例如：

```text
output=variance_summary
output=oa_doc_compare
output=erp_doc_compare
```

如果某个阶段在某个输出页不适用，不需要写虚假耗时行。

### 内部输出

`doc-compare` 可以新增内部 metadata，用于让 summary 直接消费业务状态，而不是从展示行反推。

建议内部结构：

```ts
interface DocCompareSummaryItem {
  summaryKey: string;
  row: DocCompareRow;
  materialRows: DocCompareMaterialRow[];
  meta: DocCompareSummaryMeta;
}

interface DocCompareSummaryMeta {
  hasMatchedCounterpart: boolean;
  hasMaterialMismatch: boolean;
  primaryQuantity: Decimal;
  primaryAmount: Decimal;
  counterpartQuantity: Decimal;
  counterpartAmount: Decimal;
  quantityDiff: Decimal;
  amountDiff: Decimal;
}
```

字段名可以在实施时按现有类型命名微调，但必须满足两个约束：

- 展示行仍由现有 `DocCompareRow` / material rows 生成。
- 部门汇总分类和金额数量汇总不再依赖字符串 split 或展示值反解析。

## 运行环境

运行环境保持现状：

- Linux 本地开发。
- npm 包管理器。
- TypeScript + esbuild。
- Vitest 单元测试。
- WPS JS 加载项运行环境。
- Node benchmark 只测 core 和矩阵构建，不模拟 WPS Range IO。

WPS/browser 运行时代码不得引入 Node-only API。新增性能指标逻辑必须继续通过现有 `src/perf/metrics.ts` 抽象运行。

## 架构

### 当前结构

当前核心路径：

```text
src/core/output-query-runner.ts
  -> kind=variance_summary
       -> buildDepartmentVarianceSummaryRows()
            -> buildOaDocCompare() / buildErpDocCompare()
                 -> buildDocCompareResult()
            -> buildRowsFromDocCompare()
  -> kind=oa_doc_compare
       -> buildOaDocCompare()
  -> kind=erp_doc_compare
       -> buildErpDocCompare()
```

当前问题不是职责完全错误，而是 summary 侧为了复用 doc compare 规则，使用了展示结果作为中间数据：

- 从 `DocCompareRow` 的数量和金额字段重新构造 Decimal。
- 从逗号拼接的 counterpart doc number 字符串判断是否匹配。
- 通过 `buildMaterialRowsForDocSummary()` 取得物料行副本，再判断物料形态是否不一致。
- 对 summary 不需要展示的物料行也承担了部分构造和查找成本。

这些成本在小数据量下可以接受，但在 200k 规模下会放大。

### 目标结构

目标结构是保留现有模块边界，但把“展示数据”和“业务汇总状态”分开：

```text
src/core/doc-compare.ts
  -> buildDocCompareResult()
       -> rows: DocCompareRow[]
       -> materialRowsBySummaryKey: Map<string, DocCompareMaterialRow[]>
       -> summaryItems: DocCompareSummaryItem[]

src/core/department-variance-summary.ts
  -> buildDepartmentVarianceSummaryRows()
       -> consume summaryItems meta
       -> build department summary rows
```

这样两张 compare 输出页仍使用原有展示 rows；汇总页使用同一轮比较得到的 metadata，避免从字符串和展示数字反推业务状态。

### 细分指标结构

指标应尽量放在核心 builder 的边界，而不是散落在 WPS 宏里。建议 `output-query-runner` 仍负责最外层阶段，doc compare 和 summary 可通过可选 recorder 记录内部阶段：

```ts
interface RowBuildingMetrics {
  measure<T>(name: string, inputRows: number, action: () => T): T;
}
```

实施时可以复用现有 `MetricsRecorder`，不需要新增一套独立指标系统。

### 可选第二阶段：标准化源行

如果细分指标证明 normalize、字段读取或 Decimal 构造是主要成本，再引入 normalized row：

```ts
interface NormalizedScrapRow {
  docNumber: string;
  counterpartDocNumber: string;
  department: string;
  dateKey: string;
  materialCode: string;
  materialName: string;
  spec: string;
  quantity: Decimal;
  amount: Decimal;
}
```

这一步不是本轮第一目标。原因是源行标准化会触碰日期、空值、金额解析边界，正确性风险高于 metadata 优化。只有 benchmark 证明它值得做时，才进入单独设计或后续计划。

## 数据流

### Compare 输出页数据流

```text
OA/ERP rows
  -> build primary doc groups
  -> build counterpart doc groups
  -> match counterpart docs and materials
  -> build DocCompareRow summary rows
  -> build material rows
  -> build output matrix
```

compare 页的输出矩阵仍由现有 row-to-values 函数生成。

### Summary 输出页数据流

```text
OA/ERP rows
  -> build doc compare result with summary metadata
  -> iterate summaryItems
  -> classify from metadata
  -> aggregate by department
  -> build DepartmentVarianceSummaryRow[]
  -> build output matrix
```

summary 不再从展示行反推这些信息：

- 是否有匹配对方单据。
- 是否有物料差异。
- 数量差异 Decimal。
- 金额差异 Decimal。

## 错误处理

本轮不新增新的用户级错误类型。内部优化必须继续遵守现有错误策略：

- core builder 不吞异常。
- WPS 宏入口负责把异常转换为可读提示。
- benchmark 遇到非法参数或运行失败应退出非零状态码。
- 性能诊断拿不到内存时继续写 `无确切信息`，不能写猜测值。

metadata 缺失或结构不一致属于实现错误，应由测试覆盖，不能在运行时静默跳过。

## 测试策略

### 单元测试

重点覆盖这些行为：

- `buildOaDocCompare()` 输出行和物料行不变。
- `buildErpDocCompare()` 输出行和物料行不变。
- `buildDepartmentVarianceSummaryRows()` 在改用 metadata 后输出不变。
- 未匹配单据仍分类一致。
- 有匹配但数量差异仍分类一致。
- 有物料形态差异仍分类一致。
- OA 视角和 ERP 视角都覆盖。

测试应优先落在现有 `tests/core/` 下，不需要引入 WPS 运行环境。

### Benchmark 验证

至少执行：

```bash
npm run bench -- --no-json
npm run bench -- --scale stress --no-json
```

验收不是固定承诺某个百分比，而是要求报告能说明：

- row-building 内部每个子阶段耗时。
- 200k 下 `variance_summary` 是否下降。
- compare 两张表没有明显回退。
- matrix 阶段仍然不是主要瓶颈。

### 构建与回归

完成实现后必须执行：

```bash
npm test
npm run build
git diff --check
```

因为 `main.js` 是提交产物，任何影响 runtime 的 TypeScript 修改都必须通过 `npm run build` 同步。

## 伪代码草案

```ts
// 输入：已解析 OA/ERP rows、查询状态、输出方向、可选指标记录器
// 输出：compare 页继续返回展示 rows；summary 页额外使用 metadata 汇总

function buildDocCompareResult(input: DocCompareInput): DocCompareResult {
  const primaryGroups = metrics.measure("build_primary_doc_groups", input.primaryRows.length, () => {
    return buildPrimaryDocGroups(input.primaryRows, input.queryState);
  });

  const counterpartGroups = metrics.measure("build_counterpart_doc_groups", input.counterpartRows.length, () => {
    return buildCounterpartDocGroups(input.counterpartRows);
  });

  const summaryItems: DocCompareSummaryItem[] = [];
  const rows: DocCompareRow[] = [];
  const materialRowsBySummaryKey = new Map<string, DocCompareMaterialRow[]>();

  metrics.measure("build_doc_compare_summary_rows", primaryGroups.size, () => {
    for (const primaryDoc of primaryGroups.values()) {
      const matched = buildMatchedCounterpart(primaryDoc, counterpartGroups);
      const summaryRow = buildSummaryRow(primaryDoc, matched);
      const materialRows = buildMaterialRows(primaryDoc, matched);

      const item: DocCompareSummaryItem = {
        summaryKey: summaryRow.summaryKey,
        row: summaryRow,
        materialRows,
        meta: {
          // 这里传业务状态，不从展示字符串反推
          hasMatchedCounterpart: matched.docCount > 0,
          hasMaterialMismatch: detectMaterialMismatch(primaryDoc, matched),
          primaryQuantity: primaryDoc.totalQuantity,
          primaryAmount: primaryDoc.totalAmount,
          counterpartQuantity: matched.totalQuantity,
          counterpartAmount: matched.totalAmount,
          quantityDiff: primaryDoc.totalQuantity.minus(matched.totalQuantity),
          amountDiff: primaryDoc.totalAmount.minus(matched.totalAmount),
        },
      };

      summaryItems.push(item);
      rows.push(summaryRow);
      materialRowsBySummaryKey.set(summaryRow.summaryKey, materialRows);
    }
  });

  return { rows, materialRowsBySummaryKey, summaryItems };
}

function buildDepartmentVarianceSummaryRows(input: DepartmentSummaryInput): DepartmentVarianceSummaryRow[] {
  const compareResult = buildDocCompareResult(input);
  const groups = new Map<string, DepartmentAccumulator>();

  metrics.measure("classify_summary_rows", compareResult.summaryItems.length, () => {
    for (const item of compareResult.summaryItems) {
      const classification = classifyFromMeta({
        hasMatchedCounterpart: item.meta.hasMatchedCounterpart,
        hasMaterialMismatch: item.meta.hasMaterialMismatch,
        quantityDiff: item.meta.quantityDiff,
      });

      addToDepartmentAccumulator(groups, item.row.departmentKey, {
        classification,
        primaryQuantity: item.meta.primaryQuantity,
        primaryAmount: item.meta.primaryAmount,
        counterpartQuantity: item.meta.counterpartQuantity,
        counterpartAmount: item.meta.counterpartAmount,
        quantityDiff: item.meta.quantityDiff,
        amountDiff: item.meta.amountDiff,
      });
    }
  });

  return metrics.measure("build_summary_group_rows", groups.size, () => {
    return buildDepartmentRows(groups);
  });
}
```

## 风险点 / 边界条件

- 不能让 `报废差异汇总` 和 compare 页对同一单据给出不同分类。
- 不能把内部 metadata 暴露成新的 worksheet 列。
- 不能改变 `materialRowsBySummaryKey` 的外部行为，避免影响 compare 展示。
- 不能改变 Decimal 舍入和展示时机。
- 不能为了性能跳过物料差异判断。
- 不能在 WPS 运行时引入 Node API。
- 不能只优化 Node benchmark 而让 WPS 性能诊断失真。

## 验收方式

本轮验收以“正确性冻结 + 可量测收益”为准：

```bash
npm test
npm run build
npm run bench -- --no-json
npm run bench -- --scale stress --no-json
git diff --check
```

实现后需要在交付说明中列出 benchmark 对比，至少包含：

- 10k 默认结果。
- 50k 默认结果。
- 200k stress 结果。
- `variance_summary` row-building 改善情况。
- compare 两张表是否回退。

如果 benchmark 没有明显改善，但细分指标定位到新的主瓶颈，也可以接受为第一阶段结果；下一阶段必须基于指标选择是否做 normalized rows 或 summary 专用聚合器。
