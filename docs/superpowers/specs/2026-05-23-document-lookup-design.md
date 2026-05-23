# 单号查询结果页设计

## 目标

新增一个独立的“单号查询”功能，用来按一个明确选中的 OA 或 ERP 主单号，生成固定的 `单号查询结果` 工作表。

这个功能解决的是单据追踪问题，不替代现有三张查询输出表：

- `报废差异汇总` 继续负责部门维度管理汇总。
- `OA视角单据对比` 继续负责 OA 主视角批量单据对比。
- `ERP视角单据对比` 继续负责 ERP 主视角批量单据对比。
- `单号查询结果` 只负责单个主单号的物料级左右对照。

核心约束：

- 新增功能区按钮 `查单号`。
- 点击按钮后打开专用单号查询弹窗。
- 用户先选择查 OA 还是查 ERP，再从下拉候选中选择一个完整主单号。
- 候选输入只用于 `包含` 过滤；最终查询必须基于候选背后的完整单号。
- 结果固定写入一张 `单号查询结果`，每次覆盖上次工具输出。
- 结果默认直接展示物料级明细，不再要求用户点击 `展开物料`。
- 不使用公司、部门、日期筛选，避免单号存在但被其他条件误过滤。

## 输入

### 源表

继续读取现有两张源表：

```text
查询OA-存货报废申请单
查询ERP-报废明细表
```

OA 源表依赖字段：

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

ERP 源表依赖字段：

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

### 弹窗输入

弹窗只包含单号查询必要条件：

```text
查询类型
单号候选输入框
```

查询类型：

```text
查 OA 表单编号
查 ERP 单据编号
```

直接匹配字段：

- `查 OA 表单编号`：只匹配 OA `表单编号`。
- `查 ERP 单据编号`：只匹配 ERP `单据编号`。

关联字段只用于找对方单据，不参与用户输入的直接匹配：

- OA `金蝶云单据编号` 用来匹配 ERP `单据编号`。
- ERP `源单单号` 用来匹配 OA `表单编号`。

## 输出

### 工作表

新增固定输出表：

```text
单号查询结果
```

创建策略：

- 第一次执行 `查单号` 时创建。
- 后续查询复用同一张表。
- 每次查询只覆盖该表上次由工具生成的输出区域。
- 不追加历史记录。
- 不按单号新建多张工作表。

`单号查询结果` 不加入现有 `查询当前页` 和 `展开物料` 白名单。用户在这张表点击旧按钮时，仍按当前规则提示不支持当前工作表。`查单号` 按钮可以在任意当前工作表上触发，因为它固定写入 `单号查询结果`。

### 表头

`单号查询结果` 使用固定左右对照表头。查 OA 和查 ERP 都使用同一列顺序：

```text
行类型
查询类型
命中单号
OA表单编号
OA记录的ERP单号
OA申请日期
OA公司简称
OA一级部门
OA二级部门
OA物料编码
OA物料名称
OA数量
OA金额
ERP单据编号
ERP记录的OA单号
ERP日期
ERP公司简称
ERP一级部门
ERP二级部门
ERP物料编码
ERP物料名称
ERP数量
ERP金额
数量差额
金额差额
备注
```

字段含义：

- `OA表单编号` 来自 OA `表单编号`。
- `OA记录的ERP单号` 来自 OA `金蝶云单据编号`。
- `ERP单据编号` 来自 ERP `单据编号`。
- `ERP记录的OA单号` 来自 ERP `源单单号`。
- `数量差额 = OA数量 - ERP数量`。
- `金额差额 = OA金额 - ERP金额`。
- 金额差额只展示，不参与差异分类。

### 行粒度

默认输出物料级明细：

- 同一主单号下，同一物料编码先聚合后输出。
- OA 侧按 `物料代码` 聚合。
- ERP 侧按 `物料编码` 聚合。
- 输出时按物料编码做左右配对。
- OA 有、ERP 没有的物料也输出。
- ERP 有、OA 没有的物料也输出。

`行类型` 固定写 `物料`。本功能不额外输出单据汇总行，因为用户已经要求默认直接看到明细。

### 备注

备注按以下规则生成：

