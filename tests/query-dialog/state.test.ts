import { describe, expect, it } from "vitest";
import { QUERY_DIRECTIONS } from "../../src/core/query-direction";
import { buildDefaultQueryDialogState, normalizeQueryDialogState } from "../../src/query-dialog/state";

describe("query dialog state", () => {
  it("defaults to blank filters and the OA-to-ERP direction", () => {
    expect(buildDefaultQueryDialogState()).toEqual({
      company: "",
      dept1: "",
      dept2: "",
      startDate: "",
      endDate: "",
      queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp
    });
  });

  it("normalizes blank fields as all and trims text", () => {
    expect(
      normalizeQueryDialogState({
        company: " 数控 ",
        dept1: " ",
        dept2: "",
        startDate: "",
        endDate: undefined,
        queryDirection: ""
      })
    ).toEqual({
      company: "数控",
      dept1: "",
      dept2: "",
      startDate: "",
      endDate: "",
      queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp
    });
  });

  it("preserves a supported explicit query direction", () => {
    expect(
      normalizeQueryDialogState({
        queryDirection: QUERY_DIRECTIONS.erpSourceToOa
      })
    ).toEqual({
      company: "",
      dept1: "",
      dept2: "",
      startDate: "",
      endDate: "",
      queryDirection: QUERY_DIRECTIONS.erpSourceToOa
    });
  });

  it("rejects invalid date ranges before query output is cleared", () => {
    expect(() =>
      normalizeQueryDialogState({
        startDate: "2026/5/31",
        endDate: "2026/5/1"
      })
    ).toThrow("开始日期不能晚于结束日期：2026-05-31 > 2026-05-01");
  });

  it("rejects invalid date text before query output is cleared", () => {
    expect(() =>
      normalizeQueryDialogState({
        startDate: "not-a-date"
      })
    ).toThrow("日期格式不正确：not-a-date");
  });
});
