import { afterEach, describe, expect, it, vi } from "vitest";
import { UNKNOWN_MEMORY, getMemorySample, memoryDeltaMb } from "../../src/perf/memory";
import { createMetricsRecorder } from "../../src/perf/metrics";
import { nowMs } from "../../src/perf/timer";

describe("perf timer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses performance.now when available", () => {
    expect(nowMs({ performance: { now: () => 12.34 } })).toBe(12.34);
  });

  it("falls back to Date.now when performance.now is absent", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);

    expect(nowMs({})).toBe(1234);
  });
});

describe("perf memory", () => {
  it("samples Node process memory when available", () => {
    const sample = getMemorySample({
      process: {
        memoryUsage: () => ({
          heapUsed: 10 * 1024 * 1024,
          rss: 20 * 1024 * 1024
        })
      }
    });

    expect(sample).toEqual({
      available: true,
      heapUsedMb: 10,
      rssMb: 20
    });
  });

  it("returns explicit unknown memory when process memory is unavailable", () => {
    expect(getMemorySample({})).toEqual({
      available: false,
      heapUsedMb: UNKNOWN_MEMORY,
      rssMb: UNKNOWN_MEMORY
    });
  });

  it("returns explicit unknown memory when process memory sampling throws", () => {
    expect(
      getMemorySample({
        process: {
          memoryUsage: () => {
            throw new Error("memory unavailable");
          }
        }
      })
    ).toEqual({
      available: false,
      heapUsedMb: UNKNOWN_MEMORY,
      rssMb: UNKNOWN_MEMORY
    });
  });

  it("returns explicit unknown memory when process memory values are not finite", () => {
    expect(
      getMemorySample({
        process: {
          memoryUsage: () => ({
            heapUsed: Number.NaN,
            rss: 20 * 1024 * 1024
          })
        }
      })
    ).toEqual({
      available: false,
      heapUsedMb: UNKNOWN_MEMORY,
      rssMb: UNKNOWN_MEMORY
    });

    expect(
      getMemorySample({
        process: {
          memoryUsage: () => ({
            heapUsed: 10 * 1024 * 1024,
            rss: Number.POSITIVE_INFINITY
          })
        }
      })
    ).toEqual({
      available: false,
      heapUsedMb: UNKNOWN_MEMORY,
      rssMb: UNKNOWN_MEMORY
    });
  });

  it("calculates heap delta only when both samples are available", () => {
    expect(
      memoryDeltaMb(
        { available: true, heapUsedMb: 10, rssMb: 20 },
        { available: true, heapUsedMb: 13.456, rssMb: 22 }
      )
    ).toBe(3.46);
    expect(
      memoryDeltaMb(
        { available: false, heapUsedMb: UNKNOWN_MEMORY, rssMb: UNKNOWN_MEMORY },
        { available: true, heapUsedMb: 13, rssMb: 22 }
      )
    ).toBe(UNKNOWN_MEMORY);
  });
});

