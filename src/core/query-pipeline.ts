import {
  buildErpOnlyRows,
  buildErpRowsByErpFilters,
  buildErpRowsForOa,
  buildErpRowsForOaKingdee,
  collectErpSourceForms,
  splitErpRowsByOaForms
} from "./build-erp-rows";
import { buildOaRows, buildOaRowsForFormNumbers, collectSelectedOaForms, parseFilters } from "./build-oa-rows";
import { buildSummaryRows, detailRowsToValues, summaryRowsToValues } from "./build-summary-rows";
import { compareRows } from "./compare-rows";
import { DEFAULT_QUERY_DIRECTION, QUERY_DIRECTIONS, parseQueryDirection, type QueryDirection } from "./query-direction";
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
  queryDirection: QueryDirection;
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
  metrics: MetricsRecorder = createMetricsRecorder(),
  queryDirectionInput: unknown = DEFAULT_QUERY_DIRECTION
): QueryCorePipelineResult {
  const activeFilters = parseFilters(filters);
  const queryDirection = parseQueryDirection(queryDirectionInput);

  if (queryDirection === QUERY_DIRECTIONS.erpSourceToOa) {
    const erpGroupedRows = metrics.measure(
      "build_erp_rows_by_erp_filters",
      { inputRows: erpRows.length, outputRows: (rows: Map<string, ErpAggRow>) => rows.size },
      () => buildErpRowsByErpFilters(erpRows, activeFilters)
    );

    const sourceFormNumbers = metrics.measure(
      "collect_erp_source_forms",
      { inputRows: erpGroupedRows.size, outputRows: (rows: Set<string>) => rows.size },
      () => collectErpSourceForms(erpGroupedRows)
    );

    const oaGroupedRows = metrics.measure(
      "build_oa_rows_for_erp_source_forms",
      { inputRows: oaRows.length, outputRows: (rows: Map<string, OaAggRow>) => rows.size },
      () => buildOaRowsForFormNumbers(oaRows, sourceFormNumbers)
    );

    const currentOaFormNumbers = metrics.measure(
      "collect_oa_forms",
      { inputRows: oaGroupedRows.size, outputRows: (rows: Set<string>) => rows.size },
      () => collectSelectedOaForms(oaGroupedRows)
    );

    const splitRows = metrics.measure(
      "split_erp_rows_by_oa_forms",
      {
        inputRows: erpGroupedRows.size,
        outputRows: (rows: { erpRowsForOa: Map<string, ErpAggRow>; erpOnlyRows: Map<string, ErpAggRow> }) =>
          rows.erpRowsForOa.size + rows.erpOnlyRows.size
      },
      () => splitErpRowsByOaForms(erpGroupedRows, currentOaFormNumbers)
    );

    return finishQueryPipeline(
      queryDirection,
      oaGroupedRows,
      currentOaFormNumbers,
      splitRows.erpRowsForOa,
      splitRows.erpOnlyRows,
      metrics
    );
  }

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
    () => buildErpRowsForOaKingdee(erpRows, oaGroupedRows)
  );

  const erpOnlyRows = metrics.measure(
    "build_erp_only_rows",
    { inputRows: erpRows.length, outputRows: (rows: Map<string, ErpAggRow>) => rows.size },
    () => new Map<string, ErpAggRow>()
  );

  return finishQueryPipeline(
    queryDirection,
    oaGroupedRows,
    currentOaFormNumbers,
    erpRowsForOa,
    erpOnlyRows,
    metrics
  );
}

function finishQueryPipeline(
  queryDirection: QueryDirection,
  oaGroupedRows: Map<string, OaAggRow>,
  currentOaFormNumbers: Set<string>,
  erpRowsForOa: Map<string, ErpAggRow>,
  erpOnlyRows: Map<string, ErpAggRow>,
  metrics: MetricsRecorder
): QueryCorePipelineResult {
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
    queryDirection,
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
