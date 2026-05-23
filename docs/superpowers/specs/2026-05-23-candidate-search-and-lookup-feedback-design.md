# 候选搜索与查单号反馈优化设计

## 目标

本轮优化覆盖两个查询弹窗和 `查单号` 输出体验，目标是在不改变核心对账结果的前提下提升候选搜索响应和人工阅读体验。

目标包含四项：

- 自研轻量 n-gram 候选索引，优化 `报废差异查询条件` 和 `单号查询` 两个弹窗的候选搜索。
- `单号查询` 候选只按当前查询类型的本侧单号搜索，日期、公司、部门、对方单号只作为展示上下文。
- `单号查询结果` 按查询类型动态调整左右字段顺序：查 OA 时 OA 在左，查 ERP 时 ERP 在左；数量差额和金额差额始终按左侧减右侧。
- 正式查询完成或失败后使用系统 `alert()` 提示状态、耗时和结果位置，不把耗时状态行写入业务结果表。

本轮不改变：

- OA/ERP 源表读取契约。
- 表头识别规则。
- 查询方向业务语义。
- 正式三张对账输出页的金额、数量和差异判断规则。
- `单号查询结果` 的金额差额仍只展示，不参与任何差异分类。
- 输出表名称。
- `性能诊断` 的阶段耗时输出。
- `main.js` 作为提交产物的要求。

## 输入

关键入参：

- `报废差异查询条件` 弹窗收到的候选数组：
  - `company: string[]`
  - `dept1: string[]`
  - `dept2: string[]`
- `单号查询` 弹窗收到的候选数组：
  - `oa: DocumentLookupSuggestion[]`
  - `erp: DocumentLookupSuggestion[]`
- `DocumentLookupSuggestion` 包含：
  - `mode`
  - `docNumber`
  - `label`
- 用户在候选输入框中的当前输入文本。
- 用户选择的单号查询模式：
  - `oa_form_number`
  - `erp_doc_number`
- 主加载项执行查询时的目标输出表。

上下文信息：

- `ui/query-dialog.js` 和 `ui/document-lookup-dialog.js` 是 WPS 加载的静态页面脚本。
- 查询弹窗只负责收集条件和写回 `PluginStorage`。
- 真正读取工作簿、计算和写表的逻辑仍在主加载项上下文中执行。
- `单号查询结果` 当前内部数据结构保留 OA/ERP 两侧字段，最终输出矩阵可以按查询类型重排。

外部依赖：

- WPS `Application.ShowDialog`。
- WPS `Application.PluginStorage`。
- WPS `alert()` 或全局 `root.alert()`。
- 现有 `performance.now()` / `Date.now()` 计时能力。
- 现有工作表写入、metadata 保存和错误写入逻辑。

运行环境约束：

- Linux 本地开发。
- TypeScript 严格类型检查。
- 静态 WPS dialog 脚本保持保守浏览器兼容风格。
- WPS/browser 运行时代码不使用 Node-only API。
- 不新增 npm 依赖。
- 不引入 FlexSearch、MiniSearch、Fuse.js 或其他全文搜索库。

## 输出

成功输出：

- 两个查询弹窗的候选搜索继续显示最多 30 条。
- 候选搜索仍保持现有包含匹配语义。
- 输入候选中间连续片段可以命中。
- 单号查询候选展示仍包含日期、公司、部门、对方单号等上下文。
- 单号查询候选搜索只匹配本侧 `docNumber`。
- `单号查询结果` 根据查询类型动态输出左侧和右侧字段。
- 查询成功后弹出完成提示，包含耗时和结果表名。

失败输出：

- 查询失败后弹出失败提示，包含耗时和错误信息。
- 失败仍按现有行为写入目标结果表的错误行。
- 如果 `alert()` 不可用，继续走现有 `console.error` 兜底，不让提示失败破坏查询结果写入。

副作用：

- 会修改静态弹窗脚本。
- 会修改 `单号查询结果` 的表头和列顺序契约。
- 会修改查询执行结束后的提示行为。
- 会同步更新测试、文档和提交产物 `main.js`。
- 不写数据库，不访问外部服务，不新增本地配置。

## 运行环境

项目继续使用当前开发链路：

- npm 包管理器。
- TypeScript + esbuild。
- Vitest 单元测试。
- WPS JS 加载项运行环境。
- 静态 dialog 页面位于 `ui/`。
- 源码位于 `src/`。

