import { describe, expect, it } from "vitest";
import { runQueryCorePipeline } from "../../src/core/query-pipeline";
import { generateBenchmarkData } from "../../src/perf/benchmark-data";
import { createMetricsRecorder } from "../../src/perf/metrics";

describe("query core pipeline", () => {
  it("runs the existing core stages and returns output matrices", () => {
    const data = generateBenchmarkData(30);
    const metrics = createMetricsRecorder({
      performance: { now: () => 1 },
      process: {
        memoryUsage: () => ({
          heapUsed: 10 * 1024 * 1024,
          rss: 20 * 1024 * 1024
        })
      }
    });

    const result = runQueryCorePipeline(data.oaRows, data.erpRows, data.filters, metrics);

    expect(result.oaGroupedRows.size).toBeGreaterThan(0);
    expect(result.queryDirection).toBe("OA金蝶单号查ERP");
    expect(result.erpRowsForOa.size).toBeGreaterThan(0);
    expect(result.erpOnlyRows.size).toBe(0);
    expect(result.detailRows.length).toBeGreaterThan(0);
    expect(result.summaryRows.length).toBeGreaterThan(0);
    expect(result.summaryValues[0]).toContain("差异类型摘要");
    expect(result.detailValues[0]).toContain("ERP日期");
    expect(
      result.detailRows.find((row) => row.formNumber === "F000001" && row.itemCode === "MAT-0001")?.differenceType
    ).not.toBe("OA有申请，ERP无出库");
    expect(metrics.stages.map((stage) => stage.name)).toEqual([
      "build_oa_rows",
      "collect_oa_forms",
      "build_erp_rows_for_oa",
      "build_erp_only_rows",
      "compare_rows",
      "build_summary_rows",
      "build_output_matrix"
    ]);
    expect(metrics.stages.find((stage) => stage.name === "build_output_matrix")?.outputRows).toBe(
      result.summaryRows.length + result.detailRows.length
    );
  });

  it("normalizes filter input before running core stages", () => {
    const data = generateBenchmarkData(30);
    const metrics = createMetricsRecorder({
      performance: { now: () => 1 },
      process: {
        memoryUsage: () => ({
          heapUsed: 10 * 1024 * 1024,
          rss: 20 * 1024 * 1024
        })
      }
    });

    const result = runQueryCorePipeline(
      data.oaRows,
      data.erpRows,
      { ...data.filters, startDate: "2026/5/1" },
      metrics
    );

    expect(result.oaGroupedRows.size).toBeGreaterThan(0);
    expect(result.detailRows.length).toBeGreaterThan(0);
    expect(metrics.stages.map((stage) => stage.name)).toEqual([
      "build_oa_rows",
      "collect_oa_forms",
      "build_erp_rows_for_oa",
      "build_erp_only_rows",
      "compare_rows",
      "build_summary_rows",
      "build_output_matrix"
    ]);
  });

  it("keeps the source-form ERP direction selectable", () => {
    const data = generateBenchmarkData(30);
    const metrics = createMetricsRecorder({
      performance: { now: () => 1 },
      process: {
        memoryUsage: () => ({
          heapUsed: 10 * 1024 * 1024,
          rss: 20 * 1024 * 1024
        })
      }
    });

    const result = runQueryCorePipeline(data.oaRows, data.erpRows, data.filters, metrics, "ERP源单查OA");

    expect(result.queryDirection).toBe("ERP源单查OA");
    expect(result.erpRowsForOa.size).toBeGreaterThan(0);
    expect(result.erpOnlyRows.size).toBeGreaterThan(0);
    expect([...result.erpOnlyRows.keys()].every((key) => key.startsWith("ERPONLY"))).toBe(true);
  });
});
