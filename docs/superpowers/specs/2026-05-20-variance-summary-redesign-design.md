# 报废差异汇总页重设计

## 目标

将现有 `报废差异明细` 输出页重设计为 `报废差异汇总`，让三张输出表形成清晰分工：

- `报废差异汇总`：当前查询方向下的公司、一级部门、二级部门管理汇总。
- `OA视角单据对比`：OA 主视角的单据级对比和物料展开。
- `ERP视角单据对比`：ERP 主视角的单据级对比和物料展开。

本次设计删除旧 `报废差异明细` 的可见明细输出，不再在该页展示单据和物料明细。明细查看职责只保留在两张单据视角对比表中。

## 输入

### 当前激活工作表

`查询当前页` 仍根据当前激活工作表决定输出类型：

- `报废差异汇总`
- `OA视角单据对比`
- `ERP视角单据对比`

旧工作簿中如果仍存在 `报废差异明细`，初始化输出表时应迁移为 `报废差异汇总`。

如果当前激活工作表不是以上三张输出表之一，查询和展开都不执行，并继续使用统一提示：

```text
当前工作表不支持查询或展开，请切换到 报废差异汇总、OA视角单据对比 或 ERP视角单据对比。
```

### 弹窗输入

弹窗继续保留 6 个输入项：

```text
公司简称
一级部门
二级部门
开始日期
结束日期
查询方向
```

`报废差异汇总` 上的 `查询方向` 必须可编辑：

- `OA金蝶单号查ERP`：输出 OA 视角部门汇总。
- `ERP源单查OA`：输出 ERP 视角部门汇总。

`OA视角单据对比` 和 `ERP视角单据对比` 仍保留日期输入，但查询方向由当前表锁定：

- `OA视角单据对比` 锁定 OA 视角，日期筛 OA `申请日期`。
- `ERP视角单据对比` 锁定 ERP 视角，日期筛 ERP `日期`。

锁定方向的目的是避免用户在 `OA视角单据对比` 中选择 ERP 方向，或在 `ERP视角单据对比` 中选择 OA 方向，导致表名和结果口径冲突。

### 源表依赖

正式查询继续读取两张源表：

- OA 源表：`查询OA-存货报废申请单`
- ERP 源表：`查询ERP-报废明细表`

核心字段沿用现有契约：

- OA 匹配字段：`金蝶云单据编号`
- ERP 匹配字段：`源单单号`
- OA 日期字段：`申请日期`
- ERP 日期字段：`日期`
- 组织字段：`公司简称`、`一级部门`、`二级部门`

## 输出

### 表名和表顺序

初始化输出表后，三张输出表顺序应为：

```text
报废差异汇总
OA视角单据对比
ERP视角单据对比
```

旧表 `报废差异明细` 不再作为正式输出表名。若旧表存在且新表不存在，应直接重命名为 `报废差异汇总`，尽量保留用户原工作簿中的表位置和历史内容，直到下一次查询按 metadata 精确清理。

### `报废差异汇总` 列设计

`报废差异汇总` 输出以下列：

```text
公司简称
一级部门
二级部门
查询视角
主视角单据数
已匹配单据数
未匹配单据数
有差异单据数
OA数量合计
ERP实发数量合计
数量差额
OA实际预算金额mx合计
ERP总成本合计
金额差额
差异类型摘要
```

列顺序是输出契约，需要用测试锁定，避免后续维护时发生列漂移。

### OA 视角汇总口径

当 `查询方向 = OA金蝶单号查ERP` 时：

- 主表是 OA。
- 日期筛 OA `申请日期`。
- 组织条件筛 OA 的 `公司简称`、`一级部门`、`二级部门`。
- 匹配关系为 OA `金蝶云单据编号` 到 ERP `单据编号`。
- 部门分组维度为 OA 行上的 `公司简称 + 一级部门 + 二级部门 + 查询视角`。

统计口径：

- `主视角单据数`：符合条件的 OA `表单编号` 数量。
- `已匹配单据数`：能通过 `金蝶云单据编号` 匹配到 ERP 单据的 OA 单据数。
- `未匹配单据数`：找不到 ERP 单据的 OA 单据数。
- `有差异单据数`：已匹配但数量或物料不一致的 OA 单据数。
- `差异类型摘要`：只使用 OA 视角描述，例如 `OA有申请，ERP无出库`，以及已匹配后的数量或物料差异；摘要排序沿用现有差异类型优先级，避免同一组数据每次输出顺序漂移。

