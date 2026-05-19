import {
  DIAGNOSTICS_HEADERS,
  ERP_REQUIRED_HEADERS,
  MAX_HEADER_SCAN_ROWS,
  MIN_ERP_HEADER_MATCH_COUNT,
  MIN_OA_HEADER_MATCH_COUNT,
  NOT_APPLICABLE,
  OA_REQUIRED_HEADERS,
  SHEET_NAMES,
  WRITE_CHUNK_ROWS
} from "../constants";
import { runQueryCorePipeline } from "../core/query-pipeline";
import { parseTableFromMatrix } from "../core/table-parser";
import { createMetricsRecorder, type StageMetric } from "../perf/metrics";
import { probeRuntimeCapabilities, type RuntimeCapability } from "../perf/runtime-probe";
import { getRibbonState, readRibbonFilters } from "../ribbon/state";
import type { OutputMatrix } from "../types/scrap";
import type { ScrapVarianceGlobal, WpsSheet } from "../types/wps";
import { readSheetMatrixOptimized, type SheetReadDiagnostics } from "../wps-api/read-sheet-data";
import { ensureSheet, getSheetByName } from "../wps-api/workbook";
import { clearDiagnosticsOutput, writeMatrixBulkOrChunks } from "../wps-api/write-results";

const MAX_DIAGNOSTICS_NOTE_LENGTH = 200;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cellSafeNote(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  // 诊断说明会写进单元格，前缀为公式字符时加引号，避免被表格当公式执行。
  const escaped = /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
  if (escaped.length <= MAX_DIAGNOSTICS_NOTE_LENGTH) {
    return escaped;
  }
  return `${escaped.slice(0, MAX_DIAGNOSTICS_NOTE_LENGTH - 3)}...`;
}

function capabilityRows(capabilities: RuntimeCapability[]): OutputMatrix {
  // 运行时能力不是阶段耗时，所以行数、耗时和内存列都明确标成“不适用”。
  return capabilities.map((capability) => [
    "运行时能力",
    capability.name,
    NOT_APPLICABLE,
    NOT_APPLICABLE,
    NOT_APPLICABLE,
    NOT_APPLICABLE,
    capability.note
  ]);
}

function metricRows(stages: StageMetric[]): OutputMatrix {
  return stages.map((stage) => [
    "阶段耗时",
    stage.name,
    stage.inputRows,
    stage.outputRows,
    stage.timeMs,
    stage.heapDeltaMb,
    stage.note
  ]);
}

function readStrategyNote(diagnostics: SheetReadDiagnostics): string {
  if (diagnostics.strategy === "used_range_fallback" && diagnostics.fallbackReason) {
    // fallback 原因要写入诊断表，方便判断是表头、列组还是 WPS Range 返回形状导致回退。
    return `${diagnostics.strategy}；原因：${cellSafeNote(diagnostics.fallbackReason)}`;
  }
  if (diagnostics.strategy === "grouped_ranges") {
    return `${diagnostics.strategy}；列组=${diagnostics.groupCount ?? 0}；读取列=${diagnostics.readCols}；总行=${diagnostics.readRows}`;
  }
  return diagnostics.strategy;
}

function readDiagnosticsRows(source: "oa" | "erp", diagnostics: SheetReadDiagnostics): OutputMatrix {
  const prefix = source === "oa" ? "oa" : "erp";
  const strategyNote = readStrategyNote(diagnostics);
  return [
    [
      "读表策略",
      `${prefix}_read_strategy`,
      NOT_APPLICABLE,
      NOT_APPLICABLE,
      NOT_APPLICABLE,
      NOT_APPLICABLE,
      strategyNote
    ],
    [
      "读表范围",
      `${prefix}_used_range`,
      diagnostics.usedRangeRows,
      diagnostics.usedRangeCols,
      NOT_APPLICABLE,
      NOT_APPLICABLE,
      diagnostics.usedRangeAddress
    ],
    [
      "读表范围",
      `${prefix}_read_range`,
      diagnostics.readRows,
      diagnostics.readCols,
      NOT_APPLICABLE,
      NOT_APPLICABLE,
      diagnostics.readRangeDescription
    ]
  ];
}

function writeDiagnosticsRows(sheet: WpsSheet, rows: OutputMatrix): void {
  clearDiagnosticsOutput(sheet);
  writeMatrixBulkOrChunks(sheet, 1, 1, rows, WRITE_CHUNK_ROWS);
}

