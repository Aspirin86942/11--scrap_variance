# 查询弹窗提示补全设计

## 目标

在现有 `报废差异查询条件` 弹窗中，为 `公司简称`、`一级部门`、`二级部门` 三个字段增加提示补全下拉。

目标行为：

- 用户可以从候选项中选择，也可以继续自由输入。
- 空白输入仍表示 `all`，不改变现有查询过滤语义。
- 候选项只辅助填写，不参与业务判断，不限制用户提交非候选值。
- 查询弹窗仍只允许在 `报废差异明细`、`OA视角单据对比`、`ERP视角单据对比` 三张输出表中打开。
- `开始日期`、`结束日期` 保持手输和占位提示。
- `查询方向` 保持现有单选按钮，不改成下拉。

## 输入

关键入参：

- 当前 WPS 工作簿。
- 原始 OA 表 `查询OA-存货报废申请单`。
- 原始 ERP 表 `查询ERP-报废明细表`。
- 当前激活输出表名称。
- 当前输出表隐藏查询状态。

用于生成候选的字段：

- 公司候选：`OA.公司简称` + `ERP.区分公司简称`。
- 一级部门候选：`OA.一级部门` + `ERP.一级部门`。
- 二级部门候选：`OA.二级部门` + `ERP.二级部门`。

上下文信息：

- 父页面负责读取 WPS 工作簿和写入 `PluginStorage`。
- `ui/query-dialog.html` 和 `ui/query-dialog.js` 只负责弹窗 UI 展示和提交查询条件。
- 弹窗通过 token 读取 `ScrapVarianceQueryDialogInitialState:<token>`。
- 弹窗提交结果仍写入 `ScrapVarianceQueryDialogResult`。

外部依赖：

- WPS `Application.ActiveSheet`。
- WPS `Application.PluginStorage`。
- WPS `Application.ShowDialog`。
- 现有表头识别、表格读取和文本标准化逻辑。

运行环境约束：

- Linux 本地开发。
- TypeScript 构建父页面逻辑。
- 静态 `ui/query-dialog.js` 运行在 WPS 弹窗 WebView 中，不能假设 Node API 存在。
- WPS JS / Office 自动化环境下优先批量读取工作表，不逐格扫描候选。

## 输出

成功输出：

- 弹窗初始 payload 中包含当前查询状态和候选项：
  - `company: string[]`
  - `dept1: string[]`
  - `dept2: string[]`
- 弹窗三个输入框在聚焦或输入时显示匹配候选。
- 用户选择候选后，候选文本写入对应输入框。
- 用户手输值不在候选中时，仍可正常提交。

失败或降级输出：

- 当前表不是三张输出表时，父页面在打开弹窗前拦截，不写候选 payload，不打开弹窗。
- 候选读取失败时，不阻断查询弹窗打开；弹窗仍可手输和提交。
- 候选读取失败需要进入 `console.error`，便于排查表名、表头或读取异常。
- 弹窗读取候选 payload 失败时，降级为空候选列表。

副作用：

- 会读取 OA/ERP 原始表 UsedRange。
- 会写入 token 作用域的 `PluginStorage` 初始状态。
- 不写工作表、不改数据库、不触发外部服务。

## 运行环境

- Node/npm 项目，包管理器为 npm。
- 源码位于 `src/`，查询弹窗静态文件位于 `ui/`。
- `main.js` 是提交产物，修改 TypeScript 后必须执行 `npm run build` 同步 bundle。
- 验证命令以 `package.json` 现有脚本为准。

## 设计方案

采用轻量自定义补全下拉，保留自由输入。

父页面打开弹窗前构建候选：

1. 确认当前激活表属于三张输出表。
2. 读取当前输出表隐藏查询状态。
3. 从 OA/ERP 原始表读取公司和部门字段。
4. 去空、去重、排序，构成候选 payload。
5. 把查询状态和候选 payload 一起写入 `PluginStorage`。
6. 打开 `ui/query-dialog.html`。

