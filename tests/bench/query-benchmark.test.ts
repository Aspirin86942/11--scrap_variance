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

  it("builds a report for a small deterministic dataset", () => {
    const report = buildBenchReport([20], { writeJson: false });

    expect(report.datasets).toHaveLength(1);
    expect(report.datasets[0]?.name).toBe("20");
    expect(report.datasets[0]?.resultRows.detailRows).toBeGreaterThan(0);
    expect(report.datasets[0]?.stages.map((stage) => stage.name)).toContain("build_output_matrix");
    expect(report.datasets[0]?.total).toHaveProperty("maxStageHeapDeltaMb");
    expect(report.datasets[0]?.total).not.toHaveProperty("heapDeltaMb");
  });

  it("renders a readable benchmark table", () => {
    const report = buildBenchReport([20], { writeJson: false });
    const table = renderBenchTable(report);

    expect(table).toContain("dataset");
    expect(table).toContain("input_rows");
    expect(table).toContain("heap_delta_mb_or_max");
    expect(table).not.toContain("rows      time_ms");
    expect(table).toContain("build_oa_rows");
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
