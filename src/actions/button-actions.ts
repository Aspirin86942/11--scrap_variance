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
