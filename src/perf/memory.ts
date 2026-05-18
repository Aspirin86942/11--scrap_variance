export const UNKNOWN_MEMORY = "无确切信息" as const;

export type MemoryValue = number | typeof UNKNOWN_MEMORY;

export interface AvailableMemorySample {
  available: true;
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
      heapUsed?: number;
      rss?: number;
    };
  };
}

function bytesToMb(value: number): number {
  return Number((value / 1024 / 1024).toFixed(2));
}

export function getMemorySample(root: unknown = globalThis): MemorySample {
  const processRoot = root as ProcessRoot;
  const usage = processRoot.process?.memoryUsage;
  if (typeof usage !== "function") {
    return unknownMemorySample();
  }

  let sample: { heapUsed?: number; rss?: number };
  try {
    sample = usage();
  } catch {
    return unknownMemorySample();
  }

  if (
    typeof sample.heapUsed !== "number" ||
    typeof sample.rss !== "number" ||
    !Number.isFinite(sample.heapUsed) ||
    !Number.isFinite(sample.rss)
  ) {
    return unknownMemorySample();
  }

  return {
    available: true,
    heapUsedMb: bytesToMb(sample.heapUsed),
    rssMb: bytesToMb(sample.rss)
  };
}

export function memoryDeltaMb(before: MemorySample, after: MemorySample): MemoryValue {
  if (!before.available || !after.available) {
    return UNKNOWN_MEMORY;
  }
  return Number((after.heapUsedMb - before.heapUsedMb).toFixed(2));
}
