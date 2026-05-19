import { parseFilters } from "../core/build-oa-rows";
import { DEFAULT_QUERY_DIRECTION, parseQueryDirection } from "../core/query-direction";
import type { QueryFilters, RibbonQueryState } from "../types/scrap";
import type { ScrapVarianceGlobal } from "../types/wps";
import { normalizeText } from "../utils/text";

// 功能区状态只保存用户输入条件；真正参与查询前还会再标准化成 QueryFilters。
export const DEFAULT_RIBBON_STATE: RibbonQueryState = {
  company: "",
  dept1: "",
  dept2: "",
  startDate: "",
  endDate: "",
  queryDirection: DEFAULT_QUERY_DIRECTION
};

const RIBBON_STATE_KEYS = new Set(Object.keys(DEFAULT_RIBBON_STATE));

export function resetRibbonState(root: ScrapVarianceGlobal = globalThis as ScrapVarianceGlobal): void {
  // 每次重置都复制默认对象，避免后续修改意外污染默认状态。
  root.ScrapVarianceRibbonState = { ...DEFAULT_RIBBON_STATE };
}

export function getRibbonState(root: ScrapVarianceGlobal = globalThis as ScrapVarianceGlobal): RibbonQueryState {
  const state = root.ScrapVarianceRibbonState ?? {};

  // WPS 控件传回的值可能是空值或非字符串，读取时统一转成业务层能处理的字符串。
  return {
    company: normalizeText(state.company),
    dept1: normalizeText(state.dept1),
    dept2: normalizeText(state.dept2),
    startDate: normalizeText(state.startDate),
    endDate: normalizeText(state.endDate),
    queryDirection: parseQueryDirection(state.queryDirection)
  };
}

export function updateRibbonState(
  root: ScrapVarianceGlobal = globalThis as ScrapVarianceGlobal,
  key: string,
  value: unknown
): void {
  if (!RIBBON_STATE_KEYS.has(key)) {
    // 非白名单 key 说明 ribbon 入口或调用方写错，直接报错比悄悄写入脏状态更容易排查。
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
  // 查询方向不属于过滤条件；这里只把公司、部门和日期交给核心查询过滤逻辑。
  return parseFilters({
    company: state.company,
    dept1: state.dept1,
    dept2: state.dept2,
    startDate: state.startDate,
    endDate: state.endDate
  });
}
