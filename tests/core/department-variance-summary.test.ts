import { describe, expect, it, vi } from "vitest";
import { DEPARTMENT_VARIANCE_SUMMARY_HEADERS } from "../../src/constants";
import { QUERY_DIRECTIONS } from "../../src/core/query-direction";
import {
  buildDepartmentVarianceSummaryRows,
  departmentVarianceSummaryRowsToValues
} from "../../src/core/department-variance-summary";
import type { DocCompareResult, DocCompareRow } from "../../src/types/scrap";
import { parseDecimal, zeroDecimal } from "../../src/utils/decimal";

describe("department variance summary", () => {
  it("summarizes from doc compare metadata without reading material rows", async () => {
    const summaryRow: DocCompareRow = {
      rowType: "汇总",
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      date: "2026-05-01",
      primaryDocNumber: "OA-META",
      primaryQuantity: 10,
      primaryAmount: 100,
      counterpartDocNumber: "ERP-META",
      counterpartQuantity: 10,
      counterpartAmount: 100,
      quantityDiff: 0,
      amountDiff: 0,
      itemCode: "",
      itemName: "",
      remark: ""
    };
    const mockedResult: DocCompareResult = {
      kind: "oa_doc_compare",
      summaryRows: [summaryRow],
      materialRowsBySummaryKey: new Map(),
      summaryItems: [
        {
          summaryKey: "meta-key",
          row: { ...summaryRow },
          materialRows: [],
          meta: {
            counterpartDocNumbers: ["ERP-META"],
            hasMaterialShapeMismatch: false,
            primaryQuantity: parseDecimal("10", "主视角数量"),
            primaryAmount: parseDecimal("100", "主视角金额"),
            counterpartQuantity: parseDecimal("10", "对方视角数量"),
            counterpartAmount: parseDecimal("100", "对方视角金额"),
            quantityDiff: zeroDecimal(),
            amountDiff: zeroDecimal()
          }
        }
      ]
    };

    vi.resetModules();
    vi.doMock("../../src/core/doc-compare", () => ({
      buildOaDocCompare: vi.fn(() => mockedResult),
      buildErpDocCompare: vi.fn(() => mockedResult),
      buildMaterialRowsForDocSummary: vi.fn(() => {
        throw new Error("summary should use metadata instead of material row lookup");
      })
    }));

    try {
      const { buildDepartmentVarianceSummaryRows } = await import("../../src/core/department-variance-summary");
      const rows = buildDepartmentVarianceSummaryRows(
        [],
        [{ 单据编号: "ERP-META" }],
        {},
        QUERY_DIRECTIONS.oaKingdeeToErp
      );

      expect(rows).toEqual([
        {
          company: "数控",
          dept1: "生产",
          dept2: "仓储",
          perspective: "OA视角",
          primaryDocCount: 1,
          matchedDocCount: 1,
          unmatchedDocCount: 0,
          differentDocCount: 0,
          oaQuantity: 10,
          erpQuantity: 10,
          quantityDiff: 0,
          oaAmount: 100,
          erpCost: 100,
          amountDiff: 0,
          differenceSummary: "OA和ERP都有，数量一致"
        }
      ]);
    } finally {
      vi.doUnmock("../../src/core/doc-compare");
      vi.resetModules();
    }
  });

  it("builds OA perspective department summary rows with document counts and ordered difference summary", () => {
    const rows = buildDepartmentVarianceSummaryRows(
      [
        {
          表单编号: "OA-001",
          金蝶云单据编号: "ERP-001",
          申请日期: "2026/5/1",
          公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料代码: "MAT-A",
          物料名称: "物料A",
          数量: 10,
          实际预算金额mx: 100
        },
        {
          表单编号: "OA-002",
          金蝶云单据编号: "ERP-MISSING",
          申请日期: "2026/5/3",
          公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料代码: "MAT-B",
          物料名称: "物料B",
          数量: 2,
          实际预算金额mx: 20
        }
      ],
      [
        {
          单据编号: "ERP-001",
          日期: "2026/5/2",
          源单单号: "OA-001",
          区分公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料编码: "MAT-A",
          物料名称: "物料A",
          实发数量: 8,
          总成本: 80
        }
      ],
      {
        company: "数控",
        dept1: "生产",
        dept2: "仓储",
        startDate: "2026/5/1",
        endDate: "2026/5/31"
      },
      QUERY_DIRECTIONS.oaKingdeeToErp
    );

    expect(rows).toEqual([
      {
        company: "数控",
        dept1: "生产",
        dept2: "仓储",
        perspective: "OA视角",
        primaryDocCount: 2,
        matchedDocCount: 1,
        unmatchedDocCount: 1,
        differentDocCount: 1,
        oaQuantity: 12,
        erpQuantity: 8,
        quantityDiff: 4,
        oaAmount: 120,
        erpCost: 80,
        amountDiff: 40,
        differenceSummary: "OA有申请，ERP无出库、OA和ERP都有，但数量不同"
      }
    ]);
    expect(departmentVarianceSummaryRowsToValues(rows)).toEqual([
      [...DEPARTMENT_VARIANCE_SUMMARY_HEADERS],
      [
        "数控",
        "生产",
        "仓储",
        "OA视角",
        2,
        1,
        1,
        1,
        12,
        8,
        4,
        120,
        80,
        40,
        "OA有申请，ERP无出库、OA和ERP都有，但数量不同"
      ]
    ]);
  });

  it("builds ERP perspective department summary rows with ERP document counts and OA-minus-ERP deltas", () => {
    const rows = buildDepartmentVarianceSummaryRows(
      [
        {
          表单编号: "OA-001",
          金蝶云单据编号: "ERP-001",
          申请日期: "2026/4/1",
          公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料代码: "MAT-A",
          物料名称: "物料A",
          数量: 10,
          实际预算金额mx: 100
        }
      ],
      [
        {
          单据编号: "ERP-001",
          日期: "2026/5/2",
          源单单号: "OA-001",
          区分公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料编码: "MAT-A",
          物料名称: "物料A",
          实发数量: 8,
          总成本: 80
        },
        {
          单据编号: "ERP-999",
          日期: "2026/5/3",
          源单单号: "OA-MISSING",
          区分公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料编码: "MAT-B",
          物料名称: "物料B",
          实发数量: 3,
          总成本: 30
        }
      ],
      {
        company: "数控",
        dept1: "生产",
        dept2: "仓储",
        startDate: "2026/5/1",
        endDate: "2026/5/31"
      },
      QUERY_DIRECTIONS.erpSourceToOa
    );

    expect(rows).toEqual([
      {
        company: "数控",
        dept1: "生产",
        dept2: "仓储",
        perspective: "ERP视角",
        primaryDocCount: 2,
        matchedDocCount: 1,
        unmatchedDocCount: 1,
        differentDocCount: 1,
        oaQuantity: 10,
        erpQuantity: 11,
        quantityDiff: -1,
        oaAmount: 100,
        erpCost: 110,
        amountDiff: -10,
        differenceSummary: "ERP出库对应OA未在当前OA数据中找到、OA和ERP都有，但数量不同"
      }
    ]);
  });

  it("treats an existing zero-quantity zero-amount counterpart document as matched", () => {
    const rows = buildDepartmentVarianceSummaryRows(
      [
        {
          表单编号: "OA-ZERO",
          金蝶云单据编号: "ERP-ZERO",
          申请日期: "2026/5/5",
          公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料代码: "MAT-Z",
          物料名称: "物料Z",
          数量: 0,
          实际预算金额mx: 0
        }
      ],
      [
        {
          单据编号: "ERP-ZERO",
          日期: "2026/5/6",
          源单单号: "OA-ZERO",
          区分公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料编码: "MAT-Z",
          物料名称: "物料Z",
          实发数量: 0,
          总成本: 0
        }
      ],
      {
        company: "数控",
        dept1: "生产",
        dept2: "仓储",
        startDate: "2026/5/1",
        endDate: "2026/5/31"
      },
      QUERY_DIRECTIONS.oaKingdeeToErp
    );

    expect(rows).toEqual([
      {
        company: "数控",
        dept1: "生产",
        dept2: "仓储",
        perspective: "OA视角",
        primaryDocCount: 1,
        matchedDocCount: 1,
        unmatchedDocCount: 0,
        differentDocCount: 0,
        oaQuantity: 0,
        erpQuantity: 0,
        quantityDiff: 0,
        oaAmount: 0,
        erpCost: 0,
        amountDiff: 0,
        differenceSummary: "OA和ERP都有，数量一致"
      }
    ]);
  });

  it("classifies matched documents with material shape mismatch from compare metadata", () => {
    const rows = buildDepartmentVarianceSummaryRows(
      [
        {
          表单编号: "OA-MAT",
          金蝶云单据编号: "ERP-MAT",
          申请日期: "2026/5/3",
          公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料代码: "MAT-OA",
          物料名称: "OA物料",
          数量: 2,
          实际预算金额mx: 20
        }
      ],
      [
        {
          单据编号: "ERP-MAT",
          日期: "2026/5/4",
          源单单号: "OA-MAT",
          区分公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料编码: "MAT-ERP",
          物料名称: "ERP物料",
          实发数量: 2,
          总成本: 20
        }
      ],
      {
        company: "数控",
        dept1: "生产",
        dept2: "仓储",
        startDate: "2026/5/1",
        endDate: "2026/5/31"
      },
      QUERY_DIRECTIONS.oaKingdeeToErp
    );

    expect(rows).toEqual([
      {
        company: "数控",
        dept1: "生产",
        dept2: "仓储",
        perspective: "OA视角",
        primaryDocCount: 1,
        matchedDocCount: 1,
        unmatchedDocCount: 0,
        differentDocCount: 1,
        oaQuantity: 2,
        erpQuantity: 2,
        quantityDiff: 0,
        oaAmount: 20,
        erpCost: 20,
        amountDiff: 0,
        differenceSummary: "OA和ERP都有，但物料明细不一致"
      }
    ]);
  });

  it("keeps department totals aligned with rounded compare summary values", () => {
    const rows = buildDepartmentVarianceSummaryRows(
      [
        {
          表单编号: "OA-ROUND-1",
          金蝶云单据编号: "ERP-MISSING-1",
          申请日期: "2026/5/3",
          公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料代码: "MAT-A",
          物料名称: "物料A",
          数量: "1.005",
          实际预算金额mx: 0
        },
        {
          表单编号: "OA-ROUND-2",
          金蝶云单据编号: "ERP-MISSING-2",
          申请日期: "2026/5/4",
          公司简称: "数控",
          一级部门: "生产",
          二级部门: "仓储",
          物料代码: "MAT-B",
          物料名称: "物料B",
          数量: "1.005",
          实际预算金额mx: 0
        }
      ],
      [],
      {
        company: "数控",
        dept1: "生产",
        dept2: "仓储",
        startDate: "2026/5/1",
        endDate: "2026/5/31"
      },
      QUERY_DIRECTIONS.oaKingdeeToErp
    );

    expect(rows).toEqual([
      {
        company: "数控",
        dept1: "生产",
        dept2: "仓储",
        perspective: "OA视角",
        primaryDocCount: 2,
        matchedDocCount: 0,
        unmatchedDocCount: 2,
        differentDocCount: 0,
        oaQuantity: 2.02,
        erpQuantity: 0,
        quantityDiff: 2.02,
        oaAmount: 0,
        erpCost: 0,
        amountDiff: 0,
        differenceSummary: "OA有申请，ERP无出库"
      }
    ]);
  });

  it("returns only headers when converting empty rows to values", () => {
    expect(departmentVarianceSummaryRowsToValues([])).toEqual([[...DEPARTMENT_VARIANCE_SUMMARY_HEADERS]]);
  });
});
