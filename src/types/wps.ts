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

export interface WpsApplication {
  ActiveWorkbook?: WpsWorkbook;
  ActiveSheet?: WpsSheet;
  Selection?: WpsRange;
  Worksheets?: WpsSheets;
  Sheets?: WpsSheets;
}

export interface RibbonControl {
  Id?: string;
  id?: string;
  ID?: string;
}

export interface RibbonApi {
  OnAddinLoad(ribbonUi: unknown): void;
  OnAction(control: RibbonControl): void;
}

export interface ScrapVarianceGlobal {
  Application?: WpsApplication;
  ribbon?: RibbonApi;
  ScrapVarianceRibbonUi?: unknown;
  ScrapVarianceRibbonState?: Partial<RibbonQueryState>;
  alert?: (message: string) => void;
  console?: Pick<Console, "error" | "log">;
}
