import { buildErpOnlyRows, buildErpRowsForOa } from "./build-erp-rows";
import { buildOaRows, collectSelectedOaForms, parseFilters } from "./build-oa-rows";
import { buildSummaryRows, detailRowsToValues, summaryRowsToValues } from "./build-summary-rows";
import { compareRows } from "./compare-rows";
import { createMetricsRecorder, type MetricsRecorder } from "../perf/metrics";
import type {
  DetailRow,
  ErpAggRow,
  OaAggRow,
  OutputMatrix,
  QueryFilters,
  RawRow,
  SummaryRow
} from "../types/scrap";

export interface QueryCorePipelineResult {
  oaGroupedRows: Map<string, OaAggRow>;
  currentOaFormNumbers: Set<string>;
  erpRowsForOa: Map<string, ErpAggRow>;
  erpOnlyRows: Map<string, ErpAggRow>;
  detailRows: DetailRow[];
  summaryRows: SummaryRow[];
  summaryValues: OutputMatrix;
  detailValues: OutputMatrix;
}

export function runQueryCorePipeline(
  oaRows: RawRow[],
  erpRows: RawRow[],
  filters: Partial<QueryFilters> | Record<string, unknown> | null | undefined,
  metrics: MetricsRecorder = createMetricsRecorder()
): QueryCorePipelineResult {
  const activeFilters = parseFilters(filters);

  const oaGroupedRows = metrics.measure(
    "build_oa_rows",
    { inputRows: oaRows.length, outputRows: (rows: Map<string, OaAggRow>) => rows.size },
    () => buildOaRows(oaRows, activeFilters)
  );

  const currentOaFormNumbers = metrics.measure(
    "collect_oa_forms",
    { inputRows: oaGroupedRows.size, outputRows: (rows: Set<string>) => rows.size },
    () => collectSelectedOaForms(oaGroupedRows)
  );

  const erpRowsForOa = metrics.measure(
    "build_erp_rows_for_oa",
    { inputRows: erpRows.length, outputRows: (rows: Map<string, ErpAggRow>) => rows.size },
    () => buildErpRowsForOa(erpRows, oaGroupedRows)
  );

  const erpOnlyRows = metrics.measure(
    "build_erp_only_rows",
    { inputRows: erpRows.length, outputRows: (rows: Map<string, ErpAggRow>) => rows.size },
    () => buildErpOnlyRows(erpRows, currentOaFormNumbers, activeFilters)
  );

  const detailRows = metrics.measure(
    "compare_rows",
    {
      inputRows: oaGroupedRows.size + erpRowsForOa.size + erpOnlyRows.size,
      outputRows: (rows: DetailRow[]) => rows.length
    },
    () => compareRows(oaGroupedRows, erpRowsForOa, erpOnlyRows)
  );

  const summaryRows = metrics.measure(
    "build_summary_rows",
    { inputRows: detailRows.length, outputRows: (rows: SummaryRow[]) => rows.length },
    () => buildSummaryRows(detailRows)
  );

  const outputMatrices = metrics.measure(
    "build_output_matrix",
    {
      inputRows: detailRows.length + summaryRows.length,
      outputRows: detailRows.length + summaryRows.length
    },
    () => ({
      summaryValues: summaryRowsToValues(summaryRows),
      detailValues: detailRowsToValues(detailRows)
    })
  );

  return {
    oaGroupedRows,
    currentOaFormNumbers,
    erpRowsForOa,
    erpOnlyRows,
    detailRows,
    summaryRows,
    summaryValues: outputMatrices.summaryValues,
    detailValues: outputMatrices.detailValues
  };
}
