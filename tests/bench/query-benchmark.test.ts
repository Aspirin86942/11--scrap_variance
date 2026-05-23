import { describe, expect, it } from "vitest";
import {
  buildBenchReport,
  maxStageHeapDelta,
  parseBenchArgs,
  renderBenchTable
} from "../../src/bench/query-benchmark";
import { UNKNOWN_MEMORY } from "../../src/perf/memory";
import type { StageMetric } from "../../src/perf/metrics";

function makeStage(name: string, heapDeltaMb: StageMetric["heapDeltaMb"]): StageMetric {
  return {
    name,
    inputRows: 1,
    outputRows: 1,
    timeMs: 1,
    memoryBefore: UNKNOWN_MEMORY_SAMPLE,
    memoryAfter: UNKNOWN_MEMORY_SAMPLE,
    heapDeltaMb,
    note: ""
  };
}

const UNKNOWN_MEMORY_SAMPLE = {
  available: false,
  heapUsedMb: UNKNOWN_MEMORY,
  rssMb: UNKNOWN_MEMORY
} as const;

describe("query benchmark CLI helpers", () => {
  it("parses default, stress, and explicit scale arguments", () => {
    expect(parseBenchArgs([])).toEqual({ scales: [10000, 50000], writeJson: true });
    expect(parseBenchArgs(["--scale", "default"])).toEqual({ scales: [10000, 50000], writeJson: true });
    expect(parseBenchArgs(["--scale", "stress"])).toEqual({ scales: [10000, 50000, 200000], writeJson: true });
    expect(parseBenchArgs(["--scale", "1000", "--no-json"])).toEqual({ scales: [1000], writeJson: false });
  });

  it("rejects invalid scale arguments", () => {
    expect(() => parseBenchArgs(["--scale", "abc"])).toThrow("--scale 只能是 default、stress 或正整数");
    expect(() => parseBenchArgs(["--scale", "0"])).toThrow("--scale 只能是 default、stress 或正整数");
  });

  it("builds output-scoped reports for a small deterministic dataset", () => {
    const report = buildBenchReport([20], { writeJson: false });
    const dataset = report.datasets[0];

    expect(report.datasets).toHaveLength(1);
    expect(dataset?.name).toBe("20");
    expect(dataset?.outputs.map((output) => output.kind)).toEqual([
      "variance_summary",
      "oa_doc_compare",
      "erp_doc_compare"
    ]);

    const stageNamesByOutput = new Map(
      dataset?.outputs.map((output) => [output.kind, output.stages.map((stage) => stage.name)])
    );
    expect(stageNamesByOutput.get("variance_summary")).toEqual([
      "build_variance_summary_rows",
      "build_variance_summary_matrix"
    ]);
    expect(stageNamesByOutput.get("oa_doc_compare")).toEqual([
      "build_oa_doc_compare_rows",
      "build_oa_doc_compare_matrix"
    ]);
    expect(stageNamesByOutput.get("erp_doc_compare")).toEqual([
      "build_erp_doc_compare_rows",
      "build_erp_doc_compare_matrix"
    ]);

    for (const output of dataset?.outputs ?? []) {
      expect(output.resultRows.sourceRows).toBe((dataset?.oaRows ?? 0) + (dataset?.erpRows ?? 0));
      expect(output.resultRows.outputRows).toBeGreaterThan(0);
      expect(output.total).toHaveProperty("maxStageHeapDeltaMb");
      expect(output.total).not.toHaveProperty("heapDeltaMb");
    }
  });

  it("renders a readable output-scoped benchmark table", () => {
    const report = buildBenchReport([20], { writeJson: false });
    const table = renderBenchTable(report);

    expect(table).toContain("dataset");
    expect(table).toContain("output");
    expect(table).toContain("input_rows");
    expect(table).toContain("heap_delta_mb_or_max");
    expect(table).not.toContain("rows      time_ms");
    expect(table).toContain("variance_summary");
    expect(table).toContain("oa_doc_compare");
    expect(table).toContain("erp_doc_compare");
    expect(table).toContain("build_variance_summary_rows");
    expect(table).toContain("build_oa_doc_compare_rows");
    expect(table).toContain("build_erp_doc_compare_rows");
    expect(table).not.toContain("generate_data");
    expect(table).toContain("total");
  });

  it("uses the max stage heap delta for total memory instead of summing stage deltas", () => {
    const stages = [makeStage("first", 2), makeStage("second", 7), makeStage("third", -3)];

    expect(maxStageHeapDelta(stages)).toBe(7);
  });

  it("ignores unknown memory values when a numeric stage heap delta exists", () => {
    const stages = [makeStage("unknown", UNKNOWN_MEMORY), makeStage("known", 3)];

    expect(maxStageHeapDelta(stages)).toBe(3);
    expect(maxStageHeapDelta([makeStage("unknown", UNKNOWN_MEMORY)])).toBe(UNKNOWN_MEMORY);
  });
});