- 两边都有物料且数量一致：`数量一致`
- 两边都有物料但数量不同：`数量不同`
- OA 有该物料，ERP 没有：`ERP缺少该物料`
- ERP 有该物料，OA 没有：`OA缺少该物料`
- 查 OA 时，对方整张 ERP 单据未找到：`未找到对应ERP单据`
- 查 ERP 时，对方整张 OA 单据未找到：`未找到对应OA单据`

## 运行环境

运行环境沿用当前项目约束：

- Linux 本地开发。
- TypeScript 严格类型检查。
- WPS JS / 受限浏览器式运行环境。
- 运行时代码不使用 Node-only API。
- 写表继续使用批量 Range 写入。
- 静态弹窗脚本保持保守浏览器兼容风格，不依赖 `URLSearchParams`。
- 包管理器使用 `npm`，因为仓库存在 `package-lock.json`。
- TypeScript 改动完成后必须通过 `npm run build` 同步提交产物 `main.js`。

## 弹窗设计

新增专用静态弹窗文件：

```text
ui/document-lookup-dialog.html
ui/document-lookup-dialog.js
```

弹窗不复用现有查询弹窗的公司、部门、日期、查询方向控件。这样可以避免“批量查询条件”和“单号精查条件”混在一起。

交互规则：

- 顶部先选择 `查 OA 表单编号` 或 `查 ERP 单据编号`。
- 查询类型改变时，下拉候选立即切换数据源。
- 输入框按包含关系实时过滤候选。
- 用户必须点击候选项，保存候选背后的完整主单号。
- 用户只输入片段但未选候选时，点击查询提示：`请先从下拉候选中选择一个单号。`
- `查询` 提交选中的完整主单号。
- `清空` 只清空输入框和已选单号，保留当前查询类型。
- `取消` 关闭弹窗，不改结果页。

候选展示规则：

- 查 OA 时显示：

```text
OA表单编号 | 申请日期 | 公司简称 | 一级部门/二级部门 | ERP: 金蝶云单据编号
```

- 查 ERP 时显示：

```text
ERP单据编号 | 日期 | 区分公司简称 | 一级部门/二级部门 | OA: 源单单号
```

候选去重规则：

- 同一个主单号只显示一个候选。
- 如果同一主单号有多行物料，候选中的日期、公司、部门、对方单号使用去重拼接。
- 候选下拉展示文本不作为查询值；真正提交的是候选背后的完整主单号。

## 数据流

打开弹窗前：

```text
查单号按钮
-> 读取 OA / ERP 源表
-> 生成 OA 和 ERP 候选列表
-> 写入 token-scoped PluginStorage 初始状态
-> 打开 document-lookup-dialog.html
```

弹窗提交后：

```text
弹窗提交 mode + docNumber
-> 主加载项校验 token 和结果结构
-> 重新读取 OA / ERP 源表
-> 按完整主单号执行单号查询
-> 创建或获取 单号查询结果
-> 清理该表上次工具输出区域
-> 批量写入本次左右对照明细
-> 保存输出 metadata
```

重新读取源表的原因：

- 弹窗打开和用户提交之间，工作簿数据可能变化。
- 正式结果应以提交时源表状态为准。
- 如果提交时源表已经找不到候选单号，结果页写明确提示，不继续使用旧候选快照伪造结果。

## 架构边界

建议新增核心模块：

```text
src/core/document-lookup.ts
```

职责：

- 生成候选列表。
- 按 OA `表单编号` 精查单据。
- 按 ERP `单据编号` 精查单据。
- 聚合 OA / ERP 物料。
- 按物料编码生成左右对照输出行。
- 转换为输出矩阵。

建议新增宏编排模块：

```text
src/macros/document-lookup.ts
```

职责：

- 读取源表。
- 打开弹窗。
- 轮询弹窗结果。
- 调用核心查询。
- 创建或获取 `单号查询结果`。
- 清理旧输出并写入新输出。
- 写入 metadata。

建议新增弹窗桥接模块，也可以合并在宏模块中：

```text
src/query-dialog/open-document-lookup-dialog.ts
```

职责：

