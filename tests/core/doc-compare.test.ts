import { describe, expect, it } from "vitest";
import { ERP_DOC_COMPARE_HEADERS, OA_DOC_COMPARE_HEADERS } from "../../src/constants";
import { parseFilters } from "../../src/core/build-oa-rows";
import {
  buildErpDocCompare,
  buildMaterialRowsForDocSummary,
  buildOaDocCompare,
  docCompareRowsToValues
} from "../../src/core/doc-compare";
import { UNKNOWN_MEMORY } from "../../src/perf/memory";
import { createMetricsRecorder, type MetricsRecorder, type StageMetric } from "../../src/perf/metrics";
import type { RawRow } from "../../src/types/scrap";
import { decimalToNumber2 } from "../../src/utils/decimal";

const UNKNOWN_MEMORY_SAMPLE = {
  available: false,
  heapUsedMb: UNKNOWN_MEMORY,
  rssMb: UNKNOWN_MEMORY
} as const;

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

  it("returns summary metadata without changing compare output rows", () => {
    const filters = parseFilters({
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026-05-01",
      endDate: "2026-05-31"
    });

    const result = buildOaDocCompare(sampleOaRows(), sampleErpRows(), filters);
    const item = result.summaryItems[0];
    if (!item) {
      throw new Error("missing summary item");
    }

    expect(result.summaryItems).toHaveLength(1);
    expect(item.summaryKey).toBeDefined();
    expect(item.row).toEqual(result.summaryRows[0]);
    expect(item.materialRows).toEqual(buildMaterialRowsForDocSummary(result, result.summaryRows[0]));
    expect(item.meta.counterpartDocNumbers).toEqual(["ERP-778"]);
    expect(item.meta.hasMaterialShapeMismatch).toBe(false);
    expect(decimalToNumber2(item.meta.primaryQuantity)).toBe(10);
    expect(decimalToNumber2(item.meta.primaryAmount)).toBe(100);
    expect(decimalToNumber2(item.meta.counterpartQuantity)).toBe(9);
    expect(decimalToNumber2(item.meta.counterpartAmount)).toBe(91);

    expect(docCompareRowsToValues("oa_doc_compare", result.summaryRows)).toEqual([
      [...OA_DOC_COMPARE_HEADERS],
      ["汇总", "数控", "生产", "仓储", "2026-05-01", "OA-001", 10, 100, "ERP-778", 9, 91, 1, 9, "", "", ""]
    ]);
  });

  it("keeps summary item row copies isolated from visible compare output rows", () => {
    const filters = parseFilters({
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026-05-01",
      endDate: "2026-05-31"
    });

    const result = buildOaDocCompare(sampleOaRows(), sampleErpRows(), filters);
    const summaryRow = result.summaryRows[0];
    const item = result.summaryItems[0];
    if (!summaryRow || !item) {
      throw new Error("missing summary item");
    }
    const summaryBefore = { ...summaryRow };
    const materialRowsBefore = buildMaterialRowsForDocSummary(result, summaryRow).map((row) => ({ ...row }));

    item.row.primaryQuantity = 999;
    item.row.remark = "mutated";
    item.materialRows[0].primaryQuantity = 888;
    item.materialRows.splice(0, 1);

    expect(result.summaryRows[0]).toEqual(summaryBefore);
    expect(buildMaterialRowsForDocSummary(result, result.summaryRows[0])).toEqual(materialRowsBefore);
  });

  it("rounds metadata diffs after subtracting raw totals to match displayed compare rows", () => {
    const oaRows: RawRow[] = [
      {
        表单编号: "OA-ROUND",
        金蝶云单据编号: "ERP-ROUND",
        申请日期: "2026/5/3",
        公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料代码: "MAT-ROUND",
        物料名称: "边界物料",
        数量: "1.005",
        实际预算金额mx: "1.005"
      }
    ];
    const erpRows: RawRow[] = [
      {
        单据编号: "ERP-ROUND",
        日期: "2026/5/4",
        源单单号: "OA-ROUND",
        区分公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料编码: "MAT-ROUND",
        物料名称: "边界物料",
        实发数量: "0.004",
        总成本: "0.004"
      }
    ];

    const result = buildOaDocCompare(oaRows, erpRows, parseFilters());
    const row = result.summaryRows[0];
    const item = result.summaryItems[0];
    if (!row || !item) {
      throw new Error("missing summary row");
    }

    expect(row.quantityDiff).toBe(1);
    expect(row.amountDiff).toBe(1);
    expect(decimalToNumber2(item.meta.quantityDiff)).toBe(row.quantityDiff);
    expect(decimalToNumber2(item.meta.amountDiff)).toBe(row.amountDiff);
  });

  it("uses stable summary keys when one OA document maps to multiple ERP documents", () => {
    const oaRows: RawRow[] = [
      {
        表单编号: "OA-002",
        金蝶云单据编号: "ERP-900",
        申请日期: "2026/5/3",
        公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料代码: "MAT-A",
        物料名称: "物料A",
        数量: 1,
        实际预算金额mx: 10
      },
      {
        表单编号: "OA-002",
        金蝶云单据编号: "ERP-900",
        申请日期: "2026/5/3",
        公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料代码: "MAT-B",
        物料名称: "物料B",
        数量: 2,
        实际预算金额mx: 20
      },
      {
        表单编号: "OA-002",
        金蝶云单据编号: "ERP-901",
        申请日期: "2026/5/3",
        公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料代码: "MAT-D",
        物料名称: "物料D",
        数量: 3,
        实际预算金额mx: 30
      }
    ];
    const erpRows: RawRow[] = [
      {
        单据编号: "ERP-900",
        日期: "2026/5/4",
        源单单号: "OA-002",
        区分公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料编码: "MAT-A",
        物料名称: "物料A",
        实发数量: 1,
        总成本: 10
      },
      {
        单据编号: "ERP-900",
        日期: "2026/5/4",
        源单单号: "OA-002",
        区分公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料编码: "MAT-B",
        物料名称: "物料B",
        实发数量: 2,
        总成本: 20
      },
      {
        单据编号: "ERP-901",
        日期: "2026/5/4",
        源单单号: "OA-002",
        区分公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料编码: "MAT-D",
        物料名称: "物料D",
        实发数量: 3,
        总成本: 30
      },
      {
        单据编号: "ERP-901",
        日期: "2026/5/4",
        源单单号: "OA-002",
        区分公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料编码: "MAT-X",
        物料名称: "物料X",
        实发数量: 4,
        总成本: 40
      }
    ];

    const result = buildOaDocCompare(oaRows, erpRows, parseFilters());
    const summary = result.summaryRows[0];
    expect(docCompareRowsToValues("oa_doc_compare", result.summaryRows)).toEqual([
      [...OA_DOC_COMPARE_HEADERS],
      ["汇总", "数控", "生产", "仓储", "2026-05-03", "OA-002", 6, 60, "ERP-900,ERP-901", 10, 100, -4, -40, "", "", ""]
    ]);

    const materialRows = buildMaterialRowsForDocSummary(result, {
      ...summary,
      counterpartDocNumber: "ERP-901,ERP-900"
    });
    expect(
      materialRows.map((row) => [
        row.rowType,
        row.primaryQuantity,
        row.primaryAmount,
        row.counterpartQuantity,
        row.counterpartAmount,
        row.itemCode,
        row.itemName
      ])
    ).toEqual([
      ["物料", 1, 10, 1, 10, "MAT-A", "物料A"],
      ["物料", 2, 20, 2, 20, "MAT-B", "物料B"],
      ["物料", 3, 30, 3, 30, "MAT-D", "物料D"],
      ["物料", 0, 0, 4, 40, "MAT-X", "物料X"]
    ]);
  });

  it("marks material shape mismatch in metadata when either side has a material-only row", () => {
    const oaRows: RawRow[] = [
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
    ];
    const erpRows: RawRow[] = [
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
    ];

    const result = buildOaDocCompare(oaRows, erpRows, parseFilters());

    expect(result.summaryItems[0]?.meta.hasMaterialShapeMismatch).toBe(true);
    expect(result.summaryItems[0]?.materialRows.map((row) => [
      row.itemCode,
      row.primaryQuantity,
      row.counterpartQuantity
    ])).toEqual([
      ["MAT-OA", 2, 0],
      ["MAT-ERP", 0, 2]
    ]);
  });

  it("can skip summary metadata for compare-only paths while keeping material rows", () => {
    const result = buildOaDocCompare(sampleOaRows(), sampleErpRows(), parseFilters(), {
      includeSummaryItems: false
    });
    const summary = result.summaryRows[0];
    if (!summary) {
      throw new Error("missing summary row");
    }

    expect(result.summaryItems).toEqual([]);
    expect(buildMaterialRowsForDocSummary(result, summary)).toHaveLength(2);
  });

  it("can skip material row arrays for summary-only paths while preserving material mismatch metadata", () => {
    const oaRows: RawRow[] = [
      {
        表单编号: "OA-META-MAT",
        金蝶云单据编号: "ERP-META-MAT",
        申请日期: "2026/5/3",
        公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料代码: "MAT-OA",
        物料名称: "OA物料",
        数量: 2,
        实际预算金额mx: 20
      }
    ];
    const erpRows: RawRow[] = [
      {
        单据编号: "ERP-META-MAT",
        日期: "2026/5/4",
        源单单号: "OA-META-MAT",
        区分公司简称: "数控",
        一级部门: "生产",
        二级部门: "仓储",
        物料编码: "MAT-ERP",
        物料名称: "ERP物料",
        实发数量: 2,
        总成本: 20
      }
    ];

    const result = buildOaDocCompare(oaRows, erpRows, parseFilters(), {
      includeMaterialRows: false
    });
    const summary = result.summaryRows[0];
    if (!summary) {
      throw new Error("missing summary row");
    }

    expect(buildMaterialRowsForDocSummary(result, summary)).toEqual([]);
    expect(result.summaryItems[0]?.materialRows).toEqual([]);
    expect(result.summaryItems[0]?.meta.hasMaterialShapeMismatch).toBe(true);
  });

  it("marks interleaved doc compare stage heap deltas as unknown", () => {
    let currentTime = 0;
    let currentHeap = 5 * 1024 * 1024;
    const metrics = createMetricsRecorder({
      performance: {
        now: () => {
          currentTime += 10;
          return currentTime;
        }
      },
      process: {
        memoryUsage: () => {
          currentHeap += 2 * 1024 * 1024;
          return {
            heapUsed: currentHeap,
            rss: currentHeap
          };
        }
      }
    });

    buildOaDocCompare(sampleOaRows(), sampleErpRows(), parseFilters(), { metrics });

    const summaryStage = metrics.stages.find((stage) => stage.name === "build_doc_compare_summary_rows");
    const materialStage = metrics.stages.find((stage) => stage.name === "build_doc_compare_material_rows");
    expect(summaryStage?.heapDeltaMb).toBe(UNKNOWN_MEMORY);
    expect(materialStage?.heapDeltaMb).toBe(UNKNOWN_MEMORY);
  });

  it("records the active doc compare stage before rethrowing hot-loop failures", () => {
    let nowCalls = 0;
    const stages: StageMetric[] = [];
    const metrics: MetricsRecorder = {
      stages,
      measure: (_name, _options, action) => action(),
      now: () => {
        nowCalls += 1;
        if (nowCalls === 2) {
          throw new Error("timer failed");
        }
        return nowCalls;
      },
      sampleMemory: () => UNKNOWN_MEMORY_SAMPLE,
      record: (name, options) => {
        stages.push({
          name,
          inputRows: options.inputRows ?? 0,
          outputRows: options.outputRows ?? 0,
          timeMs: options.timeMs,
          memoryBefore: options.memoryBefore,
          memoryAfter: options.memoryAfter,
          heapDeltaMb: UNKNOWN_MEMORY,
          note: options.note ?? ""
        });
      }
    };

    expect(() => {
      buildOaDocCompare(sampleOaRows(), sampleErpRows(), parseFilters(), { metrics });
    }).toThrow("timer failed");

    expect(stages).toEqual([
      expect.objectContaining({
        name: "build_doc_compare_summary_rows",
        inputRows: 1,
        outputRows: 0,
        note: "timer failed"
      })
    ]);
  });
});
