import { QUERY_DIRECTIONS } from "../core/query-direction";
import type { RibbonApi, RibbonControl, ScrapVarianceGlobal } from "../types/wps";
import { normalizeText } from "../utils/text";
import { getRibbonState, updateRibbonState } from "./state";

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

export function getControlId(control: RibbonControl): string {
  return control.Id ?? control.id ?? control.ID ?? "";
}

export function getControlText(control: RibbonControl, fallback?: unknown): string {
  return normalizeText(fallback ?? control.Text ?? control.text ?? control.Value ?? control.value);
}

export function getDirectionSelection(control: RibbonControl, fallback?: unknown): unknown {
  return (
    fallback ??
    control.selectedId ??
    control.SelectedId ??
    control.selectedIndex ??
    control.SelectedIndex ??
    control.Value ??
    control.value ??
    control.Index ??
    control.index
  );
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
      try {
        updateRibbonState(root, getControlId(control), getControlText(control, text));
      } catch (error) {
        dependencies.reportError(error);
      }
    },
    OnDirectionChange(control: RibbonControl, selectedIdOrIndex?: string | number): void {
      try {
        const selection = getDirectionSelection(control, selectedIdOrIndex);
        const index = typeof selection === "number" ? selection : Number(selection);
        updateRibbonState(root, getControlId(control), DIRECTION_LABELS[index] ?? selection);
      } catch (error) {
        dependencies.reportError(error);
      }
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
