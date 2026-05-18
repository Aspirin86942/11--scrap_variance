# 查询弹窗条件记忆设计

## 目标

在现有查询弹窗基础上，让 `查询当前页` 打开的弹窗默认填充当前输出表上次成功查询时保存的条件。

本设计采用“当前输出表自己的查询条件”作为记忆来源：

- 在 `报废差异明细` 打开弹窗，只填充 `报废差异明细` 上次保存的查询条件。
- 在 `OA视角单据对比` 打开弹窗，只填充 `OA视角单据对比` 上次保存的查询条件。
- 在 `ERP视角单据对比` 打开弹窗，只填充 `ERP视角单据对比` 上次保存的查询条件。
- 当前输出表没有合法历史条件时，弹窗仍显示空条件和默认查询方向。

本次不引入全局最近查询条件，不改变核心对账算法，不改变隐藏元数据地址，不把查询条件写到可见输出区域。

## 输入

### 关键入参

- `root.Application.ActiveSheet`：当前激活工作表，用于判断当前输出表类型。
- 当前输出表隐藏查询状态：由 `readOutputQueryState(activeSheet)` 从 `CB2:CG2` 读取。
- 弹窗 token：由 `openQueryDialogAndRun()` 为本次弹窗创建，用于隔离本次初始状态和提交结果。
- 用户在弹窗中提交的查询条件：
  - `company`
  - `dept1`
  - `dept2`
  - `startDate`
  - `endDate`
  - `queryDirection`

### 上下文信息

当前项目已经有两类状态：

- 输出表隐藏状态：查询完成后保存到当前输出表，用于清理输出范围和后续 `展开物料`。
- 弹窗结果状态：`ui/query-dialog.js` 通过 `Application.PluginStorage` 写入 `ScrapVarianceQueryDialogResult`，主入口轮询读取。

本次新增的初始状态也走 `PluginStorage`，但使用独立 key，不复用结果 key。

### 外部依赖

- WPS JS `Application.ShowDialog()`：打开静态查询弹窗。
- WPS JS `Application.PluginStorage`：在主入口和弹窗页面之间传递初始条件和提交结果。
- `readOutputQueryState()`：读取当前输出表隐藏查询条件。
- `normalizeQueryDialogState()`：主入口最终规范化弹窗提交值并做日期校验。
- `runCurrentSheetQueryWithState()`：使用本次提交条件刷新当前输出表。

### 运行环境

- Linux 本地开发环境。
- TypeScript + esbuild 构建链。
- WPS JS 加载项运行时。
- 弹窗页面为 `ui/query-dialog.html` + `ui/query-dialog.js`。
- 提交产物包含同步后的 `main.js`。

## 输出

### 成功返回

用户点击 `查询当前页` 后：

- 如果当前输出表存在合法隐藏查询条件，弹窗打开时自动填入这些条件。
- 如果当前输出表没有合法隐藏查询条件，弹窗打开时保持默认空条件。
- 用户点击 `查询` 后，当前输出表按弹窗当前值刷新。
- 查询成功后，当前输出表继续保存本次查询条件，供下次打开弹窗和 `展开物料` 使用。

### 失败返回

- 当前 WPS 不支持 `ShowDialog()`：保持现有行为，抛出“无法打开查询弹窗”的错误。
- 当前 WPS 不支持 `PluginStorage`：保持现有行为，无法打开或无法提交时给出明确错误。
- 初始状态读取失败、隐藏状态无效、初始状态 JSON 解析失败：不阻止弹窗，回退默认空条件。
- 用户提交非法日期或非法方向：由 `normalizeQueryDialogState()` 拦截，不刷新当前输出表。

### 重试、降级和人工处理

- 初始状态缺失或损坏时自动降级为空条件，用户可以手工重新填写并查询。
- 弹窗超时后清理本 token 的临时初始状态和结果状态，用户可重新点击 `查询当前页`。
- 不做自动重试，避免重复触发查询写表副作用。

### 副作用

- 打开弹窗前会向 `PluginStorage` 写入本 token 的临时初始状态。
- 查询、取消、关闭弹窗或超时后会清理本 token 的临时初始状态。
- 点击 `查询` 且主入口成功拿到合法条件后，会刷新当前输出表并写入隐藏查询状态。

## 方案

### 推荐方案：PluginStorage 按 token 传初始状态

新增独立临时 key：

```text
ScrapVarianceQueryDialogInitialState:<token>
```

现有提交结果 key 保持不变：

```text
ScrapVarianceQueryDialogResult
```

打开弹窗时，主入口负责读取当前输出表隐藏状态，并将初始状态写入 `PluginStorage`。弹窗页面只通过 token 读取自己的初始状态，不直接读取工作表隐藏单元格。

初始状态 JSON 结构：

