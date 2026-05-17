# 查询明细日期输出设计

## 目标

在 `查询面板` 的“明细差异”结果中同时展示 OA 和 ERP 两方日期，让用户能直接看到差异明细对应的业务日期。

本次变更只扩展查询明细输出字段，不改变预验证规则、筛选口径、差异类型判断、汇总分组口径或 WPS 加载项运行方式。项目继续保持 TypeScript + esbuild 架构，性能约束仍然优先：批量读、内存聚合、批量写、固定范围一次清理。

## 输入

- OA 原始表：`查询OA-存货报废申请单`
  - 日期来源字段：`申请日期`
  - 仍通过 `UsedRange.Value2` 批量读取。
- ERP 原始表：`查询ERP-报废明细表`
  - 日期来源字段：`日期`
  - 仍通过 `UsedRange.Value2` 批量读取。
- 查询面板筛选条件：`B2:B6`
  - 仍保留现有行为：`setupQueryPanel()` 不覆盖 `B2:B6`。

## 输出

只调整“明细差异”列，不调整“汇总差异”列。

明细差异新增两列：

- `OA申请日期`
- `ERP日期`

推荐列顺序：

```text
差异类型
OA表单编号
OA申请日期
ERP出库单号
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

日期展示规则：

- 日期统一使用当前日期工具标准化后的 `YYYY-MM-DD` 文本。
- 同一聚合明细里如果出现多个不同日期，去重后按出现顺序用 `、` 拼接。
- `OA有申请，ERP无出库`：`ERP日期` 为空。
- `ERP出库对应OA未在当前OA数据中找到`：`OA申请日期` 为空。
- `OA和ERP都有，但物料明细不一致`：有哪一侧就展示哪一侧日期。

因为明细差异从 15 列扩展到 17 列，查询输出固定清理范围同步从：

```text
A8:O200000
```

扩展为：

```text
A8:Q200000
```

仍然必须是一次 `Range(address).ClearContents()`，不允许逐格清理。

## 数据流

1. `buildOaRows()` 在遍历 OA 行时解析 `申请日期`，并把标准化日期加入 OA 聚合行。
2. `buildErpRowsForOa()` / `buildErpOnlyRows()` 在遍历 ERP 行时解析 `日期`，并把标准化日期加入 ERP 聚合行。
3. `compareRows()` 生成 `DetailRow` 时，把 OA 聚合日期和 ERP 聚合日期分别写入 `oaDate` / `erpDate`。
4. `detailRowsToValues()` 根据新 `DETAIL_HEADERS` 输出 17 列二维数组。
5. WPS 写入层继续通过 `writeMatrixBulkOrChunks()` 批量写回。

## 错误处理

- 日期解析仍沿用现有 `normalizeDateKey()`。
- 如果原始日期格式非法，仍按当前查询行为抛出明确错误，并由查询宏写入 `查询面板` 错误行。
- 本次不新增容错规则，也不把非法日期静默为空。

## 性能约束

- 不增加任何 WPS 单元格逐格读取。
- 不增加任何逐行逐格结果写入。
- 日期聚合在现有 OA / ERP 单次遍历中完成，不增加额外全表遍历。
- 第一版低内存实现中，每个聚合行只保存最终日期展示字符串，不额外保存日期数组或 `Set`。
- 日期去重使用固定分隔符的字符串 token 检查；日期格式固定为 `YYYY-MM-DD`，可以避免误判子串。
- ERP 出库单号聚合也保持最终展示字符串，不再额外保存单号数组；输出行为保持逗号拼接。
- 不引入新的日期库或 UI 库。

## 测试策略

需要补充 Vitest 覆盖：

- OA 聚合行包含 `申请日期`，ERP 聚合行包含 `日期`。
- 多行相同日期去重，多行不同日期按出现顺序用 `、` 拼接。
- `detailRowsToValues()` 输出新表头和新日期列。
- 查询宏写出的“明细差异”包含 `OA申请日期` 与 `ERP日期`。
- 输出清理范围从 `A8:O200000` 改为 `A8:Q200000`，仍只清理一次。
- `npm run build` 后 `main.js` 与源码保持一致。

## 风险点 / 边界条件

- 清理范围扩大到 `Q` 后，仍只清理查询输出区，不影响 `B2:B6` 筛选输入。
- 汇总差异不展示日期，避免把公司/部门汇总结果误解为某一天的汇总。
- 如果一个 OA 表单物料跨多个申请日期合并，明细展示多个日期；不拆分现有聚合粒度。
- 如果一个 ERP 源单物料跨多个出库日期合并，明细展示多个日期；不拆分现有聚合粒度。

## 伪代码草案

```ts
// 目标：在现有 O(n) 聚合过程中顺带收集日期，不增加 WPS 访问次数
// 输入：
// - oaRows: 从 OA UsedRange.Value2 批量解析出的行
// - erpRows: 从 ERP UsedRange.Value2 批量解析出的行
// - filters: 查询面板 B2:B6 条件
// 输出：
// - detailRows: 带 oaDate / erpDate 的明细差异行

