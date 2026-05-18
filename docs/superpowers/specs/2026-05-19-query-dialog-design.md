# 查询弹窗设计

## 目标

把 `查询当前页` 从依赖功能区输入框状态，改为弹窗确认后执行查询。核心目的是解决 WPS 功能区输入框存在的缓存、旧值残留和输入提交时机不稳定问题。

确认后的交互目标：

- 用户点击 `查询当前页` 后弹出查询窗口。
- 弹窗每次打开默认空白，表示重新开始查询。
- 任一筛选字段为空都表示 `all`，不限制该字段。
- 只填 `公司简称=数控` 时，只按公司筛选数控，一级部门、二级部门和日期不限制。
- `查询方向` 也放在弹窗中，避免继续依赖功能区下拉框状态。
- 三张输出表不联动：当前激活哪张输出表，就只刷新哪张输出表。
- 弹窗的 `清空` 只清空弹窗输入，不清空已有查询结果；只有点击 `查询` 才刷新当前输出页。

本次设计不改变 OA/ERP 原始表字段，不改变核心对账算法，不改变单据级物料展开口径。

## 输入

### 当前激活工作表

`查询当前页` 仍根据当前激活工作表决定输出类型：

- `报废差异明细`
- `OA视角单据对比`
- `ERP视角单据对比`

如果当前激活表不是以上三张输出表，给出明确错误提示，不执行查询。

### 弹窗输入

弹窗包含 6 个输入项：

```text
公司简称
一级部门
二级部门
开始日期
结束日期
查询方向
```

默认值：

```text
公司简称 = 空
一级部门 = 空
二级部门 = 空
开始日期 = 空
结束日期 = 空
查询方向 = OA金蝶单号查ERP
```

筛选规则：

- 文本字段去除前后空格后使用。
- 文本字段为空时表示 `all`，不参与筛选。
- 日期字段为空时表示不限制对应边界。
- 两个日期都为空时表示不限制日期。
- 只填开始日期时表示从该日期开始。
- 只填结束日期时表示截至该日期。
- 开始日期晚于结束日期时阻止查询并提示。

查询方向选项：

```text
OA金蝶单号查ERP
ERP源单查OA
```

`查询方向` 对 `报废差异明细` 生效。`OA视角单据对比` 和 `ERP视角单据对比` 的起点视角由工作表名称决定，但仍在隐藏查询状态中保存本次弹窗选择，便于诊断和后续一致性扩展。

## 输出

### 查询输出

查询结果继续写入当前激活输出表：

- 当前表为 `报废差异明细`：输出汇总差异和明细差异。
- 当前表为 `OA视角单据对比`：输出 OA 起点单据级汇总行。
- 当前表为 `ERP视角单据对比`：输出 ERP 起点单据级汇总行。

输出页仍保持干净，只展示查询结果。弹窗不会在输出表上新增可见查询条件区域。

### 隐藏元数据

查询完成后继续保存隐藏元数据：

- 当前工具输出范围。
- 本次查询条件状态。

这部分仍用于：

- 下一次查询当前页时精准清理上次工具输出区域。
- `展开物料` 时使用当前输出页当时的查询条件，不受其他页面后续查询影响。

## 弹窗行为

弹窗按钮：

```text
查询
清空
取消
```

按钮语义：

- `查询`：校验并提交当前弹窗值，关闭弹窗，刷新当前激活输出表。
- `清空`：清空公司、一级部门、二级部门、开始日期、结束日期，并把查询方向恢复为 `OA金蝶单号查ERP`；不关闭弹窗，不刷新输出表。
- `取消`：关闭弹窗，不查询，不修改当前输出结果。

弹窗每次打开都使用默认空条件，不带入上一轮查询条件，也不带入其他输出表的隐藏条件。

## 数据流

旧数据流：

```text
功能区 editBox/dropDown -> ScrapVarianceRibbonState -> 查询当前页
```

新数据流：

```text
查询当前页按钮
-> 打开查询弹窗
-> 用户确认本次条件
-> 生成 QueryDialogState/RibbonQueryState
-> runCurrentSheetQueryWithState(root, queryState)
-> parseFilters(queryState)
-> 当前激活输出表分发
-> 核心查询/对账逻辑
-> 写当前输出表和隐藏元数据
```

实现边界：

- 弹窗只负责输入、清空、提交和取消。
- 查询编排层负责读取当前激活输出表、解析条件、调用核心查询、写结果。
- 核心查询函数继续复用现有 `parseFilters()`、`runQueryCorePipeline()`、`buildOaDocCompare()`、`buildErpDocCompare()`。
- 新入口应类似 `runCurrentSheetQueryWithState(root, queryState)`，确保查询只使用本次弹窗提交的状态，不读取旧 ribbon/global 输入状态。

功能区上的输入框应从正式查询入口中移除，避免用户继续把 ribbon editBox 当作可参与查询的条件来源。功能区保留业务命令按钮：

```text
预验证数据
初始化输出表
查询当前页
展开物料
性能诊断
```

## 错误处理

### 输入错误

输入错误在刷新输出表前拦截：

- 日期格式不正确。
- 开始日期晚于结束日期。
- 查询方向不是支持值。

处理方式：

- 弹出错误提示。
- 不清理当前输出表。
- 不写无结果消息。

### 查询错误

查询执行阶段错误沿用现有处理方式：

- 当前表不是支持的输出表：提示不支持当前工作表。
- 源表缺失或字段不匹配：输出明确错误。
- WPS 读写失败：抛出可读错误信息。

