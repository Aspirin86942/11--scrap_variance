import { describe, expect, it } from "vitest";
import { QUERY_DIRECTIONS } from "../../src/core/query-direction";
import {
  DEFAULT_RIBBON_STATE,
  getRibbonState,
  readRibbonFilters,
  updateRibbonState
} from "../../src/ribbon/state";
import type { ScrapVarianceGlobal } from "../../src/types/wps";

describe("ribbon state", () => {
  it("defaults blank filters and the legacy query direction", () => {
    const root: ScrapVarianceGlobal = {};

    expect(getRibbonState(root)).toEqual(DEFAULT_RIBBON_STATE);
    expect(readRibbonFilters(root)).toEqual({
      company: "",
      dept1: "",
      dept2: "",
      startDate: "",
      endDate: ""
    });
  });

  it("normalizes updates from ribbon edit boxes", () => {
    const root: ScrapVarianceGlobal = {};

    updateRibbonState(root, "company", " 数控 ");
    updateRibbonState(root, "dept1", "生产");
    updateRibbonState(root, "dept2", "仓储");
    updateRibbonState(root, "startDate", "2026/5/1");
    updateRibbonState(root, "endDate", "2026/5/31");
    updateRibbonState(root, "queryDirection", QUERY_DIRECTIONS.erpSourceToOa);

    expect(getRibbonState(root)).toEqual({
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026/5/1",
      endDate: "2026/5/31",
      queryDirection: QUERY_DIRECTIONS.erpSourceToOa
    });
  });

  it("normalizes partial global state when reading", () => {
    const root: ScrapVarianceGlobal = {
      ScrapVarianceRibbonState: {
        company: " 数控 ",
        dept1: " 生产 "
      }
    };

    expect(getRibbonState(root)).toEqual({
      company: "数控",
      dept1: "生产",
      dept2: "",
      startDate: "",
      endDate: "",
      queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp
    });
  });

  it("rejects invalid existing query direction when reading", () => {
    const root: ScrapVarianceGlobal = {
      ScrapVarianceRibbonState: {
        queryDirection: "OA查ERP" as never
      }
    };

    expect(() => getRibbonState(root)).toThrow("查询方向不正确：请填写 OA金蝶单号查ERP 或 ERP源单查OA");
  });

  it("readRibbonFilters normalizes dates and rejects inverted date ranges", () => {
    expect(
      readRibbonFilters({
        ScrapVarianceRibbonState: {
          startDate: "2026/5/1",
          endDate: "2026/5/31"
        }
      })
    ).toEqual({
      company: "",
      dept1: "",
      dept2: "",
      startDate: "2026-05-01",
      endDate: "2026-05-31"
    });

    expect(() =>
      readRibbonFilters({
        ScrapVarianceRibbonState: {
          startDate: "2026/5/31",
          endDate: "2026/5/1"
        }
      })
    ).toThrow("开始日期不能晚于结束日期：2026-05-31 > 2026-05-01");
  });

  it("rejects unsupported state keys and query directions", () => {
    const root: ScrapVarianceGlobal = {};

    expect(() => updateRibbonState(root, "missing", "x")).toThrow("未知功能区输入项：missing");
    expect(() => updateRibbonState(root, "queryDirection", "OA查ERP")).toThrow(
      "查询方向不正确：请填写 OA金蝶单号查ERP 或 ERP源单查OA"
    );
  });
});
