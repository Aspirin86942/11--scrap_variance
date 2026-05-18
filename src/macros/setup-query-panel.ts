import type { ScrapVarianceGlobal, WpsSheet } from "../types/wps";
import { setupOutputSheets } from "./output-sheets";

export function setupQueryPanel(root?: ScrapVarianceGlobal): WpsSheet {
  return setupOutputSheets(root);
}
