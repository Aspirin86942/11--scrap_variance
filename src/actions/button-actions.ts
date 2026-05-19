export interface ButtonActionTestResult {
  name: string;
  ok: boolean;
  message: string;
}

export interface ButtonAction {
  name: string;
  run(): unknown | Promise<unknown>;
  test?: () => unknown | Promise<unknown>;
}

export type ButtonActionRegistry = Record<string, ButtonAction>;

// 这里列出加载项真正支持的业务动作，ribbon.xml 的按钮 id 会通过 registry 映射到这些函数。
export interface ButtonActionRunners {
  runPrecheck(): unknown | Promise<unknown>;
  setupOutputSheets(): unknown | Promise<unknown>;
  queryCurrentSheet(): unknown | Promise<unknown>;
  toggleMaterialRows(): unknown | Promise<unknown>;
  runDiagnostics(): unknown | Promise<unknown>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createButtonActions(runners: ButtonActionRunners): ButtonActionRegistry {
  // 按钮 registry 把 ribbon.xml 的 control id 映射到真实业务函数，避免每个按钮分散写 try/catch 和 WPS 适配逻辑。
  return {
    btnPrecheck: {
      name: "runPrecheck",
      run: runners.runPrecheck
    },
    btnSetupOutputSheets: {
      name: "setupOutputSheets",
      run: runners.setupOutputSheets
    },
    btnQueryCurrentSheet: {
      name: "queryCurrentSheet",
      run: runners.queryCurrentSheet
    },
    btnToggleMaterialRows: {
      name: "toggleMaterialRows",
      run: runners.toggleMaterialRows
    },
    btnPerformanceDiagnostics: {
      name: "runDiagnostics",
      run: runners.runDiagnostics
    }
  };
}

export function getButtonAction(actions: ButtonActionRegistry, buttonId: string): ButtonAction {
  const action = actions[buttonId];
  if (!action) {
    throw new Error(`未知功能区按钮：${buttonId}`);
  }

  return action;
}

export async function runAllButtonActionTests(actions: ButtonActionRegistry): Promise<ButtonActionTestResult[]> {
  const results: ButtonActionTestResult[] = [];

  // 真机测试要调用真实按钮 action；失败时保留错误消息，不能把失败吞掉后假装通过。
  for (const action of Object.values(actions)) {
    try {
      await action.run();
      results.push({ name: action.name, ok: true, message: "已调用按钮 action" });
    } catch (error) {
      results.push({ name: action.name, ok: false, message: errorMessage(error) });
    }
  }

  return results;
}
