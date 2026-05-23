/// <reference types="node" />

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  runOutputSheetQueryCore,
  type OutputQueryRowCounts,
  type RunnableOutputSheetKind
} from "../core/output-query-runner";
import { generateBenchmarkData } from "../perf/benchmark-data";
import { UNKNOWN_MEMORY, type MemoryValue } from "../perf/memory";
import { createMetricsRecorder, type StageMetric } from "../perf/metrics";

export interface BenchCliOptions {
  scales: number[];
  writeJson: boolean;
}

const BENCH_OUTPUT_KINDS: RunnableOutputSheetKind[] = ["variance_summary", "oa_doc_compare", "erp_doc_compare"];

export interface OutputBenchResult {
  kind: RunnableOutputSheetKind;
  resultRows: OutputQueryRowCounts;
  stages: StageMetric[];
  total: {
    name: "total";
    timeMs: number;
    maxStageHeapDeltaMb: MemoryValue;
  };
}

export interface DatasetBenchResult {
  name: string;
  oaRows: number;
  erpRows: number;
  outputs: OutputBenchResult[];
}

export interface BenchReport {
  generatedAt: string;
  gitCommit: string;
  nodeVersion: string;
  datasets: DatasetBenchResult[];
}

function getGitCommit(): string {
  try {
    // benchmark 报告记录当前提交，方便之后对比不同优化版本的结果。
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

function parsePositiveScale(value: string): number {
  const scale = Number(value);
  if (!Number.isInteger(scale) || scale <= 0) {
    throw new Error("--scale 只能是 default、stress 或正整数");
  }
  return scale;
}

export function parseBenchArgs(args: string[]): BenchCliOptions {
  let scales = [10000, 50000];
  let writeJson = true;

  // CLI 只暴露固定规模和自定义正整数规模，避免 benchmark 参数影响业务逻辑。
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-json") {
      writeJson = false;
      continue;
    }
    if (arg === "--scale") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--scale 需要参数：default、stress 或正整数");
      }
      if (value === "default") {
        scales = [10000, 50000];
      } else if (value === "stress") {
        scales = [10000, 50000, 200000];
      } else {
        scales = [parsePositiveScale(value)];
      }
      index += 1;
      continue;
    }
    throw new Error(`未知 benchmark 参数：${arg}`);
  }

  return { scales, writeJson };
}

function metricSum(stages: StageMetric[]): number {
  return Number(stages.reduce((total, stage) => total + stage.timeMs, 0).toFixed(2));
}

export function maxStageHeapDelta(stages: StageMetric[]): MemoryValue {
  let maxValue: number | null = null;
  for (const stage of stages) {
    if (stage.heapDeltaMb === UNKNOWN_MEMORY) {
      continue;
    }
    maxValue = maxValue === null ? stage.heapDeltaMb : Math.max(maxValue, stage.heapDeltaMb);
  }
  return maxValue === null ? UNKNOWN_MEMORY : Number(maxValue.toFixed(2));
}

export function buildBenchReport(scales: number[], options: Pick<BenchCliOptions, "writeJson">): BenchReport {
  const datasets: DatasetBenchResult[] = [];

  // 每个 scale 只生成一次固定数据，再让三种输出页各自记录阶段，便于横向比较。
  for (const scale of scales) {
    const data = generateBenchmarkData(scale);
    const outputs: OutputBenchResult[] = [];

    for (const kind of BENCH_OUTPUT_KINDS) {
      const metrics = createMetricsRecorder();
      const result = runOutputSheetQueryCore({
        kind,
        oaRows: data.oaRows,
        erpRows: data.erpRows,
        queryState: { ...data.filters, queryDirection: "OA金蝶单号查ERP" },
        metrics
      });

      outputs.push({
        kind,
        resultRows: result.rowCounts,
        stages: metrics.stages,
        total: {
          name: "total",
          timeMs: metricSum(metrics.stages),
          maxStageHeapDeltaMb: maxStageHeapDelta(metrics.stages)
        }
      });
    }

    datasets.push({
      name: data.name,
      oaRows: data.oaRows.length,
      erpRows: data.erpRows.length,
      outputs
    });
  }

  const report: BenchReport = {
    generatedAt: new Date().toISOString(),
    gitCommit: getGitCommit(),
    nodeVersion: process.version,
    datasets
  };

  if (options.writeJson) {
    // JSON 报告给后续自动对比使用；控制台表格只用于人眼快速查看。
    writeBenchJson(report, "bench-results/latest.json");
  }

  return report;
}

export function renderBenchTable(report: BenchReport): string {
  const lines = ["dataset     output           stage                         input_rows time_ms   heap_delta_mb_or_max"];
  for (const dataset of report.datasets) {
    for (const output of dataset.outputs) {
      for (const stage of output.stages) {
        lines.push(
          `${dataset.name.padEnd(11)} ${output.kind.padEnd(16)} ${stage.name.padEnd(29)} ${String(stage.inputRows).padEnd(9)} ${String(stage.timeMs).padEnd(9)} ${String(stage.heapDeltaMb)}`
        );
      }
      // 汇总行使用该输出页看到的源数据总行数，便于和各阶段性能结果快速对齐。
      lines.push(
        `${dataset.name.padEnd(11)} ${output.kind.padEnd(16)} ${output.total.name.padEnd(29)} ${String(output.resultRows.sourceRows).padEnd(9)} ${String(output.total.timeMs).padEnd(9)} ${String(output.total.maxStageHeapDeltaMb)}`
      );
    }
  }
  return lines.join("\n");
}

export function writeBenchJson(report: BenchReport, outputPath: string): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf-8" });
}

export function runBenchCli(args: string[]): void {
  const options = parseBenchArgs(args);
  const report = buildBenchReport(options.scales, options);
  // benchmark 是 Node 脚本，允许使用 process/stdout；这段不会进入 WPS 运行时入口。
  process.stdout.write(`${renderBenchTable(report)}\n`);
}

if (typeof require !== "undefined" && require.main === module) {
  try {
    runBenchCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exitCode = 1;
  }
}
