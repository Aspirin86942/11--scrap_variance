import type { ButtonActionRegistry, ButtonActionTestResult } from "../actions/button-actions";
import type { RibbonQueryState } from "./scrap";

export type WpsCellValue = string | number | boolean | Date | null | undefined;
export type WpsMatrix = WpsCellValue[][];

// WPS 对象模型在测试环境里只能用 mock 表达，所以类型只描述本项目实际访问到的最小接口面。
export interface WpsRowOperationTarget {
  Insert?: () => void;
  Delete?: () => void;
}

export interface WpsCollectionCount {
  Count?: number;
}

export interface WpsRange {
  Value?: unknown;
  Value2?: unknown;
  Row?: number;
  Column?: number;
  Address?: string;
  Rows?: WpsCollectionCount;
  Columns?: WpsCollectionCount;
  EntireRow?: WpsRowOperationTarget;
  Insert?: () => void;
  Delete?: () => void;
  ClearContents?: () => void;
}

// 工作表适配层只需要名称、UsedRange 和按地址取 Range，避免把完整 Office API 泄漏到业务层。
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
  removeItem?(key: string): void;
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

// WPS 传入的 control 字段在不同宿主里大小写不稳定，所以这里把可能出现的写法都纳入类型。
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

// 全局对象是 WPS 加载项入口、按钮注册、弹窗状态和测试入口之间的共享边界。
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