- token 生成。
- PluginStorage 初始候选写入。
- 弹窗 URL 生成。
- 弹窗结果解析。
- cancel、timeout、ShowDialog 同步失败时清理 storage。

按钮接入：

- `ribbon.xml` 新增 `btnLookupDocument`，label 为 `查单号`。
- `ButtonActionRunners` 新增 `lookupDocument()`。
- `createButtonActions()` 注册 `btnLookupDocument`。
- `createDefaultButtonActions()` 绑定到新宏入口。
- `main.js` 由 `npm run build` 同步生成。

## Metadata 和清理

`单号查询结果` 也使用现有 metadata 清理思想：只清理上次工具输出区域，不扫整表。

需要扩展 metadata kind：

```text
document_lookup
```

清理规则：

- metadata kind 为 `document_lookup` 且地址是安全矩形范围时，清理上次输出区域。
- metadata 不可信时不清理，避免误删用户数据。
- 本次写入成功后覆盖新的 metadata。
- 不保存单号查询历史条件；候选和本次选择只通过弹窗会话使用。

## 错误处理

### 源表错误

如果源表缺失或表头识别失败：

- 弹窗不打开。
- 直接提示明确错误。
- 不创建或修改 `单号查询结果`。

### 候选为空

如果源表存在但候选为空：

- 弹窗可以打开。
- 下拉为空。
- 用户点击查询时提示必须选择候选。

### 未选候选

如果用户只输入文本但未从下拉中选择：

- 不执行查询。
- 弹窗提示：`请先从下拉候选中选择一个单号。`

### 提交后主单号不存在

如果用户选中的主单号在提交后源表变化导致找不到：

- 结果页写一行提示：
  - `未找到OA表单编号：<docNumber>`
  - `未找到ERP单据编号：<docNumber>`
- 该情况视为可读业务结果，不是系统异常。

### 对方单据不存在

对方单据不存在时：

- 仍输出主单据物料明细。
- 对方字段留空。
- 备注写：
  - `未找到对应ERP单据`
  - `未找到对应OA单据`

### 写入错误

如果写入结果失败：

- 抛出可读错误。
- 不静默吞掉异常。
- 如果旧输出已清理但新输出写失败，错误需要通过统一错误入口提示。

## 伪代码草案

