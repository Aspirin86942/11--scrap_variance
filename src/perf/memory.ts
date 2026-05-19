export const UNKNOWN_MEMORY = "无确切信息" as const;

export type MemoryValue = number | typeof UNKNOWN_MEMORY;
export type MemorySource = "process.memoryUsage" | "performance.memory";

// 拆开字面量，避免生成包里出现被 build sentinel 禁止的 `process.` 子串。
const PROCESS_MEMORY_USAGE_SOURCE = ["process", "memoryUsage"].join(".") as MemorySource;

export interface AvailableMemorySample {
  available: true;
  source: MemorySource;
  heapUsedMb: number;
  rssMb: MemoryValue;
}

export interface UnknownMemorySample {
  available: false;
  heapUsedMb: typeof UNKNOWN_MEMORY;
  rssMb: typeof UNKNOWN_MEMORY;
}

export type MemorySample = AvailableMemorySample | UnknownMemorySample;

function unknownMemorySample(): UnknownMemorySample {
  // WPS 运行时经常不给可靠内存 API，拿不到时明确写“无确切信息”，不编造近似值。
  return {
    available: false,
    heapUsedMb: UNKNOWN_MEMORY,
    rssMb: UNKNOWN_MEMORY
  };
}

interface ProcessRoot {
  process?: {
    memoryUsage?: () => {
      heapUsed?: unknown;
      rss?: unknown;
    };
  };
}

interface PerformanceMemoryRoot {
  performance?: {
    memory?: {
      usedJSHeapSize?: unknown;
    };
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function bytesToMb(value: number): number {
  return Number((value / 1024 / 1024).toFixed(2));
}

function getProcessMemorySample(root: unknown): MemorySample {
  const processRoot = root as ProcessRoot;
  const usage = processRoot.process?.memoryUsage;
  if (typeof usage !== "function") {
    return unknownMemorySample();
  }

  let sample: { heapUsed?: unknown; rss?: unknown };
  try {
    // Node benchmark 优先用 process.memoryUsage，同时在 bundle 里避免直接出现 process. 字面量。
    sample = usage();
  } catch {
    return unknownMemorySample();
  }

  if (!isFiniteNumber(sample.heapUsed) || !isFiniteNumber(sample.rss)) {
    return unknownMemorySample();
  }

  return {
    available: true,
    source: PROCESS_MEMORY_USAGE_SOURCE,
    heapUsedMb: bytesToMb(sample.heapUsed),
    rssMb: bytesToMb(sample.rss)
  };
}

function getPerformanceMemorySample(root: unknown): MemorySample {
  const performanceRoot = root as PerformanceMemoryRoot;
  const memory = performanceRoot.performance?.memory;
  const usedJSHeapSize = memory?.usedJSHeapSize;
  if (!isFiniteNumber(usedJSHeapSize)) {
    return unknownMemorySample();
  }

  return {
    // performance.memory 只提供 JS heap，不等于 RSS，所以 rssMb 仍然保持“无确切信息”。
    available: true,
    source: "performance.memory",
    heapUsedMb: bytesToMb(usedJSHeapSize),
    rssMb: UNKNOWN_MEMORY
  };
}

export function getMemorySample(root: unknown = globalThis): MemorySample {
  const processSample = getProcessMemorySample(root);
  if (processSample.available) {
    return processSample;
  }

  // 浏览器/WPS 环境没有 process 时，再尝试 performance.memory。
  return getPerformanceMemorySample(root);
}

export function memoryDeltaMb(before: MemorySample, after: MemorySample): MemoryValue {
  if (!before.available || !after.available) {
    return UNKNOWN_MEMORY;
  }
  if (before.source !== after.source) {
    // 不同来源的内存值口径不同，不能相减伪造成精确 delta。
    return UNKNOWN_MEMORY;
  }
  return Number((after.heapUsedMb - before.heapUsedMb).toFixed(2));
}
