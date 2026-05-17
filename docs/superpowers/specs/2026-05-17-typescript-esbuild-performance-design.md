# WPS 报废差异加载项 TypeScript 与性能架构设计

## 目标

将当前 WPS JS 报废差异工具迁移为 TypeScript + esbuild 架构，并把性能约束固化到模块边界里。

本次迁移后，项目正式以 WPS 加载项作为唯一运行方式，不再维护“把整段 JS 宏复制到 WPS JS 宏编辑器运行”的旧入口。根目录 `main.js` 改为 esbuild 生成产物，并继续提交到 git，保证拉取仓库后可以直接按加载项方式调试。

本次设计同时解决一个明确 bug：预验证明明不应报错，却把 OA/ERP 所有必需字段都报为“缺少关键列”。该问题按“没有识别到真实表头行”处理，预验证和查询都改为自动识别表头行。

本次不改变查询业务口径。差异类型、筛选逻辑、输出字段、工作表名称和现有查询结果结构保持现状；除预验证表头识别 bug 外，不顺手调整业务规则。

## 输入

### 固定工作表

加载项仍只读取当前工作簿中的固定工作表：

- `查询OA-存货报废申请单`
- `查询ERP-报废明细表`
- `查询面板`

预验证结果仍写入：

- `预验证结果`

### 查询面板输入

`查询面板` 的输入单元格保持不变：

- `B2`: 公司简称，空值表示不过滤。
- `B3`: 一级部门，空值表示不过滤。
- `B4`: 二级部门，空值表示不过滤。
- `B5`: 开始日期，空值表示无开始日期限制。
- `B6`: 结束日期，空值表示无结束日期限制。

### OA 必需字段

- `表单编号`
- `申请日期`
- `公司简称`
- `一级部门`
- `二级部门`
- `物料代码`
- `物料名称`
- `数量`
- `实际预算金额mx`

### ERP 必需字段

- `单据编号`
- `日期`
- `源单单号`
- `区分公司简称`
- `一级部门`
- `二级部门`
- `物料编码`
- `物料名称`
- `实发数量`
- `总成本`

## 输出

### 查询输出

查询结果仍写入 `查询面板`：

- `汇总差异`: 从 `A8` 附近开始，按公司简称、一级部门、二级部门汇总。
- `明细差异`: 从汇总结果下方开始，按 OA 表单编号和物料编码展示差异明细。

汇总字段和明细字段保持当前版本一致，不因 TS 迁移调整列名或顺序。

### 预验证输出

预验证结果仍写入 `预验证结果`，字段保持当前版本一致：

- `级别`
- `数据源`
- `行号`
- `字段名`
- `原值`
- `问题类型`
- `原因`
- `处理建议`

如果无法识别表头，输出一条阻断错误，不再把每个必需字段分别刷成“缺少关键列”。示例：

```text
级别: 错误
数据源: OA
问题类型: 无法识别表头
原因: OA 表无法识别表头：已扫描 UsedRange 前 20 行，最多命中 0/9 个必需字段。
处理建议: 检查表头文字是否与模板完全一致，确认原始表中包含真实表头。
```

## 架构

推荐迁移后的源码结构：

```text
src/
├── main.ts
├── ribbon/
│   └── handlers.ts
├── macros/
│   ├── scrap-variance-query.ts
│   ├── scrap-variance-precheck.ts
│   └── setup-query-panel.ts
├── core/
│   ├── header-detection.ts
│   ├── table-parser.ts
│   ├── precheck.ts
│   ├── build-oa-rows.ts
│   ├── build-erp-rows.ts
│   ├── compare-rows.ts
│   └── build-summary-rows.ts
├── wps-api/
│   ├── workbook.ts
│   ├── read-sheet-data.ts
│   └── write-results.ts
├── types/
│   ├── scrap.ts
│   └── wps.ts
└── utils/
    ├── date.ts
    ├── decimal.ts
    ├── matrix.ts
    └── text.ts
```

模块职责：

- `src/main.ts`: 只挂载 WPS 需要的全局入口，例如 `window.ribbon`，不放业务计算。
- `src/ribbon/handlers.ts`: 根据功能区按钮 ID 分发到对应宏，并统一捕获错误。
- `src/macros/`: 编排读表、调用 core、写结果，不承载复杂业务计算。
- `src/core/`: 纯 TypeScript 业务逻辑，不依赖 `Application`、`Range`、`Sheet`。
- `src/wps-api/`: 唯一直接访问 WPS API 的层，负责 sheet 查找、批量读取、批量写入和固定范围清理。
- `src/types/`: 定义 OA/ERP 原始行、聚合行、差异行、预验证 issue、WPS 最小接口。
- `src/utils/`: 放文本、日期、Decimal、矩阵标准化等通用工具。

