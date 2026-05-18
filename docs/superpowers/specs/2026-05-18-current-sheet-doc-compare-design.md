# 当前页查询与单据级对比设计

## 目标

把现有 WPS 报废差异查询从单一 `查询面板` 输出，调整为三张互不联动的纯输出工作表，并把查询输入移到功能区控件。

三张输出工作表为：

```text
报废差异明细
OA视角单据对比
ERP视角单据对比
```

核心目标：

- 用户切换到哪张输出表，点击 `查询当前页` 就只刷新哪张表。
- 三张输出表互不联动，其他表保留自己的上次结果。
- 功能区共用一套筛选条件。
- 旧表 `报废差异明细` 保留现有查询方向能力。
- 新两张单据级对比表固定各自视角，并支持在汇总单据行下面展开或收起物料行。
- 查询重跑时只清理当前表上次由工具写入的区域，不再固定清到 200000 行。

本次设计不引入弹窗，不改变两张原始数据表的来源，也不新增外部文件导入。

## 输入

### 原始数据表

继续读取现有两张原始数据表：

```text
查询OA-存货报废申请单
查询ERP-报废明细表
```

OA 表字段沿用现有要求：

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

ERP 表字段沿用现有要求：

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

### 功能区输入

功能区保留一套共用筛选条件：

```text
公司简称
一级部门
二级部门
开始日期
结束日期
查询方向
```

功能区按钮：

```text
预验证数据
初始化/创建输出表
查询当前页
展开物料
性能诊断
```

`查询方向` 只对 `报废差异明细` 生效，支持：

```text
OA金蝶单号查ERP
ERP源单查OA
```

`OA视角单据对比` 和 `ERP视角单据对比` 不读取 `查询方向`，因为表名已经固定了起点视角。

### 当前工作表

`查询当前页` 根据当前激活工作表分发：

- 当前表为 `报废差异明细`：执行旧的汇总差异和明细差异查询，并读取 `查询方向`。
- 当前表为 `OA视角单据对比`：执行 OA 起点的单据级对比。
- 当前表为 `ERP视角单据对比`：执行 ERP 起点的单据级对比。
- 当前表不是以上三张表：给出明确错误提示，不执行查询。

`展开物料` 根据当前激活工作表和当前选中行执行：

- 只支持 `OA视角单据对比` 和 `ERP视角单据对比`。
- 只允许选中 `行类型=汇总` 的单据行。
- 已展开时收起；未展开时展开。

## 输出

### 报废差异明细

`报废差异明细` 承接现有输出：

- 汇总差异
- 明细差异

查询方向继续沿用现有语义：

- `OA金蝶单号查ERP`：按 OA 表筛选，再用 `OA.金蝶云单据编号 = ERP.单据编号` 回查 ERP。
- `ERP源单查OA`：按 ERP 表筛选，再用 `ERP.源单单号 = OA.表单编号` 回查 OA。

现有差异类型、数量差额、金额差额、备注语义保持不变。

如果旧工作簿已经存在 `查询面板`，实现时应尽量迁移或复用为 `报废差异明细`，避免用户丢失现有使用入口。

### OA视角单据对比

筛选条件按 OA 表字段解释：

```text
申请日期
公司简称
一级部门
二级部门
```

单据级聚合口径：

- `OA单据号 = OA.表单编号`
- `OA数量 = OA.数量` 按 OA 单据汇总
- `OA金额 = OA.实际预算金额mx` 按 OA 单据汇总
- `ERP单据号 = OA.金蝶云单据编号`
- `ERP数量 = ERP.实发数量` 按 `ERP.单据编号 = OA.金蝶云单据编号` 汇总
- `ERP金额 = ERP.总成本` 按 `ERP.单据编号 = OA.金蝶云单据编号` 汇总
- `数量差额 = OA数量 - ERP数量`
- `金额差额 = OA金额 - ERP金额`

输出列顺序：

```text
行类型
公司简称
一级部门
二级部门
OA申请日期
OA单据号
OA数量
OA金额
ERP单据号
ERP数量
ERP金额
数量差额
金额差额
物料编码
物料名称
备注
```

`行类型=汇总` 时：

- 数量和金额是单据级合计。
- `物料编码` 和 `物料名称` 为空。

`行类型=物料` 时：

- 行插入在对应汇总单据行下面。
- 数量、金额、差额都是该物料自己的聚合值。
- 保留公司、一级部门、二级部门、日期、单据号，方便复制、筛选和审阅。

### ERP视角单据对比

筛选条件按 ERP 表字段解释：

```text
日期
区分公司简称
一级部门
二级部门
```

单据级聚合口径：

- `ERP单据号 = ERP.单据编号`
- `ERP数量 = ERP.实发数量` 按 ERP 单据汇总
- `ERP金额 = ERP.总成本` 按 ERP 单据汇总
- `OA单据号 = ERP.源单单号`
- `OA数量 = OA.数量` 按 `OA.表单编号 = ERP.源单单号` 汇总
- `OA金额 = OA.实际预算金额mx` 按 `OA.表单编号 = ERP.源单单号` 汇总
- `数量差额 = ERP数量 - OA数量`
- `金额差额 = ERP金额 - OA金额`

