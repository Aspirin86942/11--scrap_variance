import { describe, expect, it } from "vitest";
import { DEPARTMENT_VARIANCE_SUMMARY_HEADERS } from "../../src/constants";
import { QUERY_DIRECTIONS } from "../../src/core/query-direction";
import {
  buildDepartmentVarianceSummaryRows,
  departmentVarianceSummaryRowsToValues
} from "../../src/core/department-variance-summary";

describe("department variance summary", () => {
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

  it("returns only headers when converting empty rows to values", () => {
    expect(departmentVarianceSummaryRowsToValues([])).toEqual([[...DEPARTMENT_VARIANCE_SUMMARY_HEADERS]]);
  });
});
