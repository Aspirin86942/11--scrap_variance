# TypeScript 初学者中文学习注释设计

## 目标

为 `src/` 下的核心业务和 WPS 运行时代码补充中文学习注释，帮助 TypeScript 初学者理解代码主流程、业务规则、WPS 环境限制和关键类型写法。

本次目标不是“每行翻译代码”，而是做段落级解释：

- 解释为什么这样做，而不是重复代码字面含义。
- 解释业务规则、数据流、异常处理和 WPS 兼容边界。
- 保持现有业务行为、输出格式、金额/数量规则和性能策略不变。
- 不改测试、不改生成 bundle、不做顺手重构。

## 输入

### 代码范围

第一阶段只处理 `src/`：

- `src/core/`：对账、聚合、差异判断、预验证、表头识别。
- `src/wps-api/`：WPS 表格读取、写入、当前上下文适配。
- `src/macros/`：按钮触发后的宏流程。
- `src/query-dialog/`：查询弹窗、状态记忆、PluginStorage 交互。
- `src/ribbon/`、`src/actions/`：入口注册和按钮 action 映射。
- `src/perf/`、`src/bench/`：性能指标、内存采样、benchmark 数据流。
- `src/types/`、`src/constants.ts`：只注释关键领域类型和常量。

### 不处理范围

- `tests/` 暂不注释，避免测试断言被解释文字淹没。
- `main.js` 是构建产物，不手工加注释。
- `ui/query-dialog.js` 是静态兼容脚本，第一阶段暂不处理。
- 不改变 `package.json`、`tsconfig.json`、`ribbon.xml` 或运行入口。

### 上下文约束

仓库仍按当前 TypeScript + esbuild + WPS JS 加载项结构运行。`src/entry.ts` 打包为 `main.js`，WPS 运行时代码不得依赖 Node-only API。

## 输出

成功输出是同一批 TypeScript 源文件中的中文注释补充：

- 对关键函数补充函数前注释，说明输入、输出和调用场景。
- 对复杂分支补充块级注释，说明业务原因和影响范围。
- 对 WPS fallback、批量读写、PluginStorage、ShowDialog、UsedRange 等边界补充原因说明。
- 对初学者容易卡住的 TypeScript 写法补充简短解释，例如 `Map`、`Set`、`Partial<T>`、`unknown`、可选链和类型收窄。

失败或中止条件：

- 如果某段逻辑无法确认业务含义，注释必须写“无确切信息”或先暂停确认，不能臆测。
- 如果发现代码本身疑似有 bug，本次只记录风险，不顺手改业务逻辑。
- 如果注释会迫使大面积格式化或重排代码，则放弃该写法，改用更小范围注释。

## 运行环境

- Linux 本地开发环境。
- Node/npm 项目，使用 `package-lock.json`。
- TypeScript strict 配置。
- Vitest 测试。
- WPS JS / Office 自动化受限运行环境。

本次只改源码注释，正常不需要刷新 `main.js`。如果后续验证或测试发现 bundle 对比受影响，再运行 `npm run build` 同步。

## 注释策略

### 应该注释

- 业务判断：为什么某类差异、缺失、重复或空值这样处理。
- 数据聚合：为什么用某个 key、为什么合并到 `Map` 或 `Set`。
- WPS 边界：为什么批量读写、为什么回退 `UsedRange`、为什么不能静默失败。
- 异常处理：为什么这里抛错、降级、记录诊断或继续运行。
- 类型学习点：只在类型写法会影响理解时解释。

### 不应该注释

- 明显变量赋值。
- 直接 `return`。
- 普通 import/export。
- 测试用例里的简单 expect。
- 已经由函数名和类型名表达清楚的逻辑。

### 注释风格

- 默认使用中文。
- 注释放在代码块前，少用行尾注释。
- 每条注释尽量 1-3 行。
- 注释关注“为什么”和“业务含义”，避免写成逐行翻译。
- 不引入与代码无关的 TypeScript 教程长篇内容。

## 伪代码草案

```ts
// [伪代码草案]
// 目标：按文件职责给 src 添加段落级中文学习注释，不改变任何运行行为

type CommentDecision =
  | { shouldComment: true; reason: "business" | "wps_boundary" | "error_handling" | "ts_learning"; text: string }
  | { shouldComment: false };

function decideCommentForBlock(block: CodeBlock, fileRole: SourceFileRole): CommentDecision {
  if (block.isImportExport || block.isSimpleAssignment || block.isObviousReturn) {
    // 简单代码靠命名和类型理解，避免注释噪音。
    return { shouldComment: false };
  }

  if (block.containsBusinessRule) {
    return {
      shouldComment: true,
      reason: "business",
      text: "说明这段规则对应的 OA/ERP 对账含义，以及为什么不能随意改边界。"
    };
  }

  if (block.touchesWpsRuntimeApi) {
    return {
      shouldComment: true,
      reason: "wps_boundary",
      text: "说明 WPS JS 环境限制、批量 Range 读写或 fallback 的原因。"
    };
  }

  if (block.handlesUnknownError || block.recordsDiagnostics) {
    return {
      shouldComment: true,
      reason: "error_handling",
      text: "说明为什么这里不能静默失败，以及错误会怎样反馈给用户或诊断表。"
    };
  }

  if (block.usesTypeScriptPatternThatBeginnersMayMiss) {
    return {
      shouldComment: true,
      reason: "ts_learning",
      text: "用简短中文解释类型收窄、泛型或集合结构在这里解决什么问题。"
    };
  }

  return { shouldComment: false };
}

function addLearningComments(files: SourceFile[]): SourceFile[] {
  for (const file of files) {
    if (!file.path.startsWith("src/") || file.path.endsWith("main.js")) {
      continue;
    }

    const fileRole = classifySourceFile(file.path);
    for (const block of findReadableBlocks(file)) {
      const decision = decideCommentForBlock(block, fileRole);
      if (decision.shouldComment) {
        insertCommentBefore(block, decision.text);
      }
    }
  }

  return files;
}
```

## 风险点 / 边界条件

- 注释过密会降低可读性，必须控制为段落级。
- 注释可能随代码变化过期，因此只解释稳定业务规则和关键边界。
- 不能把不确定业务含义写成确定结论。
- 不应通过注释掩盖过长函数或复杂逻辑；发现结构问题时另行记录，不在本任务重构。
- WPS 运行环境兼容性说明必须保守，不能假设现代浏览器或 Node API 可用。

## 验收方式

实施阶段每批改动后执行：

```bash
npm run typecheck
npm test
git diff --check
```

最终检查：

- 注释只出现在 `src/` 目标范围内。
- 没有业务逻辑 diff。
- 没有手工修改 `main.js`。
- 注释能解释关键业务和 WPS 边界，不是逐行翻译。
- 如果后续运行 `npm run build` 导致 `main.js` 变化，必须说明原因并按仓库 bundle 同步规则处理。