```json
{
  "token": "当前弹窗 token",
  "state": {
    "company": "数控",
    "dept1": "生产运营中心",
    "dept2": "",
    "startDate": "2026-01-01",
    "endDate": "2026-04-27",
    "queryDirection": "OA金蝶单号查ERP"
  }
}
```

选择这个方案的原因：

- 与当前弹窗结果回传机制一致，改动范围小。
- 中文、日期、后续扩展字段不需要塞进 URL。
- 弹窗 UI 不绑定隐藏元数据地址，边界更清楚。
- token 隔离能避免旧弹窗残留状态串到新弹窗。

### 未采用方案

URL 参数传初始状态：实现简单，但中文字段和 JSON 编码会让 URL 变长，后续扩展不干净。

弹窗直接读 `ActiveSheet.Range("CB2:CG2")`：看似直接，但会让静态 UI 脚本绑定隐藏元数据地址，测试和维护成本更高。

## 组件改动

### `src/query-dialog/open-query-dialog.ts`

新增职责：

- 构造初始状态 key。
- 通过当前激活输出表读取 `readOutputQueryState(activeSheet)`。
- 当前表有合法历史条件时，将其写入 `PluginStorage` 临时 key。
- 查询、取消、超时后清理临时 key。

保留职责：

- token 创建。
- `ShowDialog()` 打开弹窗。
- `ScrapVarianceQueryDialogResult` 轮询。
- 提交结果规范化后调用 `runQuery(queryState)`。

### `ui/query-dialog.js`

新增职责：

- 页面初始化时先执行 `resetForm()`，保证默认空条件仍可靠。
- 通过 token 读取 `ScrapVarianceQueryDialogInitialState:<token>`。
- 如果读取到合法 state，填充输入框和查询方向。

保持行为：

- `清空` 继续清成空条件，不恢复历史条件。
- `取消` 和关闭弹窗不提交查询。
- `OA视角单据对比`、`ERP视角单据对比` 中继续禁用查询方向。

### `docs/wps-js-usage.md`

更新查询说明：

- 弹窗默认带入当前输出表上次查询条件。
- `清空` 表示清成空条件，方便查全部。
- 切换到另一张输出表时，带入的是另一张输出表自己的上次条件。

### `main.js`

源码变更后执行 `npm run build`，保持提交产物同步。

## 数据流

```text
查询当前页按钮
-> openQueryDialogAndRun()
-> 识别当前激活输出表
-> readOutputQueryState(activeSheet)
-> PluginStorage 写入 ScrapVarianceQueryDialogInitialState:<token>
-> ShowDialog(ui/query-dialog.html?token=...&outputKind=...)
-> query-dialog.js 通过 token 读取初始状态并填充表单
-> 用户点击 查询
-> 弹窗写 ScrapVarianceQueryDialogResult
-> 主入口轮询到结果
-> 清理临时初始状态 key
-> normalizeQueryDialogState(result.state)
-> runCurrentSheetQueryWithState(root, queryState)
-> 查询成功后 saveOutputQueryState(activeSheet, queryState)
```

取消、关闭和超时流程：

```text
用户取消 / 关闭弹窗 / 弹窗超时
-> 主入口不调用 runQuery()
-> 清理 ScrapVarianceQueryDialogInitialState:<token>
-> 不修改当前输出表隐藏查询状态
```

## 错误处理

- `readOutputQueryState()` 返回 `null`：正常降级为空条件。
- 初始状态写入 `PluginStorage` 失败：打开弹窗前抛出明确错误，因为同一环境后续提交也依赖 `PluginStorage`。
- 弹窗读取初始状态失败：弹窗端降级为空条件，不弹错误，避免影响用户查询。
- 初始状态 token 不匹配：忽略这份初始状态，避免旧残留串用。
- 结果 token 不匹配：沿用现有轮询逻辑忽略。
- 超时：清理结果 key 和初始状态 key，并报告“查询弹窗超时”。

## 测试

### 单元测试

更新 `tests/query-dialog/open-query-dialog.test.ts`：

- 当前激活输出表已有隐藏查询状态时，打开弹窗会写入 `ScrapVarianceQueryDialogInitialState:<token>`。
- 当前激活输出表没有隐藏查询状态时，仍能打开弹窗并不影响查询。
- `pollQueryDialogResult()` 处理 `query` 后会清理本 token 初始状态。
- `pollQueryDialogResult()` 处理 `cancel` 后会清理本 token 初始状态。
- 超时后会清理本 token 初始状态和结果 key。

更新 `tests/build/build-output.test.ts`：

- 静态弹窗脚本包含初始状态读取逻辑。
- `清空` 仍存在并保持默认空条件逻辑。

### 集成验证

执行：

```bash
npm run build
npm test
git diff --check
```

继续扫描 bundle 运行时红旗：

