import { QUERY_DIRECTIONS } from "../core/query-direction";
import type { RibbonApi, RibbonControl, ScrapVarianceGlobal } from "../types/wps";
import { normalizeText } from "../utils/text";
import { getRibbonState, resetRibbonState, updateRibbonState } from "./state";

export interface RibbonDependencies {
  runPrecheck(): void;
  setupOutputSheets(): void;
  queryCurrentSheet(): void;
  toggleMaterialRows(): void;
  runDiagnostics(): void;
  reportError(error: unknown): void;
  root?: ScrapVarianceGlobal;
}

const DIRECTION_LABELS = [QUERY_DIRECTIONS.oaKingdeeToErp, QUERY_DIRECTIONS.erpSourceToOa] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getControlId(control: RibbonControl | unknown): string {
  if (!isRecord(control)) {
    return "";
  }

  return normalizeText(control.Id ?? control.id ?? control.ID);
}

export function getControlText(controlOrText: RibbonControl | unknown, fallback?: unknown): string {
  if (fallback !== undefined) {
    return normalizeText(fallback);
  }
  if (!isRecord(controlOrText)) {
    return normalizeText(controlOrText);
  }

  return normalizeText(controlOrText.Text ?? controlOrText.text ?? controlOrText.Value ?? controlOrText.value);
}

export function getDirectionSelection(controlOrSelection: RibbonControl | unknown, fallback?: unknown): unknown {
  if (fallback !== undefined) {
    return fallback;
  }
  if (!isRecord(controlOrSelection)) {
    return controlOrSelection;
  }

  return (
    controlOrSelection.selectedId ??
    controlOrSelection.SelectedId ??
    controlOrSelection.selectedIndex ??
    controlOrSelection.SelectedIndex ??
    controlOrSelection.Value ??
    controlOrSelection.value ??
    controlOrSelection.Index ??
    controlOrSelection.index
  );
}

export function createRibbonHandlers(dependencies: RibbonDependencies): RibbonApi {
  const root = dependencies.root ?? (globalThis as ScrapVarianceGlobal);
  resetRibbonState(root);

  const updateInput = (key: string, controlOrText?: unknown, text?: unknown): void => {
    try {
      updateRibbonState(root, key, getControlText(controlOrText, text));
    } catch (error) {
      dependencies.reportError(error);
    }
  };
  const updateDirection = (key: string, controlOrSelection?: unknown, selectedIdOrIndex?: unknown): void => {
    try {
      const selection = getDirectionSelection(controlOrSelection, selectedIdOrIndex);
      const index = typeof selection === "number" ? selection : Number(selection);
      updateRibbonState(root, key, DIRECTION_LABELS[index] ?? selection);
    } catch (error) {
      dependencies.reportError(error);
    }
  };

  return {
    OnAddinLoad(ribbonUi: unknown): void {
      root.ScrapVarianceRibbonUi = ribbonUi;
      resetRibbonState(root);
    },
    OnAction(control: RibbonControl): void {
      try {
        const controlId = getControlId(control);

        switch (controlId) {
          case "btnPrecheck":
            dependencies.runPrecheck();
            return;
          case "btnSetupOutputSheets":
            dependencies.setupOutputSheets();
            return;
          case "btnQueryCurrentSheet":
            dependencies.queryCurrentSheet();
            return;
          case "btnToggleMaterialRows":
            dependencies.toggleMaterialRows();
            return;
          case "btnPerformanceDiagnostics":
            dependencies.runDiagnostics();
            return;
          default:
            throw new Error(`未知功能区按钮：${controlId}`);
        }
      } catch (error) {
        dependencies.reportError(error);
      }
    },
    OnInputChange(control: RibbonControl, text?: string): void {
      updateInput(getControlId(control), control, text);
    },
    OnDirectionChange(control: RibbonControl, selectedIdOrIndex?: string | number): void {
      updateDirection(getControlId(control), control, selectedIdOrIndex);
    },
    OnCompanyChange(controlOrText?: unknown, text?: unknown): void {
      updateInput("company", controlOrText, text);
    },
    OnDept1Change(controlOrText?: unknown, text?: unknown): void {
      updateInput("dept1", controlOrText, text);
    },
    OnDept2Change(controlOrText?: unknown, text?: unknown): void {
      updateInput("dept2", controlOrText, text);
    },
    OnStartDateChange(controlOrText?: unknown, text?: unknown): void {
      updateInput("startDate", controlOrText, text);
    },
    OnEndDateChange(controlOrText?: unknown, text?: unknown): void {
      updateInput("endDate", controlOrText, text);
    },
    OnQueryDirectionChange(controlOrSelection?: unknown, selectedIdOrIndex?: unknown): void {
      updateDirection("queryDirection", controlOrSelection, selectedIdOrIndex);
    },
    GetDirectionCount(): number {
      return DIRECTION_LABELS.length;
    },
    GetDirectionLabel(_control: RibbonControl, index: number): string {
      return DIRECTION_LABELS[index] ?? "";
    },
    GetDirectionSelectedIndex(): number {
      const current = getRibbonState(root).queryDirection;
      return Math.max(0, DIRECTION_LABELS.findIndex((label) => label === current));
    }
  };
}
