# 双向查询方向设计

## 目标

在现有 WPS 加载项查询能力上增加“查询方向”选项，让用户每次选择一个起点表来查询 OA 与 ERP 报废差异。

本次设计只扩展查询方向、字段口径、输出列和预验证规则，不改变 WPS 加载项形态，也不新增外部文件导入、弹窗或侧边栏。

新增两个查询方向：

```text
OA金蝶单号查ERP
ERP源单查OA
```

两个方向共用现有差异比较口径：

- 物料不一致仍输出 `OA和ERP都有，但物料明细不一致`。
- 数量不同仍输出 `OA和ERP都有，但数量不同`。
- 金额差只展示，不参与差异类型判断。
- 金额差额仍为 `OA实际预算金额mx合计 - ERP总成本合计`。

## 输入

固定读取现有两张原始表：

```text
查询OA-存货报废申请单
查询ERP-报废明细表
```

OA 表新增必需字段：

```text
金蝶云单据编号
```

OA 表继续使用现有字段：

```text
表单编号
申请日期
公司简称
一级部门
二级部门
物料代码
物料名称
数量
实际预算金额mx
```

ERP 表继续使用现有字段：

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

查询面板输入调整为：

```text
A2 公司简称        B2 用户填写
A3 一级部门        B3 用户填写
A4 二级部门        B4 用户填写
A5 开始日期        B5 用户填写
A6 结束日期        B6 用户填写
A7 查询方向        B7 OA金蝶单号查ERP / ERP源单查OA
A8 运行函数        B8 runScrapVarianceQuery
A9 起输出结果
```

`B7` 为空时默认按 `OA金蝶单号查ERP` 执行。

## 输出

查询结果仍输出到 `查询面板`，从 `A9` 开始写入。

汇总差异列保持现状：

```text
公司简称
一级部门
二级部门
OA数量合计
ERP实发数量合计
数量差额
OA实际预算金额mx合计
ERP总成本合计
金额差额
差异类型摘要
```

明细差异新增两列编号，完整列顺序为：

```text
差异类型
OA表单编号
OA金蝶云单据编号
OA申请日期
ERP出库单号
ERP源单单号
ERP日期
物料编码
物料名称
公司简称
一级部门
二级部门
OA数量合计
ERP实发数量合计
数量差额
OA实际预算金额mx合计
ERP总成本合计
金额差额
备注
```

新增列含义：

- `OA金蝶云单据编号`：来自 OA 表 `金蝶云单据编号`。
- `ERP源单单号`：来自 ERP 表 `源单单号`。

因为输出起点下移且明细列扩展到 19 列，查询输出清理范围调整为：

```text
A9:S200000
```

## 查询方向与筛选口径

筛选条件跟查询方向的起点表走。

### OA金蝶单号查ERP

先筛 OA，再找 ERP。

筛选字段：

```text
OA.申请日期
OA.公司简称
OA.一级部门
OA.二级部门
```

关联关系：

```text
OA.金蝶云单据编号 = ERP.单据编号
```

### ERP源单查OA

先筛 ERP，再找 OA。

筛选字段：

```text
ERP.日期
ERP.区分公司简称
ERP.一级部门
ERP.二级部门
```

关联关系：

```text
ERP.源单单号 = OA.表单编号
```

使用说明和错误提示必须明确 `B2:B6` 的含义会随 `B7` 变化：

```text
OA方向：日期 = OA申请日期，公司 = OA公司简称
ERP方向：日期 = ERP日期，公司 = ERP区分公司简称
```

## 聚合与比较规则

### OA金蝶单号查ERP

起点为 OA，先按查询面板条件筛选 OA 行，再用 `OA.金蝶云单据编号` 查找 ERP `单据编号`。

聚合键：

```text
OA侧：OA.表单编号 + OA.物料代码
ERP侧：OA.表单编号 + ERP.物料编码
```

输出时保留：

```text
OA表单编号：OA.表单编号
OA金蝶云单据编号：OA.金蝶云单据编号
ERP出库单号：ERP.单据编号
ERP源单单号：ERP.源单单号
```

