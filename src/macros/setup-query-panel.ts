import type { ScrapVarianceGlobal, WpsSheet } from "../types/wps";
import { setupOutputSheets } from "./output-sheets";

export function setupQueryPanel(root?: ScrapVarianceGlobal): WpsSheet {
  // 旧入口名仍然保留，但实际只委托新版输出页初始化，避免两套建表逻辑分叉。
  return setupOutputSheets(root);
}