```ts
type DocumentLookupMode = "oa_form_number" | "erp_doc_number";

interface DocumentLookupSelection {
  mode: DocumentLookupMode;
  docNumber: string;
}

interface DocumentLookupSuggestion {
  mode: DocumentLookupMode;
  docNumber: string;
  label: string;
}

interface DocumentLookupInput {
  mode: DocumentLookupMode;
  docNumber: string;
  oaRows: RawRow[];
  erpRows: RawRow[];
}

type DocumentLookupResult =
  | { ok: true; rows: DocumentLookupRow[] }
  | { ok: false; message: string };

function buildDocumentLookupSuggestions(oaRows: RawRow[], erpRows: RawRow[]): {
  oa: DocumentLookupSuggestion[];
  erp: DocumentLookupSuggestion[];
} {
  // 1. 按 OA 表单编号去重；同一表单多行物料只生成一个候选。
  const oaSuggestions = groupByDocNumber(oaRows, "表单编号").map((group) => ({
    mode: "oa_form_number",
    docNumber: group.docNumber,
    label: joinUniqueParts([
      group.docNumber,
      group.uniqueValues("申请日期"),
      group.uniqueValues("公司简称"),
      joinDept(group.uniqueValues("一级部门"), group.uniqueValues("二级部门")),
      "ERP: " + group.uniqueValues("金蝶云单据编号"),
    ]),
  }));

  // 2. 按 ERP 单据编号去重；候选显示 ERP 自己和它记录的 OA 源单。
  const erpSuggestions = groupByDocNumber(erpRows, "单据编号").map((group) => ({
    mode: "erp_doc_number",
    docNumber: group.docNumber,
    label: joinUniqueParts([
      group.docNumber,
      group.uniqueValues("日期"),
      group.uniqueValues("区分公司简称"),
      joinDept(group.uniqueValues("一级部门"), group.uniqueValues("二级部门")),
      "OA: " + group.uniqueValues("源单单号"),
    ]),
  }));

  return { oa: oaSuggestions, erp: erpSuggestions };
}

function runDocumentLookup(root: ScrapVarianceGlobal, selection: DocumentLookupSelection): void {
  // 正式查询重新读源表，避免弹窗候选快照和当前工作簿数据不一致。
  const { oaRows, erpRows } = readSourceRows(root);
  const result = buildDocumentLookupResult({
    mode: selection.mode,
    docNumber: selection.docNumber,
    oaRows,
    erpRows,
  });

  const sheet = ensureSheet("单号查询结果", root);
  clearPreviousToolOutput(sheet, "document_lookup");

  if (!result.ok) {
    writeDocumentLookupMatrix(sheet, [["提示", result.message]]);
    saveOutputMetadata(sheet, {
      kind: "document_lookup",
      rangeAddress: "A1:B1",
    });
    return;
  }

  writeDocumentLookupMatrix(sheet, documentLookupRowsToValues(result.rows));
  saveOutputMetadata(sheet, {
    kind: "document_lookup",
    rangeAddress: calculateWrittenRange(result.rows),
  });
}

function buildDocumentLookupResult(input: DocumentLookupInput): DocumentLookupResult {
  if (input.mode === "oa_form_number") {
    return buildOaDocumentLookup(input);
  }

  return buildErpDocumentLookup(input);
}

function buildOaDocumentLookup(input: DocumentLookupInput): DocumentLookupResult {
  const oaDoc = collectOaRowsByFormNumber(input.oaRows, input.docNumber);
  if (!oaDoc) {
    return { ok: false, message: `未找到OA表单编号：${input.docNumber}` };
  }

  const erpDocNumbers = uniqueTextValues(oaDoc.rows, "金蝶云单据编号");
  const erpDoc = collectErpRowsByDocNumbers(input.erpRows, erpDocNumbers);

  return {
    ok: true,
    rows: pairMaterials({
      lookupType: "查OA表单编号",
      matchedDocNumber: input.docNumber,
      oaRows: oaDoc.rows,
      erpRows: erpDoc.rows,
      missingCounterpartRemark: "未找到对应ERP单据",
    }),
  };
}

function buildErpDocumentLookup(input: DocumentLookupInput): DocumentLookupResult {
  const erpDoc = collectErpRowsByDocNumber(input.erpRows, input.docNumber);
  if (!erpDoc) {
    return { ok: false, message: `未找到ERP单据编号：${input.docNumber}` };
  }

  const oaFormNumbers = uniqueTextValues(erpDoc.rows, "源单单号");
  const oaDoc = collectOaRowsByFormNumbers(input.oaRows, oaFormNumbers);

  return {
    ok: true,
    rows: pairMaterials({
      lookupType: "查ERP单据编号",
      matchedDocNumber: input.docNumber,
      oaRows: oaDoc.rows,
      erpRows: erpDoc.rows,
      missingCounterpartRemark: "未找到对应OA单据",
    }),
  };
}

function pairMaterials(input: PairMaterialsInput): DocumentLookupRow[] {
  const oaMaterials = aggregateOaMaterialsByItemCode(input.oaRows);
  const erpMaterials = aggregateErpMaterialsByItemCode(input.erpRows);
  const itemCodes = unionKeys(oaMaterials, erpMaterials);

  return itemCodes.map((itemCode) => {
    const oa = oaMaterials.get(itemCode);
    const erp = erpMaterials.get(itemCode);

    return {
      rowType: "物料",
      lookupType: input.lookupType,
      matchedDocNumber: input.matchedDocNumber,
      oaFields: buildOaOutputFields(oa, input.oaRows),
      erpFields: buildErpOutputFields(erp, input.erpRows),
      quantityDiff: round2((oa?.quantity ?? 0) - (erp?.quantity ?? 0)),
      amountDiff: round2((oa?.amount ?? 0) - (erp?.amount ?? 0)),
      remark: buildRemark(oa, erp, input.missingCounterpartRemark),
    };
  });
}
```

## 测试设计

### Core 测试

覆盖 `src/core/document-lookup.ts`：