验证命令以当前 `package.json` 为准：

- `npm run build`
- `npm test`
- `git diff --check`

## 设计方案

### 候选搜索索引

实现一个项目内轻量候选搜索索引，不新增依赖。

索引使用 2-gram 倒排结构：

- 构建阶段把每个候选标准化为 `searchText`。
- 对长度大于等于 2 的 `searchText` 提取连续 2 字符 gram。
- `gramToIndexes` 记录每个 gram 对应的候选索引列表。
- 查询阶段先用 gram 交集缩小候选集合，再用 `indexOf(query) !== -1` 做最终确认。

查询规则：

- 空输入：直接返回前 30 条候选。
- 输入长度为 1：受限线性扫描，找到 30 条即停。
- 输入长度大于等于 2：使用 2-gram 倒排索引。
- 最终命中必须通过完整 `indexOf(query)` 校验。
- 返回顺序保持原候选顺序，不做评分重排。
- 最多返回 30 条。
- 候选 normalize 只在索引构建时做一次。

这套索引只优化候选下拉，不参与业务查询判断。

### 查询条件弹窗

`公司简称`、`一级部门`、`二级部门` 三个输入框各自建立一个索引：

- `company` 只搜索公司候选。
- `dept1` 只搜索一级部门候选。
- `dept2` 只搜索二级部门候选。

行为保持不变：

- 候选只是输入辅助。
- 用户可以提交非候选值。
- 空值仍表示不限制该字段。

### 单号查询弹窗

`单号查询` 弹窗的搜索字段收窄为本侧单号。

`查OA表单编号`：

- 只用 OA `docNumber` 建索引。
- `label` 中的日期、公司、部门、ERP 对方单号只用于展示。
- 输入 OA 单号任意连续片段可以命中。
- 输入日期、公司、部门、ERP 对方单号不应命中，除非这些字符同时也是 OA 表单编号的一部分。

`查ERP单据编号`：

- 只用 ERP `docNumber` 建索引。
- `label` 中的日期、公司、部门、OA 对方单号只用于展示。
- 输入 ERP 单号任意连续片段可以命中。
- 输入日期、公司、部门、OA 对方单号不应命中，除非这些字符同时也是 ERP 单据编号的一部分。

提交规则保持不变：

- 必须点击候选项保存完整单号。
- 只输入片段但未选择候选时，继续提示 `请先从下拉候选中选择一个单号。`

### 单号查询结果列序

`单号查询结果` 不再固定 OA 左、ERP 右，而是按查询类型输出。

`查OA表单编号`：

- 左侧字段为 OA。
- 右侧字段为 ERP。
- `数量差额 = OA数量 - ERP数量`。
- `金额差额 = OA金额 - ERP金额`。

`查ERP单据编号`：

- 左侧字段为 ERP。
- 右侧字段为 OA。
- `数量差额 = ERP数量 - OA数量`。
- `金额差额 = ERP金额 - OA金额`。

前三列固定：

```text
行类型 | 查询类型 | 命中单号
```

末尾列固定：

```text
数量差额 | 金额差额 | 备注
```

中间字段根据查询类型动态变化。内部 `DocumentLookupRow` 可以继续保留 OA/ERP 两侧字段，最终矩阵转换函数根据 `lookupType` 选择表头和列序。

### 查询完成提示

正式查询完成或失败后使用系统 `alert()` 提示，不新增自定义结果弹窗。

覆盖入口：

- `查询当前页`
- `查单号`

不覆盖入口：

- `性能诊断`，因为该功能已经写出阶段耗时。

成功提示格式：

```text
查询已完成
耗时：123.45 ms
结果已写入：报废差异汇总
```

单号查询成功提示格式：

```text
单号查询已完成
耗时：45.67 ms
结果已写入：单号查询结果
```

失败提示格式：

```text
查询已失败
耗时：87.32 ms
错误：找不到工作表：查询OA-存货报废申请单
```

耗时口径：

- 从主加载项开始执行真实查询开始计时。
- 到结果或错误写入目标工作表结束。
- 不包含用户在弹窗里输入条件的时间。
- `查单号` 不包含打开单号弹窗前读取源表和生成候选的时间。
- 优先使用 `performance.now()`，不可用时回退 `Date.now()`。
- 展示保留两位小数，单位为 `ms`。

