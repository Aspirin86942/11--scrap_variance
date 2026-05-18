import type { ButtonActionRegistry, ButtonActionTestResult } from "../actions/button-actions";
import type { RibbonQueryState } from "./scrap";

export type WpsCellValue = string | number | boolean | Date | null | undefined;
export type WpsMatrix = WpsCellValue[][];

export interface WpsRowOperationTarget {
  Insert?: () => void;
  Delete?: () => void;
}

export interface WpsRange {
  Value?: unknown;
  Value2?: unknown;
  Row?: number;
  EntireRow?: WpsRowOperationTarget;
  Insert?: () => void;
  Delete?: () => void;
  ClearContents?: () => void;
}

export interface WpsSheet {
  Name: string;
  UsedRange?: WpsRange;
  Range(address: string): WpsRange;
}

export interface WpsSheets {
  Count: number;
  Item(index: number): WpsSheet;
  Add(): WpsSheet;
}

export interface WpsWorkbook {
  Worksheets?: WpsSheets;
  Sheets?: WpsSheets;
}

export interface WpsPluginStorage {
  getItem(key: string): unknown;
  setItem(key: string, value: unknown): void;
}

export interface WpsApplication {
  ActiveWorkbook?: WpsWorkbook;
  ActiveSheet?: WpsSheet;
  Selection?: WpsRange;
  Worksheets?: WpsSheets;
  Sheets?: WpsSheets;
  PluginStorage?: WpsPluginStorage;
  ShowDialog?: (url: string, title: string, width: number, height: number, modal: boolean) => unknown;
}

export interface RibbonControl {
  Id?: string;
  id?: string;
  ID?: string;
  Text?: string;
  text?: string;
  Value?: string | number;
  value?: string | number;
  selectedId?: string | number;
  SelectedId?: string | number;
  selectedIndex?: string | number;
  SelectedIndex?: string | number;
  Index?: string | number;
  index?: string | number;
}

export interface RibbonApi {
  OnAddinLoad(ribbonUi: unknown): void;
  OnAction(control: RibbonControl): void;
}

export interface ScrapVarianceGlobal {
  Application?: WpsApplication;
  ribbon?: RibbonApi;
  buttonActions?: ButtonActionRegistry;
  __WPS_RUN_ALL_BUTTON_TESTS__?: () => Promise<ButtonActionTestResult[]>;
  ScrapVarianceRibbonUi?: unknown;
  ScrapVarianceRibbonState?: Partial<RibbonQueryState>;
  alert?: (message: string) => void;
  console?: Pick<Console, "error" | "log">;
}