function writeDiagnosticsError(root: ScrapVarianceGlobal | undefined, message: string): void {
  const sheet = ensureSheet(SHEET_NAMES.performanceDiagnostics, root);
  // 诊断自身失败时仍尽量写出错误行，避免用户面对空白诊断表。
  writeDiagnosticsRows(sheet, [
    [...DIAGNOSTICS_HEADERS],
    [
      "错误",
      "performance_diagnostics",
      NOT_APPLICABLE,
      NOT_APPLICABLE,
      NOT_APPLICABLE,
      NOT_APPLICABLE,
      cellSafeNote(message)
    ]
  ]);
}

export function runPerformanceDiagnostics(root?: ScrapVarianceGlobal): void {
  try {
    const diagnosticsSheet = ensureSheet(SHEET_NAMES.performanceDiagnostics, root);
    const metrics = createMetricsRecorder(root ?? globalThis);
    const capabilities = probeRuntimeCapabilities(root ?? globalThis, globalThis);
    const oaSheet = getSheetByName(SHEET_NAMES.oa, root);
    const erpSheet = getSheetByName(SHEET_NAMES.erp, root);

    // 诊断流程复用正式查询的读表和核心 pipeline，输出的耗时才和真实查询路径一致。
    const queryInput = metrics.measure("read_filters", { inputRows: 6, outputRows: 6 }, () => ({
      filters: readRibbonFilters(root),
      queryDirection: getRibbonState(root).queryDirection
    }));
    const oaSource = metrics.measure("read_oa_source_table", { outputRows: (value) => value.matrix.length }, () =>
      readSheetMatrixOptimized(oaSheet, [...OA_REQUIRED_HEADERS], MIN_OA_HEADER_MATCH_COUNT, MAX_HEADER_SCAN_ROWS)
    );
    const oaTable = metrics.measure(
      "parse_oa_table",
      { inputRows: oaSource.matrix.length, outputRows: (value) => value.rows.length },
      () =>
        parseTableFromMatrix(oaSource.matrix, [...OA_REQUIRED_HEADERS], {
          minMatchCount: MIN_OA_HEADER_MATCH_COUNT,
          maxScanRows: MAX_HEADER_SCAN_ROWS,
          usedRangeStartRow: oaSource.usedRangeStartRow
        })
    );
    const erpSource = metrics.measure("read_erp_source_table", { outputRows: (value) => value.matrix.length }, () =>
      readSheetMatrixOptimized(erpSheet, [...ERP_REQUIRED_HEADERS], MIN_ERP_HEADER_MATCH_COUNT, MAX_HEADER_SCAN_ROWS)
    );
    const erpTable = metrics.measure(
      "parse_erp_table",
      { inputRows: erpSource.matrix.length, outputRows: (value) => value.rows.length },
      () =>
        parseTableFromMatrix(erpSource.matrix, [...ERP_REQUIRED_HEADERS], {
          minMatchCount: MIN_ERP_HEADER_MATCH_COUNT,
          maxScanRows: MAX_HEADER_SCAN_ROWS,
          usedRangeStartRow: erpSource.usedRangeStartRow
        })
    );

    const result = runQueryCorePipeline(
      oaTable.rows,
      erpTable.rows,
      queryInput.filters,
      metrics,
      queryInput.queryDirection
    );
    const rows: OutputMatrix = [
      [...DIAGNOSTICS_HEADERS],
      ...capabilityRows(capabilities),
      ...readDiagnosticsRows("oa", oaSource.diagnostics),
      ...readDiagnosticsRows("erp", erpSource.diagnostics),
      ...metricRows(metrics.stages),
      [
        "结果规模",
        "result_rows",
        oaTable.rows.length + erpTable.rows.length,
        result.detailRows.length + result.summaryRows.length,
        NOT_APPLICABLE,
        NOT_APPLICABLE,
        `OA聚合=${result.oaGroupedRows.size}；ERP匹配聚合=${result.erpRowsForOa.size}；ERP-only聚合=${result.erpOnlyRows.size}`
      ]
    ];

    const writeStageRow = rows.length + 1;
    // 写诊断表本身也是一个阶段，先写已有行，再把写表阶段追加到末尾。
    metrics.measure("write_diagnostics_sheet", { inputRows: rows.length, outputRows: rows.length }, () => {
      writeDiagnosticsRows(diagnosticsSheet, rows);
      return rows.length;
    });
    const writeStage = metrics.stages[metrics.stages.length - 1];
    if (writeStage) {
      writeMatrixBulkOrChunks(diagnosticsSheet, writeStageRow, 1, metricRows([writeStage]), WRITE_CHUNK_ROWS);
    }
  } catch (error) {
    const originalMessage = errorMessage(error);
    try {
      writeDiagnosticsError(root, originalMessage);
    } catch (writeError) {
      throw new Error(`性能诊断失败：${originalMessage}; 错误信息写入也失败：${errorMessage(writeError)}`);
    }
  }
}