## 性能约束

WPS API 调用次数是主要性能瓶颈。迁移后必须把性能约束落在 `wps-api` 边界层：

- 读取 OA/ERP 表必须使用 `UsedRange.Value2` 这类批量读取。
- 查询结果和预验证结果必须使用二维数组批量写入。
- 写入优先整块 `Range.Value2 = matrix`。
- 整块写入失败时，降级为分块批量写入，默认 `WRITE_CHUNK_ROWS = 1000`。
- 不允许对结果大表逐行逐格写入作为兜底。
- 输出清理使用固定大范围一次 `ClearContents()`，不逐格清理。
- 查询输出清理范围为 `A8:O200000`。
- 预验证输出清理范围为 `A1:H200000`。
- 查询清理上限写为 `MAX_OUTPUT_CLEAR_ROW = 200000`。
- 预验证清理上限写为 `MAX_PRECHECK_CLEAR_ROW = 200000`。
- 如果本次查询输出超过 `MAX_OUTPUT_CLEAR_ROW`，抛出明确错误，提示调整常量，不静默截断。
- 如果本次预验证输出超过 `MAX_PRECHECK_CLEAR_ROW`，抛出明确错误，提示调整常量，不静默截断。
- 暂不做动态 `UsedRange` 清理。
- 暂不记录上次输出行数。
- 核心计算使用 `Map` 聚合，整体复杂度控制在 O(n)。
- 表头索引只构建一次，不在循环里重复查找列位置。

少量标题、状态、错误提示单元格可以使用少量 `Range.Value2` 写入；这些不是结果大表，不构成性能风险。若实现方便，也可以把小块标题和状态合并成矩阵写入。

## 表头识别

查询和预验证都使用统一表头识别逻辑，不再固定 OA 第 3 行、ERP 第 1 行。

常量：

```ts
const MAX_HEADER_SCAN_ROWS = 20;
const MIN_OA_HEADER_MATCH_COUNT = 5;
const MIN_ERP_HEADER_MATCH_COUNT = 5;
```

规则：

1. `wps-api/read-sheet-data.ts` 通过 `UsedRange.Value2` 一次性读取矩阵。
2. `utils/matrix.ts` 将 WPS 返回值标准化为二维数组，兼容数组矩阵、单行数组、单值和数字键对象矩阵。
3. `core/header-detection.ts` 扫描矩阵前 `MAX_HEADER_SCAN_ROWS` 行。
4. 表头标准化只做 `trim`。
5. 字段名必须完全一致，不做别名，不去掉中间空格，不忽略换行。
6. 每个候选行统计命中的必需字段数，选择命中数最多的一行。
7. 命中数达到对应最低阈值时，返回表头行、字段索引和数据起始行。
8. 命中数不足时，返回一条“无法识别表头”的阻断错误。

如果表头能识别，但仍缺少个别必需字段，则按缺失字段输出错误。只有完全无法定位真实表头时，才使用单条阻断错误，避免当前那种 19 条缺列误报。

## 查询口径

查询业务行为冻结，保持当前口径：

- OA 按 `申请日期`、公司简称、一级部门、二级部门过滤。
- OA 按 `表单编号 + 物料代码` 聚合。
- ERP 已匹配 OA 的部分按 `源单单号 + 物料编码` 聚合。
- ERP 已匹配 OA 的部分不按 ERP 日期二次过滤，避免跨期出库被误判。
- ERP-only 记录按 ERP 日期和 ERP 侧公司/部门过滤。
- ERP-only 记录保留 ERP 源单单号，方便回 OA 系统补查。

差异类型保持当前优先级：

1. `OA有申请，ERP无出库`
2. `ERP出库对应OA未在当前OA数据中找到`
3. `OA和ERP都有，但物料明细不一致`
4. `OA和ERP都有，但数量不同`
5. `OA和ERP都有，数量一致`

金额差只展示，不作为主要异常类型。

## Decimal 精度

迁移后引入一个轻量 Decimal 依赖，例如 `decimal.js-light` 或同级别依赖。

约束：

- Decimal 是本次唯一允许新增的运行时数值依赖。
- 不引入 lodash、moment、React、Vue 或大型 UI 库。
- OA 数量、ERP 实发数量、OA 金额、ERP 成本都使用 Decimal 聚合。
- 数量差额和金额差额都使用 Decimal 计算。
- 写回 WPS 前统一转成保留两位小数的 `Number`。
- WPS 单元格仍保持数字类型，便于筛选、排序和求和。

## 预验证规则

预验证业务规则保持当前版本：

