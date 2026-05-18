import { type MemorySample, type MemoryValue, getMemorySample, memoryDeltaMb } from "./memory";
import { nowMs } from "./timer";

export interface StageMetric {
  name: string;
  inputRows: number;
  outputRows: number;
  timeMs: number;
  memoryBefore: MemorySample;
  memoryAfter: MemorySample;
  heapDeltaMb: MemoryValue;
  note: string;
}

export interface MeasureOptions<T> {
  inputRows?: number;
  outputRows?: number | ((value: T) => number);
  note?: string;
}

export interface MetricsRecorder {
  readonly stages: StageMetric[];
  measure<T>(name: string, options: MeasureOptions<T>, action: () => T): T;
}

function resolveOutputRows<T>(value: T, outputRows: number | ((value: T) => number) | undefined): number {
  if (typeof outputRows === "function") {
    return outputRows(value);
  }
  if (typeof outputRows === "number" && Number.isFinite(outputRows)) {
    return outputRows;
  }
  return 0;
}

function roundMs(value: number): number {
  return Number(value.toFixed(2));
}

export function createMetricsRecorder(root: unknown = globalThis): MetricsRecorder {
  const stages: StageMetric[] = [];

  return {
    stages,
    measure<T>(name: string, options: MeasureOptions<T>, action: () => T): T {
      const memoryBefore = getMemorySample(root);
      const startedAt = nowMs(root);
      try {
        const value = action();
        const endedAt = nowMs(root);
        const memoryAfter = getMemorySample(root);
        stages.push({
          name,
          inputRows: options.inputRows ?? 0,
          outputRows: resolveOutputRows(value, options.outputRows),
          timeMs: roundMs(endedAt - startedAt),
          memoryBefore,
          memoryAfter,
          heapDeltaMb: memoryDeltaMb(memoryBefore, memoryAfter),
          note: options.note ?? ""
        });
        return value;
      } catch (error) {
        const endedAt = nowMs(root);
        const memoryAfter = getMemorySample(root);
        stages.push({
          name,
          inputRows: options.inputRows ?? 0,
          outputRows: 0,
          timeMs: roundMs(endedAt - startedAt),
          memoryBefore,
          memoryAfter,
          heapDeltaMb: memoryDeltaMb(memoryBefore, memoryAfter),
          note: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }
  };
}
