import { describe, expect, it } from "vitest";
import { probeRuntimeCapabilities } from "../../src/perf/runtime-probe";

describe("runtime capability probe", () => {
  it("reports supported and unsupported capabilities without throwing", () => {
    const capabilities = probeRuntimeCapabilities({
      performance: {
        now: () => 1,
        memory: {
          usedJSHeapSize: 1
        }
      },
      console: { log: () => undefined },
      setTimeout: () => 1,
      Promise,
      Worker: undefined
    });

    expect(capabilities).toContainEqual({ name: "performance.now", supported: true, note: "支持" });
    expect(capabilities).toContainEqual({ name: "console.log", supported: true, note: "支持" });
    expect(capabilities).toContainEqual({ name: "setTimeout", supported: true, note: "支持" });
    expect(capabilities).toContainEqual({ name: "Promise", supported: true, note: "支持" });
    expect(capabilities).toContainEqual({ name: "Worker", supported: false, note: "不支持" });
    expect(capabilities).toContainEqual({ name: "memory_api", supported: true, note: "支持" });
  });

  it("falls back to the global runtime when injected root does not expose capabilities", () => {
    const capabilities = probeRuntimeCapabilities(
      { Application: {} },
      {
        performance: { now: () => 1 },
        console: { log: () => undefined },
        setTimeout: () => 1,
        Promise,
        Worker: undefined,
        process: {
          memoryUsage: () => ({
            heapUsed: 1,
            rss: 2
          })
        }
      }
    );

    expect(capabilities).toContainEqual({ name: "performance.now", supported: true, note: "支持" });
    expect(capabilities).toContainEqual({ name: "console.log", supported: true, note: "支持" });
    expect(capabilities).toContainEqual({ name: "setTimeout", supported: true, note: "支持" });
    expect(capabilities).toContainEqual({ name: "Promise", supported: true, note: "支持" });
    expect(capabilities).toContainEqual({ name: "Worker", supported: false, note: "不支持" });
    expect(capabilities).toContainEqual({ name: "memory_api", supported: true, note: "支持" });
  });

  it("reports memory_api unsupported when no reliable memory source exists", () => {
    const capabilities = probeRuntimeCapabilities(
      {
        performance: {
          memory: {
            usedJSHeapSize: Number.NaN
          }
        },
        process: {
          memoryUsage: "not a function"
        }
      },
      {}
    );

    expect(capabilities).toContainEqual({ name: "memory_api", supported: false, note: "不支持" });
  });

  it("reports memory_api unsupported when process memory throws and no performance memory exists", () => {
    const capabilities = probeRuntimeCapabilities(
      {
        process: {
          memoryUsage: () => {
            throw new Error("memory unavailable");
          }
        }
      },
      {}
    );

    expect(capabilities).toContainEqual({ name: "memory_api", supported: false, note: "不支持" });
  });

  it.each([
    ["heapUsed", { heapUsed: Number.NaN, rss: 2 }],
    ["rss", { heapUsed: 1, rss: Number.POSITIVE_INFINITY }]
  ])("reports memory_api unsupported when process memory returns invalid %s", (_field, memoryUsage) => {
    const capabilities = probeRuntimeCapabilities(
      {
        process: {
          memoryUsage: () => memoryUsage
        }
      },
      {}
    );

    expect(capabilities).toContainEqual({ name: "memory_api", supported: false, note: "不支持" });
  });

  it("reports memory_api supported when process memory throws but performance memory is reliable", () => {
    const capabilities = probeRuntimeCapabilities(
      {
        performance: {
          memory: {
            usedJSHeapSize: 3
          }
        },
        process: {
          memoryUsage: () => {
            throw new Error("memory unavailable");
          }
        }
      },
      {}
    );

    expect(capabilities).toContainEqual({ name: "memory_api", supported: true, note: "支持" });
  });

  it("reports memory_api supported when process memory is invalid but performance memory is reliable", () => {
    const capabilities = probeRuntimeCapabilities(
      {
        performance: {
          memory: {
            usedJSHeapSize: 4
          }
        },
        process: {
          memoryUsage: () => ({
            heapUsed: "1",
            rss: 2
          })
        }
      },
      {}
    );

    expect(capabilities).toContainEqual({ name: "memory_api", supported: true, note: "支持" });
  });
});