如果可以写入当前输出表，继续把错误信息写到当前输出表；如果错误信息写入也失败，则弹出最终错误。

### 无结果

无结果不是错误，继续写出：

```text
查询条件没有匹配到 OA 数据。
查询条件没有匹配到 ERP 数据。
```

弹窗方案下，这类消息应只表示本次显式条件确实没有匹配，而不是功能区缓存导致的假无结果。

## 测试

### 输入和弹窗状态

需要覆盖：

- 默认弹窗状态为空条件，查询方向为 `OA金蝶单号查ERP`。
- `清空` 能恢复默认状态。
- 只填 `公司简称=数控` 时，其他字段为空。
- 空字符串和空白字符串都会被视为 all。
- 日期格式错误被拦截。
- 开始日期晚于结束日期被拦截。

### 查询编排

需要覆盖：

- `runCurrentSheetQueryWithState(root, queryState)` 只使用传入状态，不读取旧 `ScrapVarianceRibbonState`。
- 只填公司时能筛出该公司数据，部门和日期不限制。
- 全部条件为空时能查全部。
- 当前激活 `报废差异明细` 时走旧明细查询，并按弹窗查询方向执行。
- 当前激活 `OA视角单据对比` 时只刷新 OA 视角输出表。
- 当前激活 `ERP视角单据对比` 时只刷新 ERP 视角输出表。
- 查询完成后仍保存隐藏查询状态，`展开物料` 使用输出表保存的查询状态。

### 构建和集成

需要覆盖：

- `ribbon.xml` 不再暴露正式查询用 editBox。
- `查询当前页` 按钮仍接入正确处理函数。
- 查询弹窗相关 HTML/JS 被 WPS 加载项正确引用。
- `main.js` 与源码同步。
- bundle 中不出现 `document.write`、`require(`、`process.` 等不适合 WPS runtime 的红旗内容。

## 伪代码草案

```ts
// 目标：让查询条件只来自本次弹窗提交，避免 WPS ribbon 输入缓存影响查询结果。
// 输入：
// - root: WPS 加载项全局对象，包含 Application 和当前工作簿上下文
// - dialogState: 弹窗提交的查询条件
// 输出：
// - 成功时刷新当前激活输出表，并保存隐藏查询条件
// - 输入错误时提示用户，不刷新输出表
// - 查询错误时沿用现有错误写入/弹窗提示机制

function onQueryCurrentSheetButton(root) {
  // 每次打开弹窗都使用空条件，避免继承旧页面或旧 ribbon 状态。
  const initialState = buildDefaultQueryDialogState();

  openQueryDialog(initialState, {
    onSubmit(dialogState) {
      const queryState = normalizeDialogState(dialogState);
      runCurrentSheetQueryWithState(root, queryState);
    },
    onClear(dialogApi) {
      // 清空只影响弹窗当前输入，不清理已有输出。
      dialogApi.setState(buildDefaultQueryDialogState());
    },
    onCancel() {
      // 用户取消时不做任何查询副作用。
      return;
    }
  });
}

function normalizeDialogState(dialogState) {
  const queryState = {
    company: normalizeText(dialogState.company),
    dept1: normalizeText(dialogState.dept1),
    dept2: normalizeText(dialogState.dept2),
    startDate: normalizeText(dialogState.startDate),
    endDate: normalizeText(dialogState.endDate),
    queryDirection: parseQueryDirection(dialogState.queryDirection)
  };

  // 为什么在进入查询前校验：避免输入错误时先清掉用户已有输出。
  parseFilters(queryState);

  return queryState;
}

function runCurrentSheetQueryWithState(root, queryState) {
  setupOutputSheets(root);

  const activeSheet = getActiveSheet(root);
  const kind = detectOutputSheetKind(activeSheet.Name);
  if (!kind) {
    throw new Error(unsupportedOutputSheetMessage());
  }

  try {
    const filters = parseFilters(queryState);
    const { oaRows, erpRows } = readSourceRows(root);

    const result =
      kind === "legacy_detail"
        ? buildLegacyDetailValues(oaRows, erpRows, filters, queryState.queryDirection)
        : kind === "oa_doc_compare"
          ? buildOaDocCompareValues(oaRows, erpRows, filters)
          : buildErpDocCompareValues(oaRows, erpRows, filters);

    clearPreviousToolOutput(activeSheet, kind);
    writeOutputWithMetadata(
      activeSheet,
      kind,
      result.values ?? [[result.noResultMessage]],
      queryState
    );
  } catch (error) {
    safeWriteCurrentSheetError(activeSheet, kind, errorMessage(error), root);
  }
}
```

## 风险点和边界条件

- WPS `ShowDialog` 的回传能力需要按本地 `wpsjs` 示例和实际 runtime 验证；如果不能直接回调主窗口，需要用 WPS 支持的桥接方式传递查询状态。
- 弹窗 HTML/JS 需要纳入构建或发布路径，避免 debug 可用但打包后缺文件。
- 输入错误不能先清输出，否则用户会因为日期输错丢掉当前结果。
- 移除 ribbon 输入框后，需要更新说明文档，避免用户继续按旧方式操作。
- 旧的 `ScrapVarianceRibbonState` 可保留为兼容内部类型，但正式查询入口不应再依赖它。
- `性能诊断` 如果仍读取旧 ribbon 状态，应同步改为默认空条件或后续单独设计诊断弹窗；本次范围优先保证正式查询正确。