### ERP 视角汇总口径

当 `查询方向 = ERP源单查OA` 时：

- 主表是 ERP。
- 日期筛 ERP `日期`。
- 组织条件筛 ERP 的 `区分公司简称`、`一级部门`、`二级部门`。
- 匹配关系为 ERP `源单单号` 到 OA `表单编号`。
- 部门分组维度为 ERP 行上的 `区分公司简称 + 一级部门 + 二级部门 + 查询视角`。

统计口径：

- `主视角单据数`：符合条件的 ERP `单据编号` 数量。
- `已匹配单据数`：能通过 `源单单号` 匹配到 OA 表单的 ERP 单据数。
- `未匹配单据数`：找不到 OA 表单的 ERP 单据数。
- `有差异单据数`：已匹配但数量或物料不一致的 ERP 单据数。
- `差异类型摘要`：只使用 ERP 视角描述，例如 `ERP出库对应OA未在当前OA数据中找到`，以及已匹配后的数量或物料差异；摘要排序沿用现有差异类型优先级，避免同一组数据每次输出顺序漂移。

### 数量和金额口径

数量和金额合计按当前部门组聚合：

- `数量差额 = OA数量合计 - ERP实发数量合计`
- `金额差额 = OA实际预算金额mx合计 - ERP总成本合计`

金额差额继续只展示，不参与差异类型判断。差异类型仍由匹配状态、数量差异和物料差异决定。

### 展开行为

`报废差异汇总` 不支持展开物料。如果用户在该页执行展开，应提示：

```text
当前工作表不支持展开物料。
```

`OA视角单据对比` 和 `ERP视角单据对比` 保留现有展开和收起物料行为。

## 运行环境

运行环境保持现有约束：

- Linux 本地开发。
- TypeScript 严格类型检查。
- WPS JS / 受限浏览器式运行环境。
- 运行时代码不得依赖 Node-only API。
- 写表继续使用批量 Range 写入，禁止在热点路径逐格写入。
- 构建产物 `main.js` 是提交产物，后续实现阶段需要通过 `npm run build` 同步。

包管理器继续使用 `npm`，因为仓库存在 `package-lock.json`。

## 数据流

`报废差异汇总` 查询流程：

```text
查询当前页按钮
-> 打开查询弹窗
-> 用户确认公司、部门、日期、查询方向
-> runCurrentSheetQueryWithState(root, queryState)
-> 识别当前表为 variance_summary
-> 读取 OA / ERP 源表
-> 根据 queryDirection 选择 OA 或 ERP 主视角
-> 按主视角日期和组织字段过滤主表
-> 按主视角匹配规则查找对方表
-> 聚合到 公司简称 + 一级部门 + 二级部门 + 查询视角
-> 清理当前表上次工具输出范围
-> 写入本次汇总输出
-> 覆盖写入 metadata 和本页查询条件
```

两张单据视角表继续走现有单据对比流程，但弹窗方向由当前表锁定，避免与表名语义冲突。

## Metadata 和清理机制

本次设计不新增隐藏底表。继续使用每张输出表自己的固定 metadata 区域：

```text
CB1:CC1  当前表上次工具输出范围
CB2:CG2  当前表上次查询条件
```

metadata 是固定位置覆盖写，不是追加日志：

- 不保留历史查询记录。
- 不新增 metadata 行。
- 查询 1 次和查询 1000 次，metadata 占用的单元格数量相同。
- 每次成功查询后只覆盖当前表的 metadata。

清理规则：

- 查询前只清理 `CB1:CC1` 记录的上次工具输出范围。
- 不依赖整表 `UsedRange` 做输出清理。
- metadata 不可信时不清理，避免误删用户数据。
- 本次成功写入后覆盖成新的可信 metadata。

迁移规则：

- 旧 `报废差异明细` 重命名为 `报废差异汇总` 时，保留 `CB2:CG2` 的查询条件。
- 迁移后的第一次新查询允许识别旧 `legacy_detail` metadata，并清理旧工具输出范围。
- 写入新汇总结果后，metadata kind 改写为新的汇总 kind，例如 `variance_summary`。