function appendUniqueDateText(currentText: string, dateKey: string): string {
  // 为什么这样做：第一版优先降低内存占用，每个聚合行只保存最终展示字符串
  if (!dateKey) return currentText;
  if (!currentText) return dateKey;

  // dateKey 固定是 YYYY-MM-DD，按 token 边界判断即可避免额外 Set/数组
  if (
    currentText === dateKey ||
    currentText.startsWith(`${dateKey}、`) ||
    currentText.endsWith(`、${dateKey}`) ||
    currentText.includes(`、${dateKey}、`)
  ) {
    return currentText;
  }

  return `${currentText}、${dateKey}`;
}

function buildOaRows(oaRows, filters): Map<string, OaAggRow> {
  const result = new Map<string, OaAggRow>();

  for (const row of oaRows) {
    const dateKey = normalizeDateKey(row["申请日期"]);
    if (!isDateInRange(dateKey, filters)) continue;
    if (!matchesOrgFilters(row, filters)) continue;

    const key = `${formNumber}||${materialCode}`;
    const agg = getOrCreateOaAggRow(result, key);

    agg.oaDate = appendUniqueDateText(agg.oaDate, dateKey);
    agg.quantity = addDecimal(agg.quantity, row["数量"]);
    agg.amount = addDecimal(agg.amount, row["实际预算金额mx"]);
  }

  return result;
}

function addErpRowToGroup(result, row, sourceFormNumber, materialCode, dateKey): void {
  const key = `${sourceFormNumber}||${materialCode}`;
  const agg = getOrCreateErpAggRow(result, key);

  agg.erpDate = appendUniqueDateText(agg.erpDate, dateKey);
  agg.quantity = addDecimal(agg.quantity, row["实发数量"]);
  agg.cost = addDecimal(agg.cost, row["总成本"]);
  addUniqueDocNumber(agg.erpDocNumbers, row["单据编号"]);
}

function compareRows(oaMap, erpForOaMap, erpOnlyMap): DetailRow[] {
  const detailRows: DetailRow[] = [];

  for (const key of unionKeys(oaMap, erpForOaMap)) {
    const oa = oaMap.get(key);
    const erp = erpForOaMap.get(key);

    detailRows.push({
      differenceType: classifyDifference(oa, erp),
      formNumber: oa?.formNumber ?? erp?.sourceFormNumber ?? "",
      oaDate: oa?.oaDate ?? "",
      erpDate: erp?.erpDate ?? "",
      // 其他字段保持现有逻辑
    });
  }

  for (const erp of erpOnlyMap.values()) {
    detailRows.push({
      differenceType: "ERP出库对应OA未在当前OA数据中找到",
      formNumber: erp.sourceFormNumber,
      oaDate: "",
      erpDate: erp.erpDate,
      // 其他字段保持现有逻辑
    });
  }

  return detailRows;
}

function writeQueryResults(summaryRows, detailRows): void {
  const detailValues = detailRowsToValues(detailRows);

  // 为什么这样做：列数扩展到 Q 后，固定清理范围也同步扩大，避免旧尾列残留
  sheet.Range(`A8:Q${MAX_OUTPUT_CLEAR_ROW}`).ClearContents();
  writeMatrixBulkOrChunks(sheet, detailStartRow, 1, detailValues);
}
```
