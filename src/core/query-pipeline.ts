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
    // ERP 源单查 OA 时，先筛 ERP 并收集源单号，再回 OA 表取对应表单，方向不能和 OA 金蝶单号模式混用。
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

  // 默认方向是 OA 金蝶单号查 ERP：先筛 OA，再用 OA 聚合行上的金蝶云单据编号匹配 ERP 出库单。
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
    // OA 金蝶单号方向只关心当前 OA 集合对应的 ERP 出库，不额外输出 ERP-only 行。
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
  // 两个查询方向最终都收敛到同一个 finish 流程，确保差异比较、summary/detail 输出规则一致。
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
      // summary 和 detail 是两张不同输出矩阵；字段顺序由常量表头和转换函数共同锁定。
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