## 错误处理

### 当前表不支持

当前表不是三张输出表之一时，不执行查询或展开，并给出统一提示。

### 无结果

无结果不是系统错误，当前输出表写入一行可读提示：

- OA 视角：`查询条件没有匹配到 OA 数据。`
- ERP 视角：`查询条件没有匹配到 ERP 数据。`

### 源表或写入错误

如果读取源表、识别表头、计算汇总或写入结果失败，应尽量先清理当前表上次工具输出范围，再把错误信息写入当前输出表，避免用户误看旧结果。

如果错误信息写入也失败，应抛出包含原始错误和写入错误的组合错误。

### Metadata 不可信

metadata kind 不合法、地址不是安全矩形 A1 范围、或记录形状异常时，不执行历史范围清理。本次查询成功后会写入新的可信 metadata。

## 伪代码草案

```ts
type SummaryPerspective = "oa" | "erp";

interface DepartmentVarianceSummaryRow {
  company: string;
  dept1: string;
  dept2: string;
  perspective: "OA视角" | "ERP视角";
  primaryDocCount: number;
  matchedDocCount: number;
  unmatchedDocCount: number;
  differentDocCount: number;
  oaQuantity: number;
  erpQuantity: number;
  quantityDiff: number;
  oaAmount: number;
  erpCost: number;
  amountDiff: number;
  differenceSummary: string;
}

function runCurrentSheetQueryWithState(root: ScrapVarianceGlobal | undefined, queryState: RibbonQueryState): void {
  setupOutputSheets(root);

  const sheet = getActiveSheet(root);
  const kind = detectOutputSheetKind(sheet.Name);
  if (!kind) {
    throw new Error(unsupportedOutputSheetMessage());
  }

  const filters = parseFilters(queryState);
  const { oaRows, erpRows } = readSourceRows(root);

  // 汇总页由弹窗方向决定视角；两张单据页由当前表决定固定视角。
  const result =
    kind === "variance_summary"
      ? buildDepartmentVarianceSummaryValues(oaRows, erpRows, filters, queryState.queryDirection)
      : kind === "oa_doc_compare"
        ? buildOaDocCompareValues(oaRows, erpRows, filters)
        : buildErpDocCompareValues(oaRows, erpRows, filters);

  // 只清理本工具上次记录的输出范围，避免误删用户在同表其他区域写的内容。
  clearPreviousToolOutput(sheet, kind);
  writeOutputWithMetadata(sheet, kind, result.values ?? [[result.noResultMessage]], queryState);
}

function buildDepartmentVarianceSummaryValues(
  oaRows: RawRow[],
  erpRows: RawRow[],
  filters: QueryFilters,
  queryDirection: QueryDirection,
): { values: OutputMatrix; noResultMessage: null } | { values: null; noResultMessage: string } {
  const perspective: SummaryPerspective = queryDirection === QUERY_DIRECTIONS.erpSourceToOa ? "erp" : "oa";
  const primaryDocs = perspective === "oa"
    ? buildFilteredOaDocs(oaRows, filters)
    : buildFilteredErpDocs(erpRows, filters);

  if (primaryDocs.length === 0) {
    return {
      values: null,
      noResultMessage: perspective === "oa" ? "查询条件没有匹配到 OA 数据。" : "查询条件没有匹配到 ERP 数据。",
    };
  }

  const counterpartDocs = perspective === "oa" ? buildAllErpDocs(erpRows) : buildAllOaDocs(oaRows);
  const groups = new Map<string, DepartmentVarianceSummaryAccumulator>();

  for (const primaryDoc of primaryDocs) {
    const key = makeDepartmentKey(primaryDoc.company, primaryDoc.dept1, primaryDoc.dept2, perspective);
    const group = getOrCreateDepartmentGroup(groups, key, primaryDoc, perspective);
    const counterpart = matchCounterpartDocs(primaryDoc, counterpartDocs, perspective);

    // 单据数按主视角统计，避免 OA/ERP 双视角混算。
    group.primaryDocCount += 1;
    if (counterpart.exists) {
      group.matchedDocCount += 1;
    } else {
      group.unmatchedDocCount += 1;
      group.differenceTypes.add(
        perspective === "oa" ? "OA有申请，ERP无出库" : "ERP出库对应OA未在当前OA数据中找到",
      );
    }

    // 金额差只展示，不进入差异类型判断。
    group.oaQuantity = addDecimal(group.oaQuantity, counterpart.oaQuantity);
    group.erpQuantity = addDecimal(group.erpQuantity, counterpart.erpQuantity);
    group.oaAmount = addDecimal(group.oaAmount, counterpart.oaAmount);
    group.erpCost = addDecimal(group.erpCost, counterpart.erpCost);

    if (counterpart.exists && hasQuantityOrMaterialDifference(primaryDoc, counterpart)) {
      group.differentDocCount += 1;
      group.differenceTypes.add(buildMatchedDifferenceType(primaryDoc, counterpart));
    }
  }

  return {
    values: departmentSummaryRowsToValues([...groups.values()]),
    noResultMessage: null,
  };
}

function setupOutputSheets(root?: ScrapVarianceGlobal): WpsSheet {
  const summarySheet = findSheetByName("报废差异汇总", root);
  const oldDetailSheet = findSheetByName("报废差异明细", root);

  if (!summarySheet && oldDetailSheet) {
    // 旧表直接迁移成新汇总页，保留原位置和隐藏查询条件。
    oldDetailSheet.Name = "报废差异汇总";
  }

  ensureSheet("报废差异汇总", root);
  ensureSheet("OA视角单据对比", root);
  ensureSheet("ERP视角单据对比", root);

  return getSheetByName("报废差异汇总", root);
}
```

