import { describe, expect, it } from "vitest";
import { buildErpOnlyRows, buildErpRowsForOa } from "../../src/core/build-erp-rows";
import { buildOaRows, collectSelectedOaForms, parseFilters } from "../../src/core/build-oa-rows";
import { buildSummaryRows, detailRowsToValues, summaryRowsToValues } from "../../src/core/build-summary-rows";
import { compareRows } from "../../src/core/compare-rows";
import type { RawRow } from "../../src/types/scrap";

describe("query core", () => {
  it("filters OA rows and groups by form plus material using Decimal arithmetic", () => {
    const filters = parseFilters({
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      startDate: "2026-05-01",
      endDate: "2026-05-31"
    });
    const rows: RawRow[] = [
      {
        表单编号: "CHBF2026050001",
        申请日期: "2026/5/1",
        公司简称: "数控",
        一级部门: "生产运营中心",
        二级部门: "仓储部",
        物料代码: "MAT-A",
        物料名称: "物料A",
        数量: "0.1",
        实际预算金额mx: "10.10"
      },
      {
        表单编号: "CHBF2026050001",
        申请日期: "2026/5/1",
        公司简称: "数控",
        一级部门: "生产运营中心",
        二级部门: "仓储部",
        物料代码: "MAT-A",
        物料名称: "物料A",
        数量: "0.2",
        实际预算金额mx: "15.20"
      },
      {
        表单编号: "CHBF2026060001",
        申请日期: "2026/6/1",
        公司简称: "数控",
        一级部门: "生产运营中心",
        二级部门: "仓储部",
        物料代码: "MAT-B",
        物料名称: "物料B",
        数量: 9,
        实际预算金额mx: 90
      }
    ];

    const grouped = buildOaRows(rows, filters);

    expect([...grouped.keys()]).toEqual(["CHBF2026050001||MAT-A"]);
    expect(grouped.get("CHBF2026050001||MAT-A")?.quantity.toString()).toBe("0.3");
    expect(grouped.get("CHBF2026050001||MAT-A")?.amount.toString()).toBe("25.3");
  });

  it("groups matched ERP rows and keeps ERP-only rows based on current OA filters", () => {
    const filters = parseFilters({
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      startDate: "2026-05-01",
      endDate: "2026-05-31"
    });
    const oaGrouped = buildOaRows(
      [
        {
          表单编号: "CHBF2026050001",
          申请日期: "2026/5/1",
          公司简称: "数控",
          一级部门: "生产运营中心",
          二级部门: "仓储部",
          物料代码: "MAT-A",
          物料名称: "物料A",
          数量: 2,
          实际预算金额mx: 20
        }
      ],
      filters
    );
    const erpRows: RawRow[] = [
      {
        单据编号: "QOUT1",
        日期: "2026/5/3",
        源单单号: "CHBF2026050001",
        区分公司简称: "数控",
        一级部门: "生产运营中心",
        二级部门: "仓储部",
        物料编码: "MAT-A",
        物料名称: "物料A",
        实发数量: 1,
        总成本: 9
      },
      {
        单据编号: "QOUT2",
        日期: "2026/5/4",
        源单单号: "CHBF2026050001",
        区分公司简称: "数控",
        一级部门: "生产运营中心",
        二级部门: "仓储部",
        物料编码: "MAT-A",
        物料名称: "物料A",
        实发数量: 1,
        总成本: 11
      },
      {
        单据编号: "QOUT999",
        日期: "2026/5/4",
        源单单号: "CHBF9999999999",
        区分公司简称: "数控",
        一级部门: "生产运营中心",
        二级部门: "仓储部",
        物料编码: "MAT-Z",
        物料名称: "物料Z",
        实发数量: 7,
        总成本: 70
      }
    ];

    const erpForOa = buildErpRowsForOa(erpRows, oaGrouped);
    const erpOnly = buildErpOnlyRows(erpRows, collectSelectedOaForms(oaGrouped), filters);

    expect(erpForOa.get("CHBF2026050001||MAT-A")?.quantity.toString()).toBe("2");
    expect(erpForOa.get("CHBF2026050001||MAT-A")?.erpDocNumbers).toEqual(["QOUT1", "QOUT2"]);
    expect([...erpOnly.keys()]).toEqual(["CHBF9999999999||MAT-Z"]);
  });

  it("builds differences, summary rows, and output matrices with current columns", () => {
    const filters = parseFilters({});
    const oaGrouped = buildOaRows(
      [
        { 表单编号: "F1", 申请日期: "2026/5/1", 公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料代码: "A", 物料名称: "A物料", 数量: 2, 实际预算金额mx: 20 },
        { 表单编号: "F2", 申请日期: "2026/5/1", 公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料代码: "B", 物料名称: "B物料", 数量: 3, 实际预算金额mx: 30 }
      ],
      filters
    );
    const erpForOa = buildErpRowsForOa(
      [
        { 单据编号: "Q1", 日期: "2026/5/2", 源单单号: "F1", 区分公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料编码: "A", 物料名称: "A物料", 实发数量: 1, 总成本: 10 }
      ],
      oaGrouped
    );
    const detailRows = compareRows(oaGrouped, erpForOa, new Map());
    const summaryRows = buildSummaryRows(detailRows);

    expect(detailRows.map((row) => row.differenceType)).toEqual([
      "OA和ERP都有，但数量不同",
      "OA有申请，ERP无出库"
    ]);
    expect(summaryRows[0]?.quantityDiff).toBe(4);
    expect(summaryRowsToValues(summaryRows)[0]).toEqual([
      "公司简称",
      "一级部门",
      "二级部门",
      "OA数量合计",
      "ERP实发数量合计",
      "数量差额",
      "OA实际预算金额mx合计",
      "ERP总成本合计",
      "金额差额",
      "差异类型摘要"
    ]);
    expect(detailRowsToValues(detailRows)[0]).toContain("ERP出库单号");
  });
});
