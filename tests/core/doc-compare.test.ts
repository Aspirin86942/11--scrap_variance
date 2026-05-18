import { describe, expect, it } from "vitest";
import { ERP_DOC_COMPARE_HEADERS, OA_DOC_COMPARE_HEADERS } from "../../src/constants";
import { parseFilters } from "../../src/core/build-oa-rows";
import {
  buildErpDocCompare,
  buildMaterialRowsForDocSummary,
  buildOaDocCompare,
  docCompareRowsToValues
} from "../../src/core/doc-compare";
import type { RawRow } from "../../src/types/scrap";

function sampleOaRows(): RawRow[] {
  return [
    {
      表单编号: "OA-001",
      金蝶云单据编号: "ERP-778",
      申请日期: "2026/5/1",
      公司简称: "数控",
      一级部门: "生产",
      二级部门: "仓储",
      物料代码: "MAT-A",
      物料名称: "物料A",
      数量: 8,
      实际预算金额mx: 80
    },
    {
      表单编号: "OA-001",
      金蝶云单据编号: "ERP-778",
      申请日期: "2026/5/1",
      公司简称: "数控",
      一级部门: "生产",
      二级部门: "仓储",
      物料代码: "MAT-B",
      物料名称: "物料B",
      数量: 2,
      实际预算金额mx: 20
    }
  ];
}

function sampleErpRows(): RawRow[] {
  return [
    {
      单据编号: "ERP-778",
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
      单据编号: "ERP-778",
      日期: "2026/5/2",
      源单单号: "OA-001",
      区分公司简称: "数控",
      一级部门: "生产",
      二级部门: "仓储",
      物料编码: "MAT-B",
      物料名称: "物料B",
      实发数量: 1,
      总成本: 11
    }
  ];
}

describe("document compare core", () => {
  it("builds OA view summaries and material rows from OA documents", () => {
    const filters = parseFilters({
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026-05-01",
      endDate: "2026-05-31"
    });
    const oaRows = [
      ...sampleOaRows(),
      {
        表单编号: "OA-OUT",
        金蝶云单据编号: "ERP-OUT",
        申请日期: "2026/6/1",
        公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料代码: "MAT-Z",
        物料名称: "物料Z",
        数量: 5,
        实际预算金额mx: 50
      }
    ];
    const erpRows = [
      ...sampleErpRows(),
      {
        单据编号: "ERP-OUT",
        日期: "2026/6/2",
        源单单号: "OA-OUT",
        区分公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料编码: "MAT-Z",
        物料名称: "物料Z",
        实发数量: 5,
        总成本: 50
      }
    ];

    const result = buildOaDocCompare(oaRows, erpRows, filters);
    const values = docCompareRowsToValues("oa_doc_compare", result.summaryRows);

    expect(values).toEqual([
      [...OA_DOC_COMPARE_HEADERS],
      ["汇总", "数控", "生产", "仓储", "2026-05-01", "OA-001", 10, 100, "ERP-778", 9, 91, 1, 9, "", "", ""]
    ]);
    expect(result.summaryRows).toHaveLength(1);

    expect(
      buildMaterialRowsForDocSummary(result, result.summaryRows[0]).map((row) => [
        row.rowType,
        row.primaryQuantity,
        row.primaryAmount,
        row.counterpartQuantity,
        row.counterpartAmount,
        row.itemCode,
        row.itemName
      ])
    ).toEqual([
      ["物料", 8, 80, 8, 80, "MAT-A", "物料A"],
      ["物料", 2, 20, 1, 11, "MAT-B", "物料B"]
    ]);
  });

  it("builds ERP view summaries and material rows from ERP documents", () => {
    const filters = parseFilters({
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026-05-01",
      endDate: "2026-05-31"
    });
    const erpRows = [
      ...sampleErpRows(),
      {
        单据编号: "ERP-OUT",
        日期: "2026/6/2",
        源单单号: "OA-OUT",
        区分公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料编码: "MAT-Z",
        物料名称: "物料Z",
        实发数量: 5,
        总成本: 50
      }
    ];

    const result = buildErpDocCompare(sampleOaRows(), erpRows, filters);
    const values = docCompareRowsToValues("erp_doc_compare", result.summaryRows);

    expect(values).toEqual([
      [...ERP_DOC_COMPARE_HEADERS],
      ["汇总", "数控", "生产", "仓储", "2026-05-02", "ERP-778", 9, 91, "OA-001", 10, 100, -1, -9, "", "", ""]
    ]);
    expect(result.summaryRows).toHaveLength(1);

    expect(
      buildMaterialRowsForDocSummary(result, result.summaryRows[0]).map((row) => [
        row.rowType,
        row.primaryQuantity,
        row.primaryAmount,
        row.counterpartQuantity,
        row.counterpartAmount,
        row.itemCode,
        row.itemName
      ])
    ).toEqual([
      ["物料", 8, 80, 8, 80, "MAT-A", "物料A"],
      ["物料", 1, 11, 2, 20, "MAT-B", "物料B"]
    ]);
  });
});
