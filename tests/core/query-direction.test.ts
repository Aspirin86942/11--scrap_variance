import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUERY_DIRECTION,
  QUERY_DIRECTIONS,
  parseQueryDirection
} from "../../src/core/query-direction";

describe("query direction parser", () => {
  it("defaults blank values to OA Kingdee lookup", () => {
    expect(parseQueryDirection("")).toBe(DEFAULT_QUERY_DIRECTION);
    expect(parseQueryDirection(null)).toBe(DEFAULT_QUERY_DIRECTION);
    expect(parseQueryDirection(undefined)).toBe(DEFAULT_QUERY_DIRECTION);
    expect(parseQueryDirection("   ")).toBe(DEFAULT_QUERY_DIRECTION);
  });

  it("accepts the two supported panel labels", () => {
    expect(parseQueryDirection("OA金蝶单号查ERP")).toBe(QUERY_DIRECTIONS.oaKingdeeToErp);
    expect(parseQueryDirection("ERP源单查OA")).toBe(QUERY_DIRECTIONS.erpSourceToOa);
  });

  it("rejects unsupported labels with the user-facing guidance", () => {
    expect(() => parseQueryDirection("OA查ERP")).toThrow(
      "查询方向不正确：请填写 OA金蝶单号查ERP 或 ERP源单查OA"
    );
  });
});
