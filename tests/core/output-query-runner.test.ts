import { describe, expect, it } from "vitest";
import { QUERY_DIRECTIONS } from "../../src/core/query-direction";
import { runOutputSheetQueryCore } from "../../src/core/output-query-runner";
import { generateBenchmarkData } from "../../src/perf/benchmark-data";
import { createMetricsRecorder } from "../../src/perf/metrics";
import type { RibbonQueryState } from "../../src/types/scrap";

function makeQueryState(overrides: Partial<RibbonQueryState> = {}): RibbonQueryState {
  return {
    company: "数控",
    dept1: "生产",
    dept2: "仓储",
    startDate: "2026-05-01",
    endDate: "2026-05-31",
    queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp,
    ...overrides
  };
}

function makeMetrics() {
  return createMetricsRecorder({
    performance: { now: () => 1 },
    process: {
      memoryUsage: () => ({
        heapUsed: 10 * 1024 * 1024,
        rss: 20 * 1024 * 1024
      })
    }
  });
}

describe("output query runner", () => {
  it("builds variance summary output and records output-scoped metric stages", () => {
    const data = generateBenchmarkData(30);
    const metrics = makeMetrics();

    const result = runOutputSheetQueryCore({
      kind: "variance_summary",
      oaRows: data.oaRows,
      erpRows: data.erpRows,
      queryState: makeQueryState(),
      metrics
    });

    expect(result.kind).toBe("variance_summary");
    expect(result.noResultMessage).toBeNull();
    expect(result.values?.[0]).toContain("查询视角");
    expect(result.values?.[0]).toContain("主视角单据数");
    expect(result.rowCounts.sourceRows).toBe(data.oaRows.length + data.erpRows.length);
    expect(result.rowCounts.summaryRows).toBeGreaterThan(0);
    expect(result.rowCounts.outputRows).toBe(result.values?.length);
    expect(metrics.stages.map((stage) => stage.name)).toEqual([
      "build_variance_summary_rows",
      "build_variance_summary_matrix"
    ]);
    expect(metrics.stages.map((stage) => stage.note)).toEqual([
      "output=variance_summary",
      "output=variance_summary"
    ]);
  });

  it("builds OA document compare output and counts material rows for diagnostics", () => {
    const data = generateBenchmarkData(30);
    const metrics = makeMetrics();

    const result = runOutputSheetQueryCore({
      kind: "oa_doc_compare",
      oaRows: data.oaRows,
      erpRows: data.erpRows,
      queryState: makeQueryState(),
      metrics
    });

    expect(result.kind).toBe("oa_doc_compare");
    expect(result.noResultMessage).toBeNull();
    expect(result.values?.[0]).toContain("OA单据号");
    expect(result.values?.[0]).toContain("ERP单据号");
    expect(result.rowCounts.summaryRows).toBeGreaterThan(0);
    expect(result.rowCounts.materialRows).toBeGreaterThan(0);
    expect(metrics.stages.map((stage) => stage.name)).toEqual([
      "build_oa_doc_compare_rows",
      "build_oa_doc_compare_matrix"
    ]);
    expect(metrics.stages.every((stage) => stage.note === "output=oa_doc_compare")).toBe(true);
  });

  it("builds ERP document compare output with ERP output labels", () => {
    const data = generateBenchmarkData(30);
    const metrics = makeMetrics();

    const result = runOutputSheetQueryCore({
      kind: "erp_doc_compare",
      oaRows: data.oaRows,
      erpRows: data.erpRows,
      queryState: makeQueryState(),
      metrics
    });

    expect(result.kind).toBe("erp_doc_compare");
    expect(result.noResultMessage).toBeNull();
    expect(result.values?.[0]).toContain("ERP单据号");
    expect(result.values?.[0]).toContain("OA单据号");
    expect(result.rowCounts.summaryRows).toBeGreaterThan(0);
    expect(result.rowCounts.materialRows).toBeGreaterThan(0);
    expect(metrics.stages.map((stage) => stage.name)).toEqual([
      "build_erp_doc_compare_rows",
      "build_erp_doc_compare_matrix"
    ]);
    expect(metrics.stages.every((stage) => stage.note === "output=erp_doc_compare")).toBe(true);
  });

  it("returns output-specific no-result messages without treating them as errors", () => {
    const data = generateBenchmarkData(30);

    const oaCompareResult = runOutputSheetQueryCore({
      kind: "oa_doc_compare",
      oaRows: data.oaRows,
      erpRows: data.erpRows,
      queryState: makeQueryState({ company: "不存在公司" }),
      metrics: makeMetrics()
    });
    const erpCompareResult = runOutputSheetQueryCore({
      kind: "erp_doc_compare",
      oaRows: data.oaRows,
      erpRows: data.erpRows,
      queryState: makeQueryState({ company: "不存在公司" }),
      metrics: makeMetrics()
    });
    const erpSummaryResult = runOutputSheetQueryCore({
      kind: "variance_summary",
      oaRows: data.oaRows,
      erpRows: data.erpRows,
      queryState: makeQueryState({
        company: "不存在公司",
        queryDirection: QUERY_DIRECTIONS.erpSourceToOa
      }),
      metrics: makeMetrics()
    });

    expect(oaCompareResult.values).toBeNull();
    expect(oaCompareResult.noResultMessage).toBe("查询条件没有匹配到 OA 数据。");
    expect(oaCompareResult.rowCounts.outputRows).toBe(1);
    expect(erpCompareResult.values).toBeNull();
    expect(erpCompareResult.noResultMessage).toBe("查询条件没有匹配到 ERP 数据。");
    expect(erpCompareResult.rowCounts.outputRows).toBe(1);
    expect(erpSummaryResult.values).toBeNull();
    expect(erpSummaryResult.noResultMessage).toBe("查询条件没有匹配到 ERP 数据。");
    expect(erpSummaryResult.rowCounts.summaryRows).toBe(0);
  });

  it("returns OA no-result message for variance summary in OA direction", () => {
    const data = generateBenchmarkData(30);

    const oaSummaryResult = runOutputSheetQueryCore({
      kind: "variance_summary",
      oaRows: data.oaRows,
      erpRows: data.erpRows,
      queryState: makeQueryState({
        company: "不存在公司",
        queryDirection: QUERY_DIRECTIONS.oaKingdeeToErp
      }),
      metrics: makeMetrics()
    });

    expect(oaSummaryResult.values).toBeNull();
    expect(oaSummaryResult.noResultMessage).toBe("查询条件没有匹配到 OA 数据。");
    expect(oaSummaryResult.rowCounts.summaryRows).toBe(0);
    expect(oaSummaryResult.rowCounts.outputRows).toBe(1);
  });

  it("rejects invalid query direction instead of silently selecting an output path", () => {
    const data = generateBenchmarkData(30);

    expect(() =>
      runOutputSheetQueryCore({
        kind: "variance_summary",
        oaRows: data.oaRows,
        erpRows: data.erpRows,
        queryState: makeQueryState({ queryDirection: "坏方向" as RibbonQueryState["queryDirection"] }),
        metrics: makeMetrics()
      })
    ).toThrow("查询方向不正确：请填写 OA金蝶单号查ERP 或 ERP源单查OA");
  });
});