describe("metrics recorder", () => {
  it("records stage timing, memory, and row counts", () => {
    let currentTime = 100;
    let currentHeap = 5 * 1024 * 1024;
    const root = {
      performance: {
        now: () => {
          currentTime += 25;
          return currentTime;
        }
      },
      process: {
        memoryUsage: () => {
          currentHeap += 2 * 1024 * 1024;
          return {
            heapUsed: currentHeap,
            rss: currentHeap + 10 * 1024 * 1024
          };
        }
      }
    };
    const metrics = createMetricsRecorder(root);

    const value = metrics.measure("stage_a", { inputRows: 3, outputRows: (rows: string[]) => rows.length }, () => [
      "A",
      "B"
    ]);

    expect(value).toEqual(["A", "B"]);
    expect(metrics.stages).toHaveLength(1);
    expect(metrics.stages[0]).toEqual(
      expect.objectContaining({
        name: "stage_a",
        inputRows: 3,
        outputRows: 2,
        timeMs: 25,
        memoryBefore: {
          available: true,
          heapUsedMb: 7,
          rssMb: 17
        },
        memoryAfter: {
          available: true,
          heapUsedMb: 9,
          rssMb: 19
        },
        heapDeltaMb: 2,
        note: ""
      })
    );
  });

  it("records failed stage timing, memory, heap delta, and error note before rethrowing", () => {
    let currentTime = 100;
    let currentHeap = 5 * 1024 * 1024;
    const root = {
      performance: {
        now: () => {
          currentTime += 25;
          return currentTime;
        }
      },
      process: {
        memoryUsage: () => {
          currentHeap += 2 * 1024 * 1024;
          return {
            heapUsed: currentHeap,
            rss: currentHeap + 10 * 1024 * 1024
          };
        }
      }
    };
    const metrics = createMetricsRecorder(root);
    const originalError = new Error("stage failed");
    let thrownError: unknown;

    try {
      metrics.measure("stage_b", { inputRows: 5, outputRows: () => 99 }, () => {
        throw originalError;
      });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBe(originalError);
    expect(metrics.stages).toHaveLength(1);
    expect(metrics.stages[0]).toEqual({
      name: "stage_b",
      inputRows: 5,
      outputRows: 0,
      timeMs: 25,
      memoryBefore: {
        available: true,
        heapUsedMb: 7,
        rssMb: 17
      },
      memoryAfter: {
        available: true,
        heapUsedMb: 9,
        rssMb: 19
      },
      heapDeltaMb: 2,
      note: "stage failed"
    });
  });

  it("rethrows original action error when memory sampling is broken", () => {
    let currentTime = 100;
    const root = {
      performance: {
        now: () => {
          currentTime += 25;
          return currentTime;
        }
      },
      process: {
        memoryUsage: () => {
          throw new Error("memory unavailable");
        }
      }
    };
    const metrics = createMetricsRecorder(root);
    const originalError = new Error("action failed");
    let thrownError: unknown;

    try {
      metrics.measure("stage_c", { inputRows: 7, outputRows: () => 99 }, () => {
        throw originalError;
      });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBe(originalError);
    expect(metrics.stages).toHaveLength(1);
    expect(metrics.stages[0]).toEqual({
      name: "stage_c",
      inputRows: 7,
      outputRows: 0,
      timeMs: 25,
      memoryBefore: {
        available: false,
        heapUsedMb: UNKNOWN_MEMORY,
        rssMb: UNKNOWN_MEMORY
      },
      memoryAfter: {
        available: false,
        heapUsedMb: UNKNOWN_MEMORY,
        rssMb: UNKNOWN_MEMORY
      },
      heapDeltaMb: UNKNOWN_MEMORY,
      note: "action failed"
    });
  });

  it("returns action result and records note when outputRows callback throws", () => {
    let currentTime = 100;
    let currentHeap = 5 * 1024 * 1024;
    const root = {
      performance: {
        now: () => {
          currentTime += 25;
          return currentTime;
        }
      },
      process: {
        memoryUsage: () => {
          currentHeap += 2 * 1024 * 1024;
          return {
            heapUsed: currentHeap,
            rss: currentHeap + 10 * 1024 * 1024
          };
        }
      }
    };
    const metrics = createMetricsRecorder(root);

    const value = metrics.measure(
      "stage_d",
      {
        inputRows: 2,
        outputRows: () => {
          throw new Error("bad rows");
        }
      },
      () => ["A", "B"]
    );

    expect(value).toEqual(["A", "B"]);
    expect(metrics.stages).toHaveLength(1);
    expect(metrics.stages[0]).toEqual({
      name: "stage_d",
      inputRows: 2,
      outputRows: 0,
      timeMs: 25,
      memoryBefore: {
        available: true,
        heapUsedMb: 7,
        rssMb: 17
      },
      memoryAfter: {
        available: true,
        heapUsedMb: 9,
        rssMb: 19
      },
      heapDeltaMb: 2,
      note: "outputRows 统计失败：bad rows"
    });
  });
});