如果 `OA.金蝶云单据编号` 为空，或 ERP 中找不到对应 `ERP.单据编号`，输出：

```text
OA有申请，ERP无出库
```

如果匹配到 ERP 单据，但物料编码不一致，输出：

```text
OA和ERP都有，但物料明细不一致
```

### ERP源单查OA

起点为 ERP，先按查询面板条件筛选 ERP 行，再用 `ERP.源单单号` 回查 OA `表单编号`。

聚合键：

```text
ERP侧：ERP.源单单号 + ERP.物料编码
OA侧：ERP.源单单号 + OA.物料代码
```

输出时保留：

```text
OA表单编号：OA.表单编号，也就是 ERP.源单单号 匹配到的 OA 单号
OA金蝶云单据编号：OA.金蝶云单据编号
ERP出库单号：ERP.单据编号，可多个逗号拼接
ERP源单单号：ERP.源单单号
```

如果 ERP 的 `源单单号` 找不到 OA，输出：

```text
ERP出库对应OA未在当前OA数据中找到
```

备注调整为：

```text
请用 ERP 源单单号回 OA 系统补查，或确认 OA 导出表是否包含该流程。
```

## 错误处理

`B7` 为空时默认使用：

```text
OA金蝶单号查ERP
```

`B7` 不是支持值时，在查询面板输出明确错误：

```text
查询方向不正确：请填写 OA金蝶单号查ERP 或 ERP源单查OA
```

OA 表缺少 `金蝶云单据编号` 时，预验证和查询都报错。原因是 `OA金蝶单号查ERP` 必须依赖该字段，`ERP源单查OA` 结果也需要展示该字段。

ERP 表仍要求 `单据编号`、`源单单号`、`日期` 等现有字段。

`金蝶云单据编号` 第一版按单值处理，不拆分逗号、顿号或换行。

## 预验证规则

预验证同步补充：

```text
OA 缺少 `金蝶云单据编号` -> 错误
OA `金蝶云单据编号` 为空 -> 提醒，不阻断查询
ERP `源单单号` 找不到 OA.表单编号 -> 提醒
```

查询行为：

```text
OA 金蝶单号为空参与 OA金蝶单号查ERP 时 -> 归为 `OA有申请，ERP无出库`
```

## 测试策略

核心逻辑测试：

```text
OA金蝶单号查ERP：
- B2:B6 按 OA 字段筛选。
- OA.金蝶云单据编号 = ERP.单据编号 能匹配到 ERP。
- OA 金蝶单号为空时，输出 `OA有申请，ERP无出库`。
- ERP 单据匹配但物料不同，输出 `OA和ERP都有，但物料明细不一致`。
- 数量不同输出 `OA和ERP都有，但数量不同`。
- 金额不同但数量一致时，差异类型仍是 `OA和ERP都有，数量一致`。

ERP源单查OA：
- B2:B6 按 ERP 字段筛选。
- ERP.源单单号 = OA.表单编号 能匹配到 OA。
- ERP 源单找不到 OA 时，输出 `ERP出库对应OA未在当前OA数据中找到`。
- ERP 多张单据同一个源单和物料时，ERP出库单号逗号拼接、数量金额聚合。
```

宏面板测试：

```text
- setupQueryPanel 写入 `查询方向` 到 A7。
- B7 为空时默认 `OA金蝶单号查ERP`。
- B7 无效时输出明确错误。
- 输出从 A9 开始。
- 清理范围覆盖 A9:S200000。
```

预验证测试：

```text
- OA 缺少 `金蝶云单据编号` 报错误。
- OA `金蝶云单据编号` 为空报提醒。
- ERP `源单单号` 找不到 OA.表单编号 仍报提醒。
```

## 风险点 / 边界条件