- 日期列校验。
- 数字列校验。
- 关键字段空值校验。
- OA `表单编号 + 物料代码` 重复提醒。
- ERP `源单单号 + 物料编码` 重复提醒。
- ERP 源单未在 OA 中找到提醒。

本次只修复表头定位导致的误报，不新增数据质量规则。

## 错误处理

加载项不得静默失败。

- ribbon 回调统一捕获异常。
- 查询异常优先写入 `查询面板` 的结果区域。
- 预验证异常优先写入 `预验证结果`，形成一条系统错误 issue。
- 如果写工作表错误提示也失败，再通过加载项运行时 `alert` 或 `console.error` 报出。
- 表头识别失败必须给出扫描范围、最佳命中数、必需字段总数和缺失字段列表。
- 输出行数超过固定清理上限时必须明确报错，不截断结果。

## 构建

新增配置：

- `tsconfig.json`
- esbuild 构建脚本

`package.json` 脚本建议：

```json
{
  "scripts": {
    "build": "esbuild src/main.ts --bundle --format=iife --target=es2018 --outfile=main.js",
    "build:prod": "esbuild src/main.ts --bundle --format=iife --target=es2018 --minify --outfile=main.js",
    "test": "vitest run",
    "dev": "npm run build && wpsjs debug"
  }
}
```

`main.js` 是生成产物，但继续提交到 git。每次 TypeScript 源码变化后，必须同步执行构建，避免源码与 WPS 实际入口漂移。

## 测试

使用 Vitest，不再用 `node:test + vm` 读取宏源码。

### core 测试

覆盖：

- 文本标准化。
- 日期标准化。
- Decimal 数字标准化、聚合和两位小数输出。
- 表头自动识别成功。
- 表头自动识别失败时只输出一条阻断错误。
- OA 聚合。
- ERP 已匹配 OA 聚合。
- ERP-only 口径。
- 差异分类。
- 汇总构建。
- 预验证规则。

### wps-api 测试

使用 fake workbook、fake sheet、fake range，覆盖：

- `UsedRange.Value2` 批量读取。
- WPS 数字键对象矩阵兼容。
- 查询输出固定范围 `A8:O200000` 一次清理。
- 预验证输出固定范围 `A1:H200000` 一次清理。
- 整块写入成功路径。
- 整块写入失败后分块批量写入。
- 结果大表不调用逐格写入。
- 输出行数超过 `MAX_OUTPUT_CLEAR_ROW` 时明确报错。
- 预验证行数超过 `MAX_PRECHECK_CLEAR_ROW` 时明确报错。

### ribbon 和构建测试

覆盖：

- `btnPrecheck` 调用预验证。
- `btnInitQueryPanel` 调用初始化查询面板。
- `btnRunQuery` 调用执行差异查询。
- 未知按钮抛出可读错误。
- `npm run build` 能生成根目录 `main.js`。
- `main.js` 不再通过 `document.write` 加载多个源码文件。
- `window.ribbon.OnAction` 与 `ribbon.xml` 使用的入口匹配。

## 文档

更新 `docs/wps-js-usage.md`：

- 标明旧的复制宏方式废弃。
- 写清 `npm install`、`npm run build`、`npm run dev`。
- 写清 `main.js` 是生成产物但会提交。
- 写清预验证自动识别表头，字段名必须完全一致，只允许前后空格差异。
- 写清性能约束：批量读、整块或分块批量写、固定范围清理。

## 伪代码草案

