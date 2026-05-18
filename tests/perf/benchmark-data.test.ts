import { describe, expect, it } from "vitest";
import { formatDatasetName, generateBenchmarkData } from "../../src/perf/benchmark-data";

describe("benchmark data generator", () => {
  it("formats common dataset names", () => {
    expect(formatDatasetName(1000)).toBe("1k");
    expect(formatDatasetName(10000)).toBe("10k");
    expect(formatDatasetName(50000)).toBe("50k");
    expect(formatDatasetName(200000)).toBe("200k");
  });

  it("generates deterministic OA and ERP rows with required scenario coverage", () => {
    const first = generateBenchmarkData(20);
    const second = generateBenchmarkData(20);

    expect(first).toEqual(second);
    expect(first.name).toBe("20");
    expect(first.oaRows).toHaveLength(20);
    expect(first.oaRows[1]?.["金蝶云单据编号"]).toBe("QOUT000001");
    expect(first.erpRows.length).toBeGreaterThan(20);
    expect(first.erpRows.some((row) => String(row["源单单号"]).startsWith("ERPONLY"))).toBe(true);
    expect(
      first.erpRows.some((row) => row["源单单号"] === "F000001" && row["物料编码"] === "MAT-0001")
    ).toBe(true);
    expect(first.erpRows.some((row) => String(row["物料编码"]).endsWith("-ERP"))).toBe(true);
    expect(first.erpRows.some((row) => row["实发数量"] === 2)).toBe(true);
    expect(first.erpRows.some((row) => row["单据编号"] === "QOUT000004-B")).toBe(true);
    expect(first.filters).toEqual({
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026-05-01",
      endDate: "2026-05-31"
    });
  });
});