- OA 单号查 ERP，按物料编码聚合并左右配对。
- ERP 单号查 OA，按物料编码聚合并左右配对。
- OA 多行同物料先合计数量和金额。
- ERP 多行同物料先合计数量和金额。
- OA 同一表单多个 `金蝶云单据编号` 时去重匹配多张 ERP 单据。
- ERP 同一单据多个 `源单单号` 时去重匹配多张 OA 表单。
- 对方整张单据不存在时仍输出主单据物料。
- OA 独有物料输出 `ERP缺少该物料`。
- ERP 独有物料输出 `OA缺少该物料`。
- 主单号不存在时返回可读提示。
- 金额差额只展示，不影响备注分类。

### 弹窗桥接测试

覆盖新弹窗打开和回传：

- 打开弹窗时写入 token-scoped 初始候选。
- 弹窗 URL 指向 `ui/document-lookup-dialog.html`。
- 提交 matching token 的完整单号后执行查询。
- stale token 被忽略。
- cancel 不执行查询。
- ShowDialog 同步失败时清理 token 初始状态。
- timeout 后清理 token 初始状态。

### 静态弹窗测试

覆盖 `ui/document-lookup-dialog.js`：

- 切换查询类型后候选数据源变化。
- 输入关键词后下拉按包含过滤。
- 同一个候选点击后保存背后的完整 `docNumber`。
- 手动改输入框导致已选单号失效。
- 未选候选不能提交。
- 清空只清输入和已选单号，保留当前查询类型。
- 不使用 `URLSearchParams`。

### 宏和按钮测试

覆盖 WPS 编排：

- `btnLookupDocument` 注册到 `ButtonActionRegistry`。
- `ribbon.xml` 包含 `查单号` 按钮。
- `查单号` 可从任意当前工作表触发。
- 第一次查单号创建 `单号查询结果`。
- 第二次查单号复用同一张表并清理上次工具输出。
- `单号查询结果` 不进入现有 `查询当前页` 和 `展开物料` 白名单。

### 构建测试

沿用当前验证：

```bash
npm run build
npm test
git diff --check
```

`npm run build` 必须同步 `main.js`，因为该仓库将 bundle 作为提交产物。

## 风险点 / 边界条件

- 候选生成需要读取两张源表。如果源表很大，打开弹窗前会有读取成本；但这是为了让用户只能选择一个明确存在的主单号，避免宽泛片段直接跑出大量结果。
- 单号候选展示文本不能作为查询值，必须提交结构化 `mode + docNumber`。
- `单号查询结果` 需要新的 metadata kind，避免和三张现有输出表互相误清理。
- 对方单据可能是多张，需要按去重后的关联单号全部纳入物料聚合。
- 同一物料编码在两侧物料名称不一致时，左右字段分别展示各自名称，不强行合并。
- 缺少物料编码的源行无法可靠配对。实现时应沿用当前核心逻辑的保守策略：无法形成物料键的行不参与物料配对；如果主单据因此没有可输出物料，应写可读提示，避免空白结果误导用户。
- 静态 WPS dialog 继续按保守 ES5 风格写，避免新浏览器 API 在 WPS 环境不可用。

## 验收方式

功能验收：

- 功能区可以看到 `查单号`。
- 弹窗顶部先选择查 OA 或查 ERP。
- 输入单号片段时，下拉候选按包含实时变化。
- 候选展示单号、日期、公司、部门和对方单号。
- 未选择候选不能查询。
- 选择一个 OA 表单编号后，`单号查询结果` 显示 OA 明细和对应 ERP 明细。
- 选择一个 ERP 单据编号后，`单号查询结果` 显示 ERP 明细和对应 OA 明细。
- 对方单据不存在时仍显示主单据物料，并在备注说明未匹配。
- 第二次查询覆盖上次结果，不新增结果 sheet。

工程验收：

- 新核心逻辑有单元测试覆盖。
- 新弹窗桥接和静态弹窗行为有测试覆盖。
- 按钮注册和构建产物有测试覆盖。
- `npm run build` 通过并同步 `main.js`。
- `npm test` 通过。
- `git diff --check` 通过。
