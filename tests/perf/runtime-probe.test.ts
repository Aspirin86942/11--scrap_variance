import { describe, expect, it } from "vitest";
import { probeRuntimeCapabilities } from "../../src/perf/runtime-probe";

describe("runtime capability probe", () => {
  it("reports supported and unsupported capabilities without throwing", () => {
    const capabilities = probeRuntimeCapabilities({
      performance: { now: () => 1 },
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
  });
});