提示失败不能覆盖查询失败本身。如果 `alert()` 不可用，应保留现有 `console.error` 兜底。

## 伪代码草案

```ts
type CandidateSearchIndex<T> = {
  items: Array<{
    value: T;
    searchText: string;
  }>;
  gramToIndexes: Record<string, number[]>;
};

function normalizeSearchText(value: unknown): string {
  return String(value ?? "").trim();
}

function twoGrams(text: string): string[] {
  const grams: string[] = [];
  for (let index = 0; index < text.length - 1; index += 1) {
    grams.push(text.slice(index, index + 2));
  }
  return unique(grams);
}

function buildCandidateSearchIndex<T>(
  values: T[],
  getSearchText: (value: T) => string,
): CandidateSearchIndex<T> {
  const items = values
    .map((value) => ({
      value,
      searchText: normalizeSearchText(getSearchText(value)),
    }))
    .filter((item) => item.searchText.length > 0);

  const gramToIndexes: Record<string, number[]> = {};

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex];
    for (const gram of twoGrams(item.searchText)) {
      if (!gramToIndexes[gram]) {
        gramToIndexes[gram] = [];
      }
      gramToIndexes[gram].push(itemIndex);
    }
  }

  return { items, gramToIndexes };
}

function searchCandidateIndex<T>(
  index: CandidateSearchIndex<T>,
  rawQuery: string,
  limit: number,
): T[] {
  const query = normalizeSearchText(rawQuery);

  if (!query) {
    return index.items.slice(0, limit).map((item) => item.value);
  }

  if (query.length === 1) {
    // 单字命中面太宽，受限扫描比建立一字索引更省内存。
    const result: T[] = [];
    for (const item of index.items) {
      if (item.searchText.indexOf(query) !== -1) {
        result.push(item.value);
      }
      if (result.length >= limit) {
        break;
      }
    }
    return result;
  }

  const postings = twoGrams(query).map((gram) => index.gramToIndexes[gram] ?? []);
  const candidateIndexes = intersectPostingLists(postings);
  const result: T[] = [];

  for (const itemIndex of candidateIndexes.sort((left, right) => left - right)) {
    const item = index.items[itemIndex];
    if (item && item.searchText.indexOf(query) !== -1) {
      result.push(item.value);
    }
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}
```

```ts
function buildDocumentLookupIndex(
  suggestions: DocumentLookupSuggestion[],
): CandidateSearchIndex<DocumentLookupSuggestion> {
  // 单号查询只按本侧单号搜索，label 只用来帮助人工确认。
  return buildCandidateSearchIndex(suggestions, (suggestion) => suggestion.docNumber);
}
```

```ts
function quantityDiffForDisplay(row: DocumentLookupRow): number {
  if (row.lookupType === "查ERP单据编号") {
    return round2(row.erpQuantity - row.oaQuantity);
  }
  return round2(row.oaQuantity - row.erpQuantity);
}

function amountDiffForDisplay(row: DocumentLookupRow): number {
  if (row.lookupType === "查ERP单据编号") {
    return round2(row.erpAmount - row.oaAmount);
  }
  return round2(row.oaAmount - row.erpAmount);
}

function documentLookupRowsToValues(rows: DocumentLookupRow[] | null | undefined): OutputMatrix {
  const activeRows = rows ?? [];
  const lookupType = activeRows[0]?.lookupType;

  if (lookupType === "查ERP单据编号") {
    return [
      [...DOCUMENT_LOOKUP_ERP_LEFT_HEADERS],
      ...activeRows.map((row) => [
        row.rowType,
        row.lookupType,
        row.matchedDocNumber,
        ...erpSideValues(row),
        ...oaSideValues(row),
        quantityDiffForDisplay(row),
        amountDiffForDisplay(row),
        row.remark,
      ]),
    ];
  }

  return [
    [...DOCUMENT_LOOKUP_OA_LEFT_HEADERS],
    ...activeRows.map((row) => [
      row.rowType,
      row.lookupType,
      row.matchedDocNumber,
      ...oaSideValues(row),
      ...erpSideValues(row),
      quantityDiffForDisplay(row),
      amountDiffForDisplay(row),
      row.remark,
    ]),
  ];
}
```

