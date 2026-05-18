import { normalizeText } from "../utils/text";

export const QUERY_DIRECTIONS = {
  oaKingdeeToErp: "OA金蝶单号查ERP",
  erpSourceToOa: "ERP源单查OA"
} as const;

export type QueryDirection = (typeof QUERY_DIRECTIONS)[keyof typeof QUERY_DIRECTIONS];

export const DEFAULT_QUERY_DIRECTION: QueryDirection = QUERY_DIRECTIONS.oaKingdeeToErp;

export function parseQueryDirection(value: unknown): QueryDirection {
  const text = normalizeText(value);

  if (!text) {
    return DEFAULT_QUERY_DIRECTION;
  }

  if (text === QUERY_DIRECTIONS.oaKingdeeToErp || text === QUERY_DIRECTIONS.erpSourceToOa) {
    return text;
  }

  throw new Error("查询方向不正确：请填写 OA金蝶单号查ERP 或 ERP源单查OA");
}