## 风险点 / 边界条件

- 旧 `报废差异明细` metadata 迁移时，如果历史 kind 或范围不可信，不能强行清理。
- `报废差异汇总` 方向可编辑，两张单据对比表方向锁定；弹窗 UI 和查询编排必须保持一致。
- 单据数必须按主视角统计，不能把对方单据数量混入 `主视角单据数`。
- 如果同一张主视角单据在源表中出现多个组织归属，第一版按现有单据聚合逻辑归属到该单据的主组织字段，不在本次设计中新增跨部门拆单规则。
- `有差异单据数` 只统计已匹配但数量或物料不同的主视角单据，未匹配单据只进入 `未匹配单据数`。
- 金额差额继续只展示，不参与差异类型判断。
- `报废差异汇总` 不支持展开物料，避免重新变成汇总和明细混合页。
- metadata 固定写在远列可能影响 WPS/Excel 的 UsedRange 观感，但清理逻辑不得依赖 UsedRange。

## 验收方式

### 单元测试

新增或更新测试覆盖：

- `报废差异汇总` 表名识别和三张输出表白名单。
- 旧 `报废差异明细` 初始化迁移为 `报废差异汇总`。
- OA 视角部门汇总列顺序和统计口径。
- ERP 视角部门汇总列顺序和统计口径。
- 金额差额只展示，不影响差异类型摘要。
- 旧 `legacy_detail` metadata 在新汇总页第一次查询时可用于清理，查询后改写为新汇总 kind。
- `CB1:CC1`、`CB2:CG2` 固定覆盖写，不追加 metadata。
- `报废差异汇总` 不支持展开物料。
- 两张单据视角表仍支持现有展开和收起。
- `报废差异汇总` 弹窗方向可编辑，两张单据视角表方向锁定但日期可编辑。

### 构建和静态检查

实现完成后至少执行：

```bash
npm run build
npm test
git diff --check
```

如果实现改到 WPS 运行时代码，还应继续扫描 `main.js` 中不应出现的 Node-only 或旧入口痕迹。

### 手工验证

在 WPS 中至少验证：

- 旧工作簿打开后，`报废差异明细` 能迁移为 `报废差异汇总`。
- `报废差异汇总` 用 OA 方向查询时，日期按 OA `申请日期` 生效。
- `报废差异汇总` 用 ERP 方向查询时，日期按 ERP `日期` 生效。
- 反复查询不会产生新增 metadata 行，也不会把用户在输出范围外的手写内容清掉。
- `报废差异汇总` 点击展开物料会给出不支持提示。
- `OA视角单据对比` 和 `ERP视角单据对比` 仍能正常查询和展开物料。
