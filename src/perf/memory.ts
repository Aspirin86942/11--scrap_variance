export const UNKNOWN_MEMORY = "无确切信息" as const;

export type MemoryValue = number | typeof UNKNOWN_MEMORY;
export type MemorySource = "process.memoryUsage" | "performance.memory";

export interface AvailableMemorySample {
  available: true;
  source: MemorySource;
  heapUsedMb: number;
  rssMb: number;
}

export interface UnknownMemorySample {
  available: false;
  heapUsedMb: typeof UNKNOWN_MEMORY;
  rssMb: typeof UNKNOWN_MEMORY;
}

export type MemorySample = AvailableMemorySample | UnknownMemorySample;

function unknownMemorySample(): UnknownMemorySample {
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
      totalJSHeapSize?: unknown;
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
    sample = usage();
  } catch {
    return unknownMemorySample();
  }

  if (!isFiniteNumber(sample.heapUsed) || !isFiniteNumber(sample.rss)) {
    return unknownMemorySample();
  }

  return {
    available: true,
    source: "process.memoryUsage",
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

  const totalJSHeapSize = memory?.totalJSHeapSize;
  const rssBytes = isFiniteNumber(totalJSHeapSize) ? totalJSHeapSize : usedJSHeapSize;

  return {
    available: true,
    source: "performance.memory",
    heapUsedMb: bytesToMb(usedJSHeapSize),
    rssMb: bytesToMb(rssBytes)
  };
}

export function getMemorySample(root: unknown = globalThis): MemorySample {
  const processSample = getProcessMemorySample(root);
  if (processSample.available) {
    return processSample;
  }

  return getPerformanceMemorySample(root);
}

export function memoryDeltaMb(before: MemorySample, after: MemorySample): MemoryValue {
  if (!before.available || !after.available) {
    return UNKNOWN_MEMORY;
  }
  return Number((after.heapUsedMb - before.heapUsedMb).toFixed(2));
}
