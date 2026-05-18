import { getButtonAction, type ButtonActionRegistry } from "../actions/button-actions";
import type { RibbonApi, RibbonControl, ScrapVarianceGlobal } from "../types/wps";
import { normalizeText } from "../utils/text";

export interface RibbonDependencies {
  buttonActions: ButtonActionRegistry;
  reportError(error: unknown): void;
  root?: ScrapVarianceGlobal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getControlId(control: RibbonControl | unknown): string {
  if (!isRecord(control)) {
    return "";
  }

  return normalizeText(control.Id ?? control.id ?? control.ID);
}

export function createRibbonHandlers(dependencies: RibbonDependencies): RibbonApi {
  const root = dependencies.root ?? (globalThis as ScrapVarianceGlobal);

  return {
    OnAddinLoad(ribbonUi: unknown): void {
      root.ScrapVarianceRibbonUi = ribbonUi;
    },
    OnAction(control: RibbonControl): void {
      try {
        const controlId = getControlId(control);
        getButtonAction(dependencies.buttonActions, controlId).run();
      } catch (error) {
        dependencies.reportError(error);
      }
    }
  };
}
