import {
  DIAGNOSTICS_HEADERS,
  ERP_REQUIRED_HEADERS,
  MAX_HEADER_SCAN_ROWS,
  MIN_ERP_HEADER_MATCH_COUNT,
  MIN_OA_HEADER_MATCH_COUNT,
  OA_REQUIRED_HEADERS,
  SHEET_NAMES,
  WRITE_CHUNK_ROWS
} from "../constants";
import { runQueryCorePipeline } from "../core/query-pipeline";
import { parseTableFromMatrix } from "../core/table-parser";
import { UNKNOWN_MEMORY } from "../perf/memory";
import { createMetricsRecorder, type StageMetric } from "../perf/metrics";
import { probeRuntimeCapabilities, type RuntimeCapability } from "../perf/runtime-probe";
import type { OutputMatrix } from "../types/scrap";
import type { ScrapVarianceGlobal, WpsSheet } from "../types/wps";
import { readUsedRangeMatrix } from "../wps-api/read-sheet-data";
import { ensureSheet, getSheetByName } from "../wps-api/workbook";
import { clearDiagnosticsOutput, writeMatrixBulkOrChunks } from "../wps-api/write-results";
import { readPanelFilters } from "./scrap-variance-query";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function capabilityRows(capabilities: RuntimeCapability[]): OutputMatrix {
  return capabilities.map((capability) => [
    "运行时能力",
    capability.name,
    "",
    "",
    "",
    UNKNOWN_MEMORY,
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

function writeDiagnosticsRows(sheet: WpsSheet, rows: OutputMatrix): void {
  clearDiagnosticsOutput(sheet);
  writeMatrixBulkOrChunks(sheet, 1, 1, rows, WRITE_CHUNK_ROWS);
}

function writeDiagnosticsError(root: ScrapVarianceGlobal | undefined, message: string): void {
  const sheet = ensureSheet(SHEET_NAMES.performanceDiagnostics, root);
  writeDiagnosticsRows(sheet, [[...DIAGNOSTICS_HEADERS], ["错误", "performance_diagnostics", "", "", "", UNKNOWN_MEMORY, message]]);
}

export function runPerformanceDiagnostics(root?: ScrapVarianceGlobal): void {
  try {
    const diagnosticsSheet = ensureSheet(SHEET_NAMES.performanceDiagnostics, root);
    const metrics = createMetricsRecorder(root ?? globalThis);
    const capabilities = probeRuntimeCapabilities(root ?? globalThis, globalThis);
    const panel = getSheetByName(SHEET_NAMES.panel, root);
    const oaSheet = getSheetByName(SHEET_NAMES.oa, root);
    const erpSheet = getSheetByName(SHEET_NAMES.erp, root);

    const filters = metrics.measure("read_filters", { inputRows: 5, outputRows: 5 }, () =>
      readPanelFilters(panel.Range("B2:B6"))
    );
    const oaUsedRange = metrics.measure("read_oa_used_range", { outputRows: (value) => value.matrix.length }, () =>
      readUsedRangeMatrix(oaSheet)
    );
    const oaTable = metrics.measure(
      "parse_oa_table",
      { inputRows: oaUsedRange.matrix.length, outputRows: (value) => value.rows.length },
      () =>
        parseTableFromMatrix(oaUsedRange.matrix, [...OA_REQUIRED_HEADERS], {
          minMatchCount: MIN_OA_HEADER_MATCH_COUNT,
          maxScanRows: MAX_HEADER_SCAN_ROWS,
          usedRangeStartRow: oaUsedRange.usedRangeStartRow
        })
    );
    const erpUsedRange = metrics.measure("read_erp_used_range", { outputRows: (value) => value.matrix.length }, () =>
      readUsedRangeMatrix(erpSheet)
    );
    const erpTable = metrics.measure(
      "parse_erp_table",
      { inputRows: erpUsedRange.matrix.length, outputRows: (value) => value.rows.length },
      () =>
        parseTableFromMatrix(erpUsedRange.matrix, [...ERP_REQUIRED_HEADERS], {
          minMatchCount: MIN_ERP_HEADER_MATCH_COUNT,
          maxScanRows: MAX_HEADER_SCAN_ROWS,
          usedRangeStartRow: erpUsedRange.usedRangeStartRow
        })
    );

    const result = runQueryCorePipeline(oaTable.rows, erpTable.rows, filters, metrics);
    const rows: OutputMatrix = [
      [...DIAGNOSTICS_HEADERS],
      ...capabilityRows(capabilities),
      ...metricRows(metrics.stages),
      [
        "结果规模",
        "result_rows",
        oaTable.rows.length + erpTable.rows.length,
        result.detailRows.length + result.summaryRows.length,
        "",
        UNKNOWN_MEMORY,
        `OA聚合=${result.oaGroupedRows.size}；ERP匹配聚合=${result.erpRowsForOa.size}；ERP-only聚合=${result.erpOnlyRows.size}`
      ]
    ];

    const writeStageRow = rows.length + 1;
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
