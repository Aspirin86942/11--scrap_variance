# WPS JS 报废申请与出库差异查询设计

## 目标

在当前 WPS 工作簿中新增一个轻量 JS 宏查询工具，用于核对 OA 报废申请与 ERP 报废出库之间的差异。

第一版重点解决三个问题：

1. 按公司、部门、日期区间快速查看是否存在汇总差异。
2. 从汇总差异追到具体 OA 表单、ERP 出库单和物料。
3. 保持代码简单、注释清楚，方便后续手动修改。

本设计只面向当前工作簿内的数据，不做外部文件导入、不做复杂弹窗或侧边栏。

## 输入

### 固定原始表

宏固定读取以下两张工作表：

- `查询OA-存货报废申请单`
- `查询ERP-报废明细表`

### OA 关键字段

- `表单编号`
- `申请日期`
- `产品所属公司`
- `申请部门`
- `物料代码`
- `物料名称`
- `数量`
- `实际预算金额mx`
- `公司简称`
- `一级部门`
- `二级部门`

### ERP 关键字段

- `单据编号`
- `日期`
- `源单单号`
- `物料编码`
- `物料名称`
- `实发数量`
- `总成本`
- `区分公司简称`
- `一级部门`
- `二级部门`

### 查询面板输入

新增或刷新工作表 `查询面板`，固定使用以下输入单元格：

- `B2`: 公司简称，空值表示不过滤。
- `B3`: 一级部门，空值表示不过滤。
- `B4`: 二级部门，空值表示不过滤。
- `B5`: 开始日期，空值表示无开始日期限制。
- `B6`: 结束日期，空值表示无结束日期限制。

## 输出

### 汇总差异

从 `A8` 附近开始输出，按以下维度汇总：

- 公司简称
- 一级部门
- 二级部门

汇总字段：

- OA 数量合计
- ERP 实发数量合计
- 数量差额
- OA 实际预算金额mx合计
- ERP 总成本合计
- 金额差额
- 差异类型摘要

### 明细差异

从汇总结果下方空两行开始输出。明细按 `OA表单编号 + 物料编码` 合并后比较。物料明细不一致不是逐行顺序比较，而是在同一 OA 表单下检查某个物料是否只存在于 OA 或只存在于 ERP。

明细字段：

- 差异类型
- OA 表单编号
- ERP 出库单号
- 物料编码
- 物料名称
- 公司简称
- 一级部门
- 二级部门
- OA 数量合计
- ERP 实发数量合计
- 数量差额
- OA 实际预算金额mx合计
- ERP 总成本合计
- 金额差额
- 备注

## 数据口径

### 主线口径

查询以 OA 申请为主线。

OA 侧先按 `申请日期`、公司和部门条件筛选，再按 `OA表单编号 + 物料代码` 合并数量和金额。

ERP 侧通过以下关系关联 OA：

```text
OA.表单编号 = ERP.源单单号
```

ERP 侧按 `ERP源单单号 + 物料编码` 合并实发数量和总成本。

### ERP 未匹配 OA 的口径

ERP 中存在出库记录，但 `ERP.源单单号` 不在当前筛选后的 OA 结果的 `表单编号` 集合中时，不直接判定为违规。

这类记录输出为：

```text
ERP出库对应OA未在当前OA数据中找到
```

原因是某条 OA 申请可能真实存在，但落在当前查询的日期、公司或部门范围之外。这种情况下，ERP 行如果落在当前 ERP 查询范围内，仍然应该显示出来供人工调查。结果中必须保留 `ERP.源单单号`，方便回 OA 系统补查。

这类记录使用 `ERP.日期` 判断是否落入查询日期区间，并使用 ERP 侧的公司、部门字段匹配查询条件。判断是否属于 ERP-only 时，必须基于当前筛选后的 OA 结果集合，而不是全量 OA 导出集合；否则会把“当前查询范围内 ERP 有记录，但 OA 申请落在当前范围外”的情况隐藏掉。

## 差异类型

差异类型按以下优先级生成：

1. `OA有申请，ERP无出库`
2. `ERP出库对应OA未在当前OA数据中找到`
3. `OA和ERP都有，但物料明细不一致`
4. `OA和ERP都有，但数量不同`
5. `OA和ERP都有，数量一致`

金额只展示，不作为主要异常类型。原因是 OA 的 `实际预算金额mx` 和 ERP 的 `总成本` 不是完全相同的业务口径。

## 查询面板和控件

第一版采用轻量控件方案：

- 提供主函数 `runScrapVarianceQuery()`。
- 可以在 WPS JS 宏编辑器中直接运行该函数。
- 也可以在 `查询面板` 中插入按钮或形状，并手动绑定到该函数。
- 提供 `setupQueryPanel()` 用于创建或刷新标题、输入区和表头。

代码按小函数拆分，便于手动修改：

- `readSheetData()`：读取工作表数据。
- `normalizeDate()`：统一日期格式。
- `buildOaRows()`：整理 OA 明细。
- `buildErpRows()`：整理 ERP 明细。
- `compareRows()`：生成汇总和明细差异。
- `writeResults()`：写回查询面板。

关键业务逻辑使用中文注释，重点说明为什么这样核对，不做逐行重复解释。

## 错误处理

宏运行时不得静默失败。以下问题需要在 `查询面板` 顶部或结果区显示清楚：

