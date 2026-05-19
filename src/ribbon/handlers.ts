import { getButtonAction, type ButtonActionRegistry } from "../actions/button-actions";
import type { RibbonApi, RibbonControl, ScrapVarianceGlobal } from "../types/wps";
import { normalizeText } from "../utils/text";

export interface RibbonDependencies {
  buttonActions: ButtonActionRegistry;
  reportError(error: unknown): void;
  root?: ScrapVarianceGlobal;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// 不同 WPS 版本传入的 control id 大小写不完全一致，这里统一收敛，避免按钮在真机里失效。
export function getControlId(control: RibbonControl | unknown): string {
  if (!isRecord(control)) {
    return "";
  }

  return normalizeText(control.Id ?? control.id ?? control.ID);
}

export function createRibbonHandlers(dependencies: RibbonDependencies): RibbonApi {
  const root = dependencies.root ?? (globalThis as ScrapVarianceGlobal);

  // WPS 调用 OnAction 后只给 control 信息；业务逻辑必须通过按钮 registry 间接分发。
  return {
    OnAddinLoad(ribbonUi: unknown): void {
      root.ScrapVarianceRibbonUi = ribbonUi;
    },
    OnAction(control: RibbonControl): void {
      try {
        const controlId = getControlId(control);
        const result = getButtonAction(dependencies.buttonActions, controlId).run();
        if (isPromiseLike(result)) {
          // WPS 不会自动等待 Promise；这里显式接住异步错误，避免按钮点击后静默失败。
          void result.then(undefined, dependencies.reportError);
        }
      } catch (error) {
        dependencies.reportError(error);
      }
    }
  };
}