弹窗端展示候选：

1. 读取 token 对应初始 payload。
2. 应用原有查询状态。
3. 给 `公司简称`、`一级部门`、`二级部门` 三个输入框挂自定义下拉。
4. 聚焦或输入时显示匹配项。
5. 选择候选后填入输入框。
6. 提交时仍读取输入框最终文本。

候选匹配规则：

- 输入为空时显示前一批候选。
- 输入非空时按包含关系匹配候选。
- 默认最多展示 30 条，避免大表候选过多造成弹窗卡顿或遮挡。
- 候选排序使用普通字符串排序，保证每次打开顺序稳定。
- 第一版不做公司和部门联动，避免候选被单边 OA/ERP 数据误收窄。

## 伪代码草案

```ts
// 父页面：候选只作为弹窗辅助数据，失败不能阻断手输查询。
type QueryDialogSuggestions = {
  company: string[];
  dept1: string[];
  dept2: string[];
};

type QueryDialogInitialPayload = {
  token: string;
  state?: RibbonQueryState;
  suggestions?: QueryDialogSuggestions;
};

function uniqueSorted(values: string[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      seen.add(normalized);
    }
  }
  return [...seen].sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function buildQueryDialogSuggestions(root: ScrapVarianceGlobal): QueryDialogSuggestions {
  try {
    const oaSheet = getSheetByName(SHEET_NAMES.oa, root);
    const erpSheet = getSheetByName(SHEET_NAMES.erp, root);
    const oaTable = readSheetTable(oaSheet, [...OA_REQUIRED_HEADERS], MIN_OA_HEADER_MATCH_COUNT, MAX_HEADER_SCAN_ROWS);
    const erpTable = readSheetTable(erpSheet, [...ERP_REQUIRED_HEADERS], MIN_ERP_HEADER_MATCH_COUNT, MAX_HEADER_SCAN_ROWS);

    return {
      company: uniqueSorted([
        ...pickColumnText(oaTable.rows, "公司简称"),
        ...pickColumnText(erpTable.rows, "区分公司简称"),
      ]),
      dept1: uniqueSorted([
        ...pickColumnText(oaTable.rows, "一级部门"),
        ...pickColumnText(erpTable.rows, "一级部门"),
      ]),
      dept2: uniqueSorted([
        ...pickColumnText(oaTable.rows, "二级部门"),
        ...pickColumnText(erpTable.rows, "二级部门"),
      ]),
    };
  } catch (error) {
    // 候选是降级能力，不能因为提示补全失败而阻断正常查询。
    root.console?.error?.("读取查询候选失败，查询弹窗将不显示补全下拉。", error);
    return { company: [], dept1: [], dept2: [] };
  }
}

function writeDialogInitialPayload(root: ScrapVarianceGlobal, token: string, outputKind: OutputSheetKind): void {
  const activeSheet = getActiveSheet(root);
  const payload: QueryDialogInitialPayload = {
    token,
    state: readOutputQueryState(activeSheet) ?? undefined,
    suggestions: buildQueryDialogSuggestions(root),
  };

  getStorage(root).setItem(buildDialogInitialStateKey(token), JSON.stringify(payload));
}

function openQueryDialogAndRun(root: ScrapVarianceGlobal, runQuery: RunQuery, reportError: ReportError): void {
  const outputKind = getActiveOutputKind(root);
  if (!outputKind) {
    throw new Error(unsupportedOutputSheetMessage());
  }

  const token = createDialogToken();
  clearDialogResult(root);
  writeDialogInitialPayload(root, token, outputKind);
  root.Application.ShowDialog(buildDialogUrl(token, outputKind), "报废差异查询条件", 560, 430, false);
}
```