```ts
// [伪代码草案]
// 目标：以 WPS 加载项方式运行报废差异预验证和查询，保证 WPS I/O 批量化、核心计算可测试。
// 输入：
// - workbook: 当前 WPS 工作簿，包含 OA、ERP、查询面板等工作表。
// - ribbonControl: WPS 功能区按钮事件，包含按钮 id。
// - queryFilters: 查询面板 B2:B6 中的公司、部门和日期条件。
// - dependencies: WPS adapter、core 计算函数、错误展示函数。
// 输出：
// - 查询成功时：查询面板中的汇总差异和明细差异。
// - 预验证成功时：预验证结果表中的 issue 列表或“未发现问题”提示。
// - 失败时：写入对应工作表的结构化错误；若写表失败，回退 alert 或 console.error。

function onRibbonAction(control: RibbonControl): void {
  try {
    const id = getControlId(control);

    if (id === "btnPrecheck") {
      runScrapVariancePrecheck();
      return;
    }

    if (id === "btnInitQueryPanel") {
      setupQueryPanel();
      return;
    }

    if (id === "btnRunQuery") {
      runScrapVarianceQuery();
      return;
    }

    throw new Error(`未知功能区按钮：${id}`);
  } catch (error) {
    // 为什么这样做：功能区回调是用户入口，不能让异常静默丢失。
    reportRuntimeError(error);
  }
}

function readDomainTable(sheetName: string, requiredHeaders: string[], minMatchCount: number): ParsedTable {
  const sheet = getSheetByName(sheetName);
  const matrix = normalizeMatrix(sheet.UsedRange.Value2);
  const headerResult = detectHeaderRow(matrix, requiredHeaders, minMatchCount);

  if (!headerResult.ok) {
    // 为什么这样做：无法识别表头时，逐列报缺失会制造误导，应输出单条根因错误。
    throw buildHeaderDetectionError(sheetName, headerResult);
  }

  return parseRowsByHeaderIndex(matrix, headerResult.headerRowIndex, headerResult.columnIndex);
}

function runScrapVariancePrecheck(): void {
  try {
    const oaTable = readDomainTable(OA_SHEET_NAME, OA_REQUIRED_HEADERS, MIN_OA_HEADER_MATCH_COUNT);
    const erpTable = readDomainTable(ERP_SHEET_NAME, ERP_REQUIRED_HEADERS, MIN_ERP_HEADER_MATCH_COUNT);

    const issues = buildPrecheckIssues(oaTable, erpTable);
    writePrecheckResults(issues);
  } catch (error) {
    // 为什么这样做：预验证失败本身也要进入可审计结果表，而不是只弹窗。
    writePrecheckResults([buildSystemErrorIssue(error)]);
  }
}

function runScrapVarianceQuery(): void {
  try {
    const panel = setupQueryPanel();
    const filters = readFiltersFromPanel(panel);

    const oaTable = readDomainTable(OA_SHEET_NAME, OA_REQUIRED_HEADERS, MIN_OA_HEADER_MATCH_COUNT);
    const erpTable = readDomainTable(ERP_SHEET_NAME, ERP_REQUIRED_HEADERS, MIN_ERP_HEADER_MATCH_COUNT);

    const oaGrouped = buildOaRows(oaTable.rows, filters);
    const selectedOaForms = collectSelectedOaForms(oaGrouped);

    // 为什么这样做：已匹配 ERP 不按 ERP 日期过滤，避免 OA 申请和 ERP 出库跨期时误判。
    const erpForOa = buildErpRowsForOa(erpTable.rows, oaGrouped);

    // 为什么这样做：ERP-only 没有可用 OA 申请日期，只能用 ERP 日期判断是否属于本次查询。
    const erpOnly = buildErpOnlyRows(erpTable.rows, selectedOaForms, filters);

    if (isEmpty(oaGrouped) && isEmpty(erpOnly)) {
      writeNoMatchedDataMessage(panel);
      return;
    }

    const detailRows = compareRows(oaGrouped, erpForOa, erpOnly);
    const summaryRows = buildSummaryRows(detailRows);

    writeQueryResults(summaryRows, detailRows);
  } catch (error) {
    safeWriteQueryError(error);
  }
}

function writeQueryResults(summaryRows: SummaryRow[], detailRows: DetailRow[]): void {
  const outputRowCount = calculateQueryOutputRows(summaryRows, detailRows);

  if (outputRowCount > MAX_OUTPUT_CLEAR_ROW) {
    throw new Error(`查询结果 ${outputRowCount} 行超过清理上限 ${MAX_OUTPUT_CLEAR_ROW}，请调整 MAX_OUTPUT_CLEAR_ROW。`);
  }

  const sheet = ensureSheet(QUERY_PANEL_SHEET_NAME);
  sheet.Range(`A8:O${MAX_OUTPUT_CLEAR_ROW}`).ClearContents();

  // 为什么这样做：先尝试整块写入，失败后仍保持分块批量写，不退回逐格写。
  writeMatrixInBulkOrChunks(sheet, summaryStartRange, summaryValues, WRITE_CHUNK_ROWS);
  writeMatrixInBulkOrChunks(sheet, detailStartRange, detailValues, WRITE_CHUNK_ROWS);
}
```

## 风险点 / 边界条件

- WPS 不同版本对 `Range.Value2 = matrix` 的支持可能不同，因此需要整块失败后的分块批量写入。
- 分块写入仍依赖二维数组赋值，如果某个 WPS 版本完全不支持二维数组写入，本设计会报明确错误，不退回逐格写。
- 自动表头识别只做 `trim`，如果导出字段名中间多空格、换行或别名变化，会按表头错误处理。
- Decimal 输出最终转为两位小数 `Number`，适合当前报废数量和金额展示；若未来需要保留更多数量小数，应单独调整输出规则。
- 固定范围清理简单稳定，但若长期输出超过 200000 行，需要升级为“覆盖写入 + 尾部清理”。
- `main.js` 作为生成产物提交，要求开发流程中每次源码变化都同步构建，否则 WPS 运行的代码可能落后于 TS 源码。
