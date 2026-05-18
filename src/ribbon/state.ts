import { parseFilters } from "../core/build-oa-rows";
import { DEFAULT_QUERY_DIRECTION, parseQueryDirection } from "../core/query-direction";
import type { QueryFilters, RibbonQueryState } from "../types/scrap";
import type { ScrapVarianceGlobal } from "../types/wps";
import { normalizeText } from "../utils/text";

export const DEFAULT_RIBBON_STATE: RibbonQueryState = {
  company: "",
  dept1: "",
  dept2: "",
  startDate: "",
  endDate: "",
  queryDirection: DEFAULT_QUERY_DIRECTION
};

const RIBBON_STATE_KEYS = new Set<keyof RibbonQueryState>([
  "company",
  "dept1",
  "dept2",
  "startDate",
  "endDate",
  "queryDirection"
]);

export function getRibbonState(root: ScrapVarianceGlobal = globalThis as ScrapVarianceGlobal): RibbonQueryState {
  return {
    ...DEFAULT_RIBBON_STATE,
    ...(root.ScrapVarianceRibbonState ?? {})
  };
}

export function updateRibbonState(
  root: ScrapVarianceGlobal = globalThis as ScrapVarianceGlobal,
  key: string,
  value: unknown
): void {
  if (!RIBBON_STATE_KEYS.has(key as keyof RibbonQueryState)) {
    throw new Error(`未知功能区输入项：${key}`);
  }

  const current = getRibbonState(root);
  if (key === "queryDirection") {
    root.ScrapVarianceRibbonState = {
      ...current,
      queryDirection: parseQueryDirection(value)
    };
    return;
  }

  root.ScrapVarianceRibbonState = {
    ...current,
    [key]: normalizeText(value)
  };
}

export function readRibbonFilters(root: ScrapVarianceGlobal = globalThis as ScrapVarianceGlobal): QueryFilters {
  const state = getRibbonState(root);
  return parseFilters({
    company: state.company,
    dept1: state.dept1,
    dept2: state.dept2,
    startDate: state.startDate,
    endDate: state.endDate
  });
}
