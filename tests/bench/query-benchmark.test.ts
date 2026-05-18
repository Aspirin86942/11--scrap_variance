import { describe, expect, it } from "vitest";
import { buildBenchReport, parseBenchArgs, renderBenchTable } from "../../src/bench/query-benchmark";

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
  });

  it("renders a readable benchmark table", () => {
    const report = buildBenchReport([20], { writeJson: false });
    const table = renderBenchTable(report);

    expect(table).toContain("dataset");
    expect(table).toContain("build_oa_rows");
    expect(table).toContain("total");
  });
});
