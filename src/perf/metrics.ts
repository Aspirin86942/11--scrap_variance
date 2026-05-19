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

interface OutputRowsResult {
  outputRows: number;
  note?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveOutputRows<T>(value: T, outputRows: number | ((value: T) => number) | undefined): OutputRowsResult {
  if (typeof outputRows === "function") {
    try {
      return { outputRows: outputRows(value) };
    } catch (error) {
      // 行数统计失败不能吞掉阶段本身的结果，但要在 note 里留下诊断信息。
      return {
        outputRows: 0,
        note: `outputRows 统计失败：${errorMessage(error)}`
      };
    }
  }
  if (typeof outputRows === "number" && Number.isFinite(outputRows)) {
    return { outputRows };
  }
  return { outputRows: 0 };
}

function roundMs(value: number): number {
  return Number(value.toFixed(2));
}

export function createMetricsRecorder(root: unknown = globalThis): MetricsRecorder {
  const stages: StageMetric[] = [];

  return {
    stages,
    measure<T>(name: string, options: MeasureOptions<T>, action: () => T): T {
      // 每个阶段都记录执行前后时间和内存采样；内存不可用时由 memory 模块返回“无确切信息”。
      const memoryBefore = getMemorySample(root);
      const startedAt = nowMs(root);
      try {
        const value = action();
        const endedAt = nowMs(root);
        const memoryAfter = getMemorySample(root);
        const outputRowsResult = resolveOutputRows(value, options.outputRows);
        stages.push({
          name,
          inputRows: options.inputRows ?? 0,
          outputRows: outputRowsResult.outputRows,
          timeMs: roundMs(endedAt - startedAt),
          memoryBefore,
          memoryAfter,
          heapDeltaMb: memoryDeltaMb(memoryBefore, memoryAfter),
          note: outputRowsResult.note ?? options.note ?? ""
        });
        return value;
      } catch (error) {
        // 阶段失败也记录耗时和错误说明，诊断表才能显示失败发生在哪一步。
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
          note: errorMessage(error)
        });
        throw error;
      }
    }
  };
}