```ts
function showUserMessage(root: ScrapVarianceGlobal, message: string): void {
  if (typeof root.alert === "function") {
    root.alert(message);
    return;
  }
  root.console?.error?.(message);
}

function runTimedQuery(
  root: ScrapVarianceGlobal,
  label: string,
  outputSheetName: string,
  action: () => void,
): void {
  const startedAt = nowMs(root);

  try {
    action();
    const elapsedMs = nowMs(root) - startedAt;
    showUserMessage(
      root,
      `${label}已完成\n耗时：${formatMs(elapsedMs)} ms\n结果已写入：${outputSheetName}`,
    );
  } catch (error) {
    const elapsedMs = nowMs(root) - startedAt;
    showUserMessage(
      root,
      `${label}已失败\n耗时：${formatMs(elapsedMs)} ms\n错误：${errorMessage(error)}`,
    );
    throw error;
  }
}
```

## 风险点 / 边界条件

- 2-gram 索引会增加弹窗初始化成本和内存占用；候选列表很小时收益有限。
- 输入长度为 1 时仍会扫描候选，但扫描会在找到 30 条后停止。
- 如果候选字符串包含 emoji 或复杂代理对字符，按 JavaScript 字符串切片可能不是完整语义字符；本项目候选主要是中文、数字、字母和符号，风险可接受。
- 单号查询不再支持通过日期、公司、部门、对方单号触发候选，这是有意收窄，不是回归。
- `单号查询结果` 的列序会改变既有输出契约，测试和文档必须同步。
- 查 ERP 时差额从历史固定 `OA - ERP` 改为 `ERP - OA`，这是为了匹配左侧主对象阅读顺序；金额差额仍只展示，不参与差异分类。
- `alert()` 是阻塞确认框，用户必须点击确定后才能继续操作；这是本轮选择的明确交互。
- 查询完成提示依赖 `alert()` 或 `console.error`，不同 WPS 宿主的弹窗外观可能不同。
- 本轮不做实时 `查询中` 进度窗，也不做取消查询。

## 验收方式

自动化测试：

- 候选搜索索引测试：
  - `产部` 命中 `生产部门1`。
  - 空输入返回前 30 条。
  - 单字符输入最多返回 30 条。
  - 长文本输入通过 2-gram 交集后仍用完整包含校验。
  - 返回顺序保持原候选顺序。
- 查询条件弹窗测试：
  - 三个字段继续按各自候选搜索。
  - 选择候选后填入输入框。
  - 手输非候选值仍可提交。
- 单号查询弹窗测试：
  - OA 模式输入 OA 单号中间片段能显示候选。
  - OA 模式输入日期、公司、部门、ERP 对方单号不显示候选。
  - ERP 模式输入 ERP 单号中间片段能显示候选。
  - ERP 模式输入日期、公司、部门、OA 对方单号不显示候选。
  - 未点击候选仍不能提交。
- 单号查询输出测试：
  - OA 查询时 OA 字段在左，差额为 `OA - ERP`。
  - ERP 查询时 ERP 字段在左，差额为 `ERP - OA`。
  - 表头随查询类型变化。
  - 错误和无结果提示不破坏 metadata。
- 查询提示测试：
  - `查询当前页` 成功后调用 `alert()`，包含完成、耗时、结果表名。
  - `查询当前页` 失败后调用 `alert()`，包含失败、耗时、错误信息，并仍写入错误行。
  - `查单号` 成功后调用 `alert()`，包含单号查询完成、耗时、结果表名。
  - `查单号` 失败后调用 `alert()`，包含单号查询失败、耗时、错误信息，并仍写入错误行。
  - `alert()` 不可用时不抛出新的提示错误。

命令验证：

```bash
npm run build
npm test
git diff --check
```

手工验证：

- 在 WPS 中打开 `报废差异查询条件`，输入公司/部门中间片段，确认候选快速收窄。
- 在 WPS 中打开 `单号查询`，输入 OA/ERP 单号中间片段，确认候选显示。
- 在 `单号查询` 中输入候选 label 里的公司、部门、日期、对方单号，确认不按这些上下文匹配。
- 执行 OA 单号查询，确认结果表 OA 在左。
- 执行 ERP 单号查询，确认结果表 ERP 在左。
- 执行正式查询后，确认弹出完成提示并显示毫秒耗时。
- 制造一个缺少源表或缺少表头的失败场景，确认弹出失败提示，且目标结果表仍有错误行。