输出列顺序：

```text
行类型
公司简称
一级部门
二级部门
ERP日期
ERP单据号
ERP数量
ERP金额
OA单据号
OA数量
OA金额
数量差额
金额差额
物料编码
物料名称
备注
```

`行类型=汇总` 时：

- 数量和金额是单据级合计。
- `物料编码` 和 `物料名称` 为空。

`行类型=物料` 时：

- 行插入在对应汇总单据行下面。
- 数量、金额、差额都是该物料自己的聚合值。
- 保留公司、一级部门、二级部门、日期、单据号，方便复制、筛选和审阅。

## 清理和状态

三张输出表不再使用固定大范围 `A9:S200000` 清理策略。

每张输出表独立保存隐藏元数据：

```text
上次输出范围
输出类型
```

输出类型包括：

```text
legacy_detail
oa_doc_compare
erp_doc_compare
```

每次 `查询当前页`：

1. 读取当前表隐藏元数据。
2. 只清理元数据记录的上次工具输出范围。
3. 不清理其他输出表。
4. 不清理 OA/ERP 原始数据表。
5. 不清理当前表中超出工具输出范围的手工内容。
6. 写入新结果。
7. 刷新当前表隐藏元数据。

查询重跑时，当前表中已展开的物料行也属于上次工具输出范围，会被一起清掉，然后按最新数据重新写结果。

如果隐藏元数据丢失，走保守降级：

- 只清理能明确识别为工具生成的输出区域。
- 不扩大到整张表或 200000 行，避免误删用户手工内容。

隐藏元数据不显示在主输出区域，不使用可见的 `BEGIN/END` 标记。

## 展开和收起物料

`展开物料` 是 toggle 行为：

- 未展开：在当前汇总行下方插入该单据的物料行。
- 已展开：删除当前汇总行下方连续的 `行类型=物料` 行。

定位规则：

- 用户选中 `OA视角单据对比` 或 `ERP视角单据对比` 中的一条汇总行。
- 工具读取当前选中行。
- 工具校验该行 `行类型` 必须为 `汇总`。
- 工具根据表类型和汇总行单据号生成物料行。

收起规则：

- 从汇总行下一行开始删除连续的 `行类型=物料` 行。
- 遇到下一条 `行类型=汇总` 或空行时停止。
- 不影响其他单据。

展开后必须刷新当前表隐藏元数据，使后续 `查询当前页` 能精确清理包含物料行在内的完整工具输出范围。

## 无结果和错误处理

### 无结果

如果当前页查询没有结果：

1. 先清理当前页旧工具输出。
2. 在当前页写一行明确提示。
3. 刷新隐藏元数据。

提示示例：

```text
查询条件没有匹配到 OA 数据。
查询条件没有匹配到 ERP 数据。
```

不保留旧结果，避免用户把旧结果误认为本次查询结果。

### 错误

缺表、缺表头、日期格式错误、查询方向错误等，写到当前页：

```text
错误 | 具体错误信息
```

当前工作表不支持查询时，提示：

```text
当前工作表不支持查询，请切换到 报废差异明细、OA视角单据对比 或 ERP视角单据对比。
```

`展开物料` 的错误提示包括：

- 当前工作表不支持展开物料。
- 请选中行类型为 `汇总` 的单据行。
- 当前选区无法识别为有效单据行。

禁止静默失败。如果错误写入也失败，通过现有 `reportError`、`alert` 或 `console.error` 兜底报告。

## 实现边界

### Ribbon

`ribbon.xml` 和 `src/ribbon/handlers.ts` 负责：

- 增加功能区输入控件。
- 保存功能区控件当前值。
- 分发 `查询当前页`。
- 分发 `展开物料`。
- 保留现有 `预验证数据` 和 `性能诊断`。

### WPS adapter

WPS API 适配层负责最小化封装：

- 获取当前激活工作表。
- 获取当前选中行。
- 批量读写矩阵。
- 读写隐藏元数据。
- 按元数据精确清理输出范围。

如果 WPS 当前选区读取能力在运行时不可用，`展开物料` 必须给出明确错误，而不是静默失败。

### Core

核心逻辑负责纯数据计算：

- 旧查询 pipeline 保持现有语义。
- 新增 OA 视角单据级聚合。
- 新增 ERP 视角单据级聚合。
- 新增物料级行生成。
- 新增行矩阵输出转换和列顺序测试。

金额和数量继续使用现有 Decimal 工具链，避免 float 误差。

## 测试计划

Core 测试：

- OA 视角单据汇总列顺序和数值。
- ERP 视角单据汇总列顺序和数值。
- 新两张表都输出公司简称、一级部门、二级部门和日期。
- 物料行数量金额是物料自己的值，不是汇总值。
- 数量差额和金额差额按对应视角计算。
- 多物料、多 ERP 单据、多日期时的聚合展示稳定。

WPS adapter 测试：