```js
// 弹窗端：只读 payload，不直接读取 WPS 工作簿。
var MAX_VISIBLE_OPTIONS = 30;

function normalizeSuggestions(input) {
  return {
    company: Array.isArray(input && input.company) ? input.company : [],
    dept1: Array.isArray(input && input.dept1) ? input.dept1 : [],
    dept2: Array.isArray(input && input.dept2) ? input.dept2 : []
  };
}

function getMatchedOptions(value, suggestions) {
  var keyword = String(value || "").trim();
  var result = [];
  var index;

  for (index = 0; index < suggestions.length; index += 1) {
    if (!keyword || suggestions[index].indexOf(keyword) >= 0) {
      result.push(suggestions[index]);
    }
    if (result.length >= MAX_VISIBLE_OPTIONS) {
      break;
    }
  }
  return result;
}

function attachAutocomplete(inputId, suggestions) {
  var input = document.getElementById(inputId);
  var dropdown = createAutocompleteDropdown(input);

  input.addEventListener("focus", function () {
    renderAutocompleteOptions(dropdown, input, getMatchedOptions(input.value, suggestions));
  });

  input.addEventListener("input", function () {
    renderAutocompleteOptions(dropdown, input, getMatchedOptions(input.value, suggestions));
  });

  dropdown.addEventListener("mousedown", function (event) {
    var value = event.target && event.target.getAttribute("data-value");
    if (value != null) {
      input.value = value;
      hideAutocompleteDropdown(dropdown);
    }
  });
}

function initializeAutocomplete() {
  var payload = readInitialPayload();
  var suggestions = normalizeSuggestions(payload && payload.suggestions);

  attachAutocomplete("company", suggestions.company);
  attachAutocomplete("dept1", suggestions.dept1);
  attachAutocomplete("dept2", suggestions.dept2);
}
```

## 风险点 / 边界条件

- WPS 弹窗 WebView 对现代浏览器能力支持不完全，弹窗端实现应使用普通 DOM API，不依赖 Node、模块系统或较新的浏览器特性。
- OA/ERP 原始表很大时，候选构建会增加一次表格读取；实现时应复用现有批量读取和表头解析逻辑，不逐格读取。
- 候选可能来自 OA/ERP 并集，部门名称可能跨公司重复；第一版不做联动，避免候选误过滤。
- 原始表缺失、表头异常或 UsedRange 读取失败时，应只降级候选，不阻断手输查询。
- 候选 payload 不应长期保存，只使用现有 token 作用域初始状态，弹窗关闭或提交后按现有逻辑清理。
- 弹窗下拉不能遮挡按钮区；候选过多时限制显示数量。

## 验收方式

自动化验证：

- 新增候选构建测试：
  - 从 OA/ERP 行中提取公司、一级部门、二级部门并去重排序。
  - 空值不进入候选。
  - OA/ERP 并集合并正确。
  - 原始表读取失败时返回空候选并不抛错。
- 更新弹窗桥接测试：
  - 打开弹窗时把 `suggestions` 写入 token 初始 payload。
  - 非三张输出表仍不打开弹窗。
- 更新弹窗静态 JS 测试或可测试 helper：
  - 输入为空显示前 30 条候选。
  - 输入关键字时只显示匹配候选。
  - 选择候选后写回输入框。
  - 手输非候选值仍能提交。

手工验证：

- 在 `报废差异明细`、`OA视角单据对比`、`ERP视角单据对比` 分别打开查询弹窗。
- 聚焦 `公司简称`、`一级部门`、`二级部门`，确认出现候选。
- 输入部分文字，确认候选收窄。
- 选择候选后查询，确认只刷新当前输出表。
- 手输不在候选中的文本，确认可以提交并按现有逻辑查询。
- 切到非三张输出表点击 `查询当前页`，确认仍在弹窗打开前拦截。

最终验证命令：

```bash
npm run build
npm test -- --reporter=dot
git diff --check
rg -n "document\\.write|src/macros|ribbon\\.js|require\\(|process\\.|child_process|fs\\b|path\\b" main.js
```