```bash
rg -n "document\\.write|require\\(|process\\.|child_process|\\bfs\\b|\\bpath\\b|src/macros|ribbon\\.js" main.js
```

预期：不出现 WPS runtime 不应携带的 Node-only 或旧入口红旗。

## 伪代码草案

```ts
type InitialDialogStatePayload = {
  token: string;
  state: RibbonQueryState;
};

function initialStateKey(token: string): string {
  return `ScrapVarianceQueryDialogInitialState:${token}`;
}

function writeInitialStateForCurrentSheet(root: ScrapVarianceGlobal, token: string): void {
  const activeSheet = root.Application?.ActiveSheet;
  const outputKind = typeof activeSheet?.Name === "string" ? detectOutputSheetKind(activeSheet.Name) : null;
  if (!activeSheet || !outputKind) {
    return;
  }

  // 只信任当前输出表自己的隐藏查询状态，避免跨页面串条件。
  const state = readOutputQueryState(activeSheet);
  if (!state) {
    return;
  }

  getStorage(root).setItem(
    initialStateKey(token),
    JSON.stringify({
      token,
      state
    } satisfies InitialDialogStatePayload)
  );
}

function clearInitialState(root: ScrapVarianceGlobal, token: string): void {
  // PluginStorage 没有 removeItem 类型时，按现有结果 key 方式写空字符串。
  getStorage(root).setItem(initialStateKey(token), "");
}

function openQueryDialogAndRun(root: ScrapVarianceGlobal, runQuery: RunQuery, reportError: ReportError): void {
  const application = root.Application;
  if (typeof application?.ShowDialog !== "function") {
    throw new Error("当前 WPS 环境不支持 ShowDialog，无法打开查询弹窗。");
  }

  const token = createDialogToken();
  clearDialogResult(root);
  writeInitialStateForCurrentSheet(root, token);

  application.ShowDialog(buildDialogUrl(token, getActiveOutputKind(root)), "报废差异查询条件", 560, 430, false);

  const timer = setInterval(() => {
    const result = readDialogResult(root);
    if (!result || result.token !== token) {
      return;
    }

    clearInterval(timer);
    clearInitialState(root, token);
    clearDialogResult(root);

    if (result.action === "cancel") {
      return;
    }

    try {
      runQuery(normalizeQueryDialogState(result.state));
    } catch (error) {
      reportError(error);
    }
  }, QUERY_DIALOG_POLL_MS);
}
```

```js
function getInitialStateKey() {
  return "ScrapVarianceQueryDialogInitialState:" + getToken();
}

function readInitialState() {
  var storage = getStorage(false);
  var raw;
  var parsed;

  if (!storage || !getToken()) {
    return null;
  }

  raw = storage.getItem(getInitialStateKey());
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return null;
  }

  // token 再校验一次，避免旧弹窗遗留数据误填到当前页面。
  if (!parsed || parsed.token !== getToken() || !parsed.state) {
    return null;
  }

  return parsed.state;
}

function initializeForm() {
  var state;

  resetForm();
  state = readInitialState();
  if (!state) {
    setDirectionEnabled(isDirectionEditable());
    return;
  }

  setValue("company", state.company || "");
  setValue("dept1", state.dept1 || "");
  setValue("dept2", state.dept2 || "");
  setValue("startDate", state.startDate || "");
  setValue("endDate", state.endDate || "");
  setQueryDirection(state.queryDirection || DEFAULT_DIRECTION);
  setDirectionEnabled(isDirectionEditable());
}
```

## 风险点 / 边界条件

- WPS `PluginStorage` 只提供 `getItem` / `setItem` 类型时，清理使用写空字符串，保持与现有结果 key 一致。
- 初始状态读取必须宽容，不能因为隐藏状态损坏导致弹窗无法打开。
- 主入口提交后的正式校验仍必须保留，不能信任弹窗页面传回的字符串。
- `清空` 必须清成空条件，而不是恢复上次条件。
- `取消`、关闭弹窗和超时不能改当前输出表隐藏查询状态。
- 对比表中的 `查询方向` 仍禁用，避免用户误以为它会影响已由表名固定的查询视角。

## 验收方式

实现完成后至少满足：

- 在已查询过的 `报废差异明细` 页再次点击 `查询当前页`，弹窗填入该页上次条件。
- 在已查询过的 `OA视角单据对比` 页再次点击 `查询当前页`，弹窗填入 OA 对比页上次条件。
- 切换到另一张输出表时，不带入前一张输出表的条件。
- 当前页没有历史条件时，弹窗为空条件。
- 点击 `清空` 后弹窗变为空条件。
- 点击 `取消` 或直接关闭弹窗不会刷新输出表，也不会覆盖隐藏查询条件。
- 执行 `npm run build`、`npm test`、`git diff --check` 通过。
- `main.js` 与源码同步，bundle 红旗扫描无异常。