- 隐藏元数据记录上次输出范围。
- 精确清理只清元数据范围。
- 元数据丢失时保守降级，不大范围误删。
- 当前工作表识别正确。
- 当前选中行无法读取时给出明确错误。

Macro/ribbon 测试：

- 当前页在 `报废差异明细` 时读取查询方向。
- 当前页在 `OA视角单据对比` 时不读取查询方向。
- 当前页在 `ERP视角单据对比` 时不读取查询方向。
- 三张表互不联动，只刷新当前页。
- 无结果时清旧输出并写提示。
- 错误时写 `错误 | message`。
- `展开物料` 只允许在新表汇总行执行。
- 已展开单据再次触发时只收起该单据物料行。

Build 验证：

```bash
npm run build
npm test
git diff --check
rg -n "document\\.write|src/macros|ribbon\\.js|require\\(|process\\.|child_process|fs\\b|path\\b" main.js
```

## 风险点 / 边界条件

- 功能区输入控件和当前选区读取需要 WPS 实测。实现应把相关调用集中在 adapter 层，失败时给明确错误。
- 隐藏元数据位置必须避免覆盖用户内容。实现时应选择固定保留位置或隐藏载体，并用测试锁定。
- 精确清理比固定范围清理复杂，所有查询和展开/收起路径都必须同步刷新元数据。
- 旧工作簿从 `查询面板` 迁移到 `报废差异明细` 时，要避免误删用户数据。
- 如果用户在工具输出区域中间手工插入行，元数据可能和实际输出不一致。实现应以保守清理和明确提示优先，避免扩大误删。
- 新两张表的方向固定，功能区 `查询方向` 只对旧表生效；文档和错误提示必须说明这一点。

## 伪代码草案

```ts
// 目标：根据当前激活工作表，只刷新当前页对应的输出。
// 输入：
// - root: WPS 全局对象，提供 Application、ActiveWorkbook、当前选区和功能区状态
// - ribbonState: 功能区共用筛选条件，包括公司、部门、日期、旧表查询方向
// - 原始表：查询OA-存货报废申请单、查询ERP-报废明细表
// 输出：
// - 当前输出表的新矩阵和隐藏元数据
// - 无结果提示或错误行

function queryCurrentSheet(root: ScrapVarianceGlobal): void {
  const activeSheet = getActiveSheet(root);
  const sheetKind = detectOutputSheetKind(activeSheet.Name);

  if (!sheetKind) {
    reportUnsupportedSheet(root);
    return;
  }

  const filters = readRibbonFilters(root);

  try {
    // 只清理当前表上次由工具写入的区域，避免误删其他页或用户手工内容。
    clearPreviousToolOutput(activeSheet, sheetKind);

    if (sheetKind === "legacy_detail") {
      const direction = readRibbonDirection(root);
      const result = runLegacyQueryPipeline(filters, direction);
      writeLegacyResultOrNoDataMessage(activeSheet, result);
      saveOutputMetadata(activeSheet, result.outputRange, sheetKind);
      return;
    }

    if (sheetKind === "oa_doc_compare") {
      const result = buildOaDocCompare(filters);
      writeDocCompareResultOrNoDataMessage(activeSheet, result);
      saveOutputMetadata(activeSheet, result.outputRange, sheetKind);
      return;
    }

    if (sheetKind === "erp_doc_compare") {
      const result = buildErpDocCompare(filters);
      writeDocCompareResultOrNoDataMessage(activeSheet, result);
      saveOutputMetadata(activeSheet, result.outputRange, sheetKind);
      return;
    }
  } catch (error) {
    // 错误也写在当前页，避免用户看不到失败原因。
    safeWriteCurrentSheetError(activeSheet, error);
  }
}

// 目标：在当前汇总单据行下面展开或收起物料行。
// 输入：
// - root: WPS 全局对象，提供当前表和当前选区
// 输出：
// - 插入物料行，或删除当前汇总行下方连续物料行
function toggleMaterialRows(root: ScrapVarianceGlobal): void {
  const activeSheet = getActiveSheet(root);
  const sheetKind = detectOutputSheetKind(activeSheet.Name);

  if (sheetKind !== "oa_doc_compare" && sheetKind !== "erp_doc_compare") {
    throw new Error("当前工作表不支持展开物料。");
  }

  const selectedRowNumber = getSelectedRowNumber(root);
  const summaryRow = readDocCompareRow(activeSheet, selectedRowNumber);

  if (summaryRow.rowType !== "汇总") {
    throw new Error("请选中行类型为 汇总 的单据行。");
  }

  if (hasContinuousMaterialRowsBelow(activeSheet, selectedRowNumber)) {
    // 只收起当前单据的物料行，遇到下一条汇总行就停止。
    removeContinuousMaterialRowsBelow(activeSheet, selectedRowNumber);
    refreshOutputMetadataAfterToggle(activeSheet);
    return;
  }

  const materialRows = buildMaterialRowsForSummary(summaryRow, sheetKind);
  insertRowsBelow(activeSheet, selectedRowNumber, materialRows);
  refreshOutputMetadataAfterToggle(activeSheet);
}
```
