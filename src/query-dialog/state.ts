import { parseFilters } from "../core/build-oa-rows";
import { DEFAULT_QUERY_DIRECTION, parseQueryDirection } from "../core/query-direction";
import type { RibbonQueryState } from "../types/scrap";
import { normalizeText } from "../utils/text";

export type QueryDialogStateInput = Partial<Record<keyof RibbonQueryState, unknown>> | null | undefined;

export function buildDefaultQueryDialogState(): RibbonQueryState {
  return {
    company: "",
    dept1: "",
    dept2: "",
    startDate: "",
    endDate: "",
    queryDirection: DEFAULT_QUERY_DIRECTION
  };
}

export function normalizeQueryDialogState(input: QueryDialogStateInput = {}): RibbonQueryState {
  const source = input ?? {};
  const queryState: RibbonQueryState = {
    company: normalizeText(source.company),
    dept1: normalizeText(source.dept1),
    dept2: normalizeText(source.dept2),
    startDate: normalizeText(source.startDate),
    endDate: normalizeText(source.endDate),
    queryDirection: parseQueryDirection(normalizeText(source.queryDirection) || DEFAULT_QUERY_DIRECTION)
  };

  // 查询层会先清空旧输出；这里提前校验，避免非法日期破坏当前结果。
  parseFilters(queryState);
  return queryState;
}
