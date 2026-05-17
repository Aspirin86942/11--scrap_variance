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
    expect(grouped.get("CHBF2026050001||MAT-A")?.oaDate).toBe("2026-05-01");
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
    expect(erpForOa.get("CHBF2026050001||MAT-A")?.erpDocNumbers).toBe("QOUT1,QOUT2");
    expect(erpForOa.get("CHBF2026050001||MAT-A")?.erpDate).toBe("2026-05-03、2026-05-04");
    expect([...erpOnly.keys()]).toEqual(["CHBF9999999999||MAT-Z"]);
    expect(erpOnly.get("CHBF9999999999||MAT-Z")?.erpDate).toBe("2026-05-04");
  });

  it("deduplicates aggregate dates without changing the grouping key", () => {
    const filters = parseFilters({
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026-05-01",
      endDate: "2026-05-31"
    });
    const grouped = buildOaRows(
      [
        { 表单编号: "F-DATE", 申请日期: "2026/5/1", 公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料代码: "MAT-A", 物料名称: "物料A", 数量: 1, 实际预算金额mx: 10 },
        { 表单编号: "F-DATE", 申请日期: "2026-05-01", 公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料代码: "MAT-A", 物料名称: "物料A", 数量: 2, 实际预算金额mx: 20 },
        { 表单编号: "F-DATE", 申请日期: "2026/5/2", 公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料代码: "MAT-A", 物料名称: "物料A", 数量: 3, 实际预算金额mx: 30 }
      ],
      filters
    );

    expect(grouped.get("F-DATE||MAT-A")?.oaDate).toBe("2026-05-01、2026-05-02");
    expect(grouped.get("F-DATE||MAT-A")?.quantity.toString()).toBe("6");
  });

  it("rejects invalid ERP dates for matched OA forms", () => {
    const filters = parseFilters({});
    const oaGrouped = buildOaRows(
      [
        {
          表单编号: "CHBF2026050001",
          申请日期: "2026/5/1",
          公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料代码: "MAT-A",
          物料名称: "物料A",
          数量: 1,
          实际预算金额mx: 10
        }
      ],
      filters
    );

    expect(() =>
      buildErpRowsForOa(
        [
          {
            单据编号: "QOUT1",
            日期: "not-a-date",
            源单单号: "CHBF2026050001",
            区分公司简称: "数控",
            一级部门: "生产",
            二级部门: "仓储",
            物料编码: "MAT-A",
            物料名称: "物料A",
            实发数量: 1,
            总成本: 10
          }
        ],
        oaGrouped
      )
    ).toThrow(/日期格式不正确/);
  });

  it("classifies missing OA material as material mismatch when the same form has ERP rows", () => {
    const filters = parseFilters({});
    const oaGrouped = buildOaRows(
      [
        {
          表单编号: "F-MISMATCH",
          申请日期: "2026/5/1",
          公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料代码: "MAT-A",
          物料名称: "物料A",
          数量: 1,
          实际预算金额mx: 10
        }
      ],
      filters
    );
    const erpForOa = buildErpRowsForOa(
      [
        {
          单据编号: "QOUT1",
          日期: "2026/5/2",
          源单单号: "F-MISMATCH",
          区分公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料编码: "MAT-B",
          物料名称: "物料B",
          实发数量: 1,
          总成本: 10
        }
      ],
      oaGrouped
    );

    const details = compareRows(oaGrouped, erpForOa, new Map());

    expect(details.map((row) => row.differenceType)).toEqual([
      "OA和ERP都有，但物料明细不一致",
      "OA和ERP都有，但物料明细不一致"
    ]);
  });

  it("excludes ERP-only rows outside date or organization filters", () => {
    const filters = parseFilters({
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026-05-01",
      endDate: "2026-05-31"
    });
    const grouped = buildErpOnlyRows(
      [
        {
          单据编号: "KEEP",
          日期: "2026/5/2",
          源单单号: "F-KEEP",
          区分公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料编码: "MAT-A",
          物料名称: "物料A",
          实发数量: 1,
          总成本: 10
        },
        {
          单据编号: "OUT-DATE",
          日期: "2026/6/1",
          源单单号: "F-OUT-DATE",
          区分公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料编码: "MAT-B",
          物料名称: "物料B",
          实发数量: 1,
          总成本: 10
        },
        {
          单据编号: "OUT-ORG",
          日期: "2026/5/2",
          源单单号: "F-OUT-ORG",
          区分公司简称: "装备",
          一级部门: "生产",
          二级部门: "仓储",
          物料编码: "MAT-C",
          物料名称: "物料C",
          实发数量: 1,
          总成本: 10
        }
      ],
      new Set(),
      filters
    );

    expect([...grouped.keys()]).toEqual(["F-KEEP||MAT-A"]);
  });

  it("deduplicates ERP document numbers while preserving first-seen order", () => {
    const filters = parseFilters({});
    const oaGrouped = buildOaRows(
      [
        {
          表单编号: "F-DOC",
          申请日期: "2026/5/1",
          公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料代码: "MAT-A",
          物料名称: "物料A",
          数量: 3,
          实际预算金额mx: 30
        }
      ],
      filters
    );

    const erpForOa = buildErpRowsForOa(
      [
        { 单据编号: "Q2", 日期: "2026/5/2", 源单单号: "F-DOC", 区分公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料编码: "MAT-A", 物料名称: "物料A", 实发数量: 1, 总成本: 10 },
        { 单据编号: "Q1", 日期: "2026/5/2", 源单单号: "F-DOC", 区分公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料编码: "MAT-A", 物料名称: "物料A", 实发数量: 1, 总成本: 10 },
        { 单据编号: "Q2", 日期: "2026/5/2", 源单单号: "F-DOC", 区分公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料编码: "MAT-A", 物料名称: "物料A", 实发数量: 1, 总成本: 10 }
      ],
      oaGrouped
    );

    expect(erpForOa.get("F-DOC||MAT-A")?.erpDocNumbers).toBe("Q2,Q1");
    expect(compareRows(oaGrouped, erpForOa, new Map())[0]?.erpDocNumbers).toBe("Q2,Q1");
  });

  it("classifies quantities after Decimal two-decimal output rounding", () => {
    const filters = parseFilters({});
    const oaGrouped = buildOaRows(
      [
        { 表单编号: "F-SAME", 申请日期: "2026/5/1", 公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料代码: "A", 物料名称: "A物料", 数量: "1.004", 实际预算金额mx: 10 },
        { 表单编号: "F-DIFF", 申请日期: "2026/5/1", 公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料代码: "B", 物料名称: "B物料", 数量: "1.004", 实际预算金额mx: 10 }
      ],
      filters
    );
    const erpForOa = buildErpRowsForOa(
      [
        { 单据编号: "Q-SAME", 日期: "2026/5/2", 源单单号: "F-SAME", 区分公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料编码: "A", 物料名称: "A物料", 实发数量: "1.004", 总成本: 10 },
        { 单据编号: "Q-DIFF", 日期: "2026/5/2", 源单单号: "F-DIFF", 区分公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料编码: "B", 物料名称: "B物料", 实发数量: "1.005", 总成本: 10 }
      ],
      oaGrouped
    );

    const details = compareRows(oaGrouped, erpForOa, new Map());

    expect(details.map((row) => [row.formNumber, row.oaQuantity, row.erpQuantity, row.differenceType])).toEqual([
      ["F-SAME", 1, 1, "OA和ERP都有，数量一致"],
      ["F-DIFF", 1, 1.01, "OA和ERP都有，但数量不同"]
    ]);
  });

  it("aggregates Decimal edge quantities before two-decimal detail and summary output", () => {
    const filters = parseFilters({});
    const oaGrouped = buildOaRows(
      [
        { 表单编号: "F-DEC", 申请日期: "2026/5/1", 公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料代码: "A", 物料名称: "A物料", 数量: "0.335", 实际预算金额mx: "0.335" },
        { 表单编号: "F-DEC", 申请日期: "2026/5/1", 公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料代码: "A", 物料名称: "A物料", 数量: "0.335", 实际预算金额mx: "0.335" },
        { 表单编号: "F-DEC", 申请日期: "2026/5/1", 公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料代码: "A", 物料名称: "A物料", 数量: "0.335", 实际预算金额mx: "0.335" }
      ],
      filters
    );
    const details = compareRows(oaGrouped, new Map(), new Map());
    const summaryRows = buildSummaryRows(details);

    expect(details[0]?.oaQuantity).toBe(1.01);
    expect(details[0]?.quantityDiff).toBe(1.01);
    expect(details[0]?.oaAmount).toBe(1.01);
    expect(summaryRows[0]?.oaQuantity).toBe(1.01);
    expect(summaryRows[0]?.quantityDiff).toBe(1.01);
    expect(summaryRows[0]?.oaAmount).toBe(1.01);
  });

  it("writes OA and ERP dates into detail output columns", () => {
    const filters = parseFilters({});
    const oaGrouped = buildOaRows(
      [
        { 表单编号: "F-DATE-OUT", 申请日期: "2026/5/1", 公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料代码: "MAT-A", 物料名称: "物料A", 数量: 2, 实际预算金额mx: 20 }
      ],
      filters
    );
    const erpForOa = buildErpRowsForOa(
      [
        { 单据编号: "QOUT1", 日期: "2026/5/3", 源单单号: "F-DATE-OUT", 区分公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料编码: "MAT-A", 物料名称: "物料A", 实发数量: 1, 总成本: 9 },
        { 单据编号: "QOUT2", 日期: "2026/5/4", 源单单号: "F-DATE-OUT", 区分公司简称: "数控", 一级部门: "生产", 二级部门: "仓储", 物料编码: "MAT-A", 物料名称: "物料A", 实发数量: 1, 总成本: 11 }
      ],
      oaGrouped
    );

    const details = compareRows(oaGrouped, erpForOa, new Map());
    const values = detailRowsToValues(details);

    expect(values[0]).toEqual([
      "差异类型",
      "OA表单编号",
      "OA申请日期",
      "ERP出库单号",
      "ERP日期",
      "物料编码",
      "物料名称",
      "公司简称",
      "一级部门",
      "二级部门",
      "OA数量合计",
      "ERP实发数量合计",
      "数量差额",
      "OA实际预算金额mx合计",
      "ERP总成本合计",
      "金额差额",
      "备注"
    ]);
    expect(values[1]).toEqual([
      "OA和ERP都有，数量一致",
      "F-DATE-OUT",
      "2026-05-01",
      "QOUT1,QOUT2",
      "2026-05-03、2026-05-04",
      "MAT-A",
      "物料A",
      "数控",
      "生产",
      "仓储",
      2,
      2,
      0,
      20,
      20,
      0,
      ""
    ]);
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

  it("keeps old JS empty-input compatibility at core boundaries", () => {
    expect([...buildOaRows(undefined, undefined).entries()]).toEqual([]);
    expect([...buildOaRows(null, null).entries()]).toEqual([]);
    expect([...buildErpRowsForOa(undefined, undefined).entries()]).toEqual([]);
    expect([...buildErpRowsForOa(null, null).entries()]).toEqual([]);
    expect([...buildErpOnlyRows(undefined, undefined, undefined).entries()]).toEqual([]);
    expect([...buildErpOnlyRows(null, null, null).entries()]).toEqual([]);
    expect(compareRows(undefined, undefined, undefined)).toEqual([]);
    expect(compareRows(null, null, null)).toEqual([]);
    expect(buildSummaryRows(undefined)).toEqual([]);
    expect(buildSummaryRows(null)).toEqual([]);
    expect(summaryRowsToValues(undefined)).toEqual([
      [
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
      ]
    ]);
    expect(detailRowsToValues(undefined)).toEqual([
      [
        "差异类型",
        "OA表单编号",
        "OA申请日期",
        "ERP出库单号",
        "ERP日期",
        "物料编码",
        "物料名称",
        "公司简称",
        "一级部门",
        "二级部门",
        "OA数量合计",
        "ERP实发数量合计",
        "数量差额",
        "OA实际预算金额mx合计",
        "ERP总成本合计",
        "金额差额",
        "备注"
      ]
    ]);
  });
});