- 找不到 OA 原始表。
- 找不到 ERP 原始表。
- 缺少关键列，例如 `OA.表单编号` 或 `ERP.源单单号`。
- 开始日期或结束日期格式不正确。
- 查询条件没有匹配到 OA 数据。
- ERP 存在源单号但当前 OA 数据未找到。

## 边界条件

- 日期为空时不限制日期。
- 只填开始日期时，查询开始日期之后的数据。
- 只填结束日期时，查询结束日期之前的数据。
- 公司、一级部门、二级部门为空时不过滤。
- 数量为空按 0 处理。
- 金额为空按 0 展示。
- 同一 OA 单号下同一物料可能有多行，需要先合并再比较。
- ERP 一张 OA 可能对应多个出库单号，明细中用逗号合并展示。
- ERP 未匹配 OA 的记录需要保留 `ERP.源单单号`，用于人工回查。
- 同一 OA 表单下，某个物料只在 OA 或只在 ERP 出现时，归为 `OA和ERP都有，但物料明细不一致`。

## 测试方案

使用当前工作簿做最小验证：

1. 查询一个有差异的日期区间，确认汇总数量差可以追到明细数量差。
2. 查询一个 OA 有申请但 ERP 无出库的单据，确认输出 `OA有申请，ERP无出库`。
3. 查询一个 ERP 源单号在当前 OA 表找不到的记录，确认输出 `ERP出库对应OA未在当前OA数据中找到`，并保留 `ERP.源单单号`。
4. 查询公司和部门为空的条件，确认可以查询全部数据。
5. 输入错误日期，确认宏显示错误信息，不静默失败。

## 伪代码草案

```js
function runScrapVarianceQuery() {
  // 目标：以 OA 申请为主线，查出指定公司、部门、日期区间内的申请与 ERP 出库差异。
  // 输入：
  // - 查询面板 B2:B6 的公司、部门、开始日期、结束日期。
  // - OA 原始表：申请明细、物料、数量、预算金额。
  // - ERP 原始表：出库明细、源单单号、物料、实发数量、总成本。
  // 输出：
  // - 查询面板上的汇总差异。
  // - 查询面板上的明细差异。
  // - 发生配置或数据问题时，输出可读错误信息。

  try {
    setupQueryPanel();

    const filters = readFiltersFromPanel();
    const oaRawRows = readSheetData("查询OA-存货报废申请单");
    const erpRawRows = readSheetData("查询ERP-报废明细表");

    validateRequiredColumns(oaRawRows, erpRawRows);

    const oaRows = buildOaRows(oaRawRows, filters);
    const currentOaFormNumbers = collectSelectedOaForms(oaRows);

    // ERP 已匹配 OA 的部分以 OA 表单编号关联，不按 ERP 日期二次过滤。
    // 为什么这样做：避免 OA 申请和 ERP 出库跨期时，被误判为没有出库。
    const erpRowsForOa = buildErpRowsForOa(erpRawRows, oaRows);

    // ERP 不在当前筛选 OA 结果中的部分按 ERP 出库日期过滤。
    // 为什么这样做：这类记录没有可用 OA 申请日期，只能用 ERP 日期判断是否属于本次查询范围。
    const erpOnlyRows = buildErpOnlyRows(erpRawRows, currentOaFormNumbers, filters);

    const detailRows = compareRows(oaRows, erpRowsForOa, erpOnlyRows);
    const summaryRows = buildSummaryRows(detailRows);

    writeResults(summaryRows, detailRows);
  } catch (error) {
    // 不允许静默失败；错误直接写到查询面板，方便用户知道该改数据还是改列名。
    writeErrorToPanel(error.message || String(error));
  }
}

function compareRows(oaRows, erpRowsForOa, erpOnlyRows) {
  const result = [];
  const allMatchedKeys = unionKeys(oaRows, erpRowsForOa);
  const erpFormNumbers = buildFormNumberSet(erpRowsForOa);

  for (const key of allMatchedKeys) {
    const oa = oaRows[key];
    const erp = erpRowsForOa[key];

    if (oa && !erp && !erpFormNumbers[oa.formNumber]) {
      result.push(buildDifference("OA有申请，ERP无出库", oa, null));
      continue;
    }

    if (!oa || !erp) {
      result.push(buildDifference("OA和ERP都有，但物料明细不一致", oa, erp));
      continue;
    }

    if (oa.quantity !== erp.quantity) {
      result.push(buildDifference("OA和ERP都有，但数量不同", oa, erp));
      continue;
    }

    result.push(buildDifference("OA和ERP都有，数量一致", oa, erp));
  }

  for (const erpKey in erpOnlyRows) {
    result.push(buildDifference("ERP出库对应OA未在当前OA数据中找到", null, erpOnlyRows[erpKey]));
  }

  return result;
}
```

## 风险点

- WPS JS API 和 Excel VBA 不完全一样，按钮绑定可能需要在 WPS 中手动完成一次。
- 当前 OA 导出数据可能不完整，所以 ERP 未匹配 OA 的记录只能提示回查，不能直接定性为违规。
- OA 金额和 ERP 成本口径不同，金额差只做展示，不作为主要异常。
- 如果后续原始表字段名改变，需要同步修改字段映射。
- 如果后续需要跨文件导入、弹窗界面或复杂钻取，需要另起一版设计。