- `B2:B6` 的字段含义随查询方向变化，使用说明必须写清楚，否则容易误解日期范围。
- `ERP源单查OA` 会以 ERP 日期作为筛选依据，和旧版以 OA 为主线的口径不同，测试里要覆盖这一点。
- `OA金蝶单号查ERP` 中 `金蝶云单据编号` 为空时归入 `OA有申请，ERP无出库`，但预验证会额外提醒，避免用户误以为一定是 ERP 缺数据。
- `金蝶云单据编号` 第一版只按单值匹配，如果实际导出出现多个单号拼在一个单元格，本版不会拆分。
- 明细列从 17 列扩展到 19 列后，清理范围和宏测试必须同步，否则旧列可能残留。
- 金额差只展示，不参与差异类型判断，避免把 OA 预算金额和 ERP 成本口径差异误判成主异常类型。

## 伪代码草案

```ts
// 目标：让同一套查询管线支持两个方向，每次由查询面板 B7 决定起点和关联字段。
// 输入：
// - oaRows: OA 原始表解析结果
// - erpRows: ERP 原始表解析结果
// - filters: 查询面板 B2:B6
// - queryDirection: 查询面板 B7，空值默认 OA金蝶单号查ERP
// 输出：
// - summaryRows: 公司/部门汇总差异
// - detailRows: 带 OA 金蝶单号、ERP 源单号、数量金额差异的明细

type QueryDirection = "OA金蝶单号查ERP" | "ERP源单查OA";

function runQueryCorePipeline(oaRows, erpRows, filters, queryDirection) {
  const direction = parseQueryDirection(queryDirection);

  if (direction === "OA金蝶单号查ERP") {
    return runOaKingdeeToErpPipeline(oaRows, erpRows, filters);
  }

  return runErpSourceToOaPipeline(oaRows, erpRows, filters);
}

function runOaKingdeeToErpPipeline(oaRows, erpRows, filters) {
  // 为什么这样做：这个方向以 OA 为起点，筛选条件必须先约束 OA 申请集合。
  const oaGroupedRows = buildOaRowsByOaFilters(oaRows, filters);

  // 用 ERP.单据编号 建索引，便于 OA.金蝶云单据编号 直接查 ERP。
  const erpByDocNumber = buildErpRowsByDocNumber(erpRows);

  const matchedErpRows = new Map();

  for (const oa of oaGroupedRows.values()) {
    if (!oa.kingdeeDocNumber) {
      // compare 阶段会把缺 ERP 的 OA 输出为 OA有申请，ERP无出库。
      continue;
    }

    const erpRowsForDoc = erpByDocNumber.get(oa.kingdeeDocNumber);
    addMatchingErpRowsByMaterial(matchedErpRows, oa.formNumber, erpRowsForDoc);
  }

  const detailRows = compareRows(oaGroupedRows, matchedErpRows, new Map());
  const summaryRows = buildSummaryRows(detailRows);
  return buildPipelineResult(summaryRows, detailRows);
}

function runErpSourceToOaPipeline(oaRows, erpRows, filters) {
  // 为什么这样做：这个方向以 ERP 为起点，筛选条件约束 ERP 出库集合。
  const erpGroupedRows = buildErpRowsByErpFilters(erpRows, filters);
  const sourceFormNumbers = collectSourceFormNumbers(erpGroupedRows);

  // 只回查 ERP 当前集合涉及的 OA，避免全量 OA 造成无关结果。
  const oaGroupedRows = buildOaRowsForFormNumbers(oaRows, sourceFormNumbers);

  const erpForOa = rekeyErpRowsBySourceFormAndMaterial(erpGroupedRows);
  const erpOnlyRows = buildErpRowsMissingOa(erpGroupedRows, oaGroupedRows);

  const detailRows = compareRows(oaGroupedRows, erpForOa, erpOnlyRows);
  const summaryRows = buildSummaryRows(detailRows);
  return buildPipelineResult(summaryRows, detailRows);
}

function parseQueryDirection(rawValue) {
  const text = normalizeText(rawValue);

  if (!text) {
    return "OA金蝶单号查ERP";
  }

  if (text === "OA金蝶单号查ERP" || text === "ERP源单查OA") {
    return text;
  }

  throw new Error("查询方向不正确：请填写 OA金蝶单号查ERP 或 ERP源单查OA");
}
```
