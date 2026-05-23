import { parseFilters } from "./build-oa-rows";
import {
  buildDepartmentVarianceSummaryRows,
  departmentVarianceSummaryRowsToValues
} from "./department-variance-summary";
import { buildErpDocCompare, buildOaDocCompare, docCompareRowsToValues } from "./doc-compare";
import { QUERY_DIRECTIONS, parseQueryDirection, type QueryDirection } from "./query-direction";
import type { MetricsRecorder } from "../perf/metrics";
import type { DocCompareResult, OutputMatrix, OutputSheetKind, RawRow, RibbonQueryState } from "../types/scrap";

export type RunnableOutputSheetKind = OutputSheetKind;

export interface OutputQueryRunnerInput {
  kind: RunnableOutputSheetKind;
  oaRows: RawRow[] | null | undefined;
  erpRows: RawRow[] | null | undefined;
  queryState: RibbonQueryState;
  metrics: MetricsRecorder;
}

export interface OutputQueryRowCounts {
  sourceRows: number;
  summaryRows: number;
  outputRows: number;
  materialRows: number;
}

export interface OutputQueryRunnerResult {
  kind: RunnableOutputSheetKind;
  values: OutputMatrix | null;
  noResultMessage: string | null;
  rowCounts: OutputQueryRowCounts;
}

function countSourceRows(oaRows: RawRow[] | null | undefined, erpRows: RawRow[] | null | undefined): number {
  return (oaRows?.length ?? 0) + (erpRows?.length ?? 0);
}

function countMaterialRows(result: DocCompareResult): number {
  let count = 0;
  for (const rows of result.materialRowsBySummaryKey.values()) {
    count += rows.length;
  }
  return count;
}

function noResultMessageForSummary(queryDirection: QueryDirection): string {
  return queryDirection === QUERY_DIRECTIONS.erpSourceToOa
    ? "查询条件没有匹配到 ERP 数据。"
    : "查询条件没有匹配到 OA 数据。";
}

function outputRowsFor(values: OutputMatrix | null): number {
  // 无结果时宏层会写一行提示文本，所以诊断行数也按 1 行输出计算。
  return values?.length ?? 1;
}

function unsupportedOutputKind(kind: never): never {
  throw new Error(`不支持的输出页类型：${String(kind)}`);
}

export function runOutputSheetQueryCore(input: OutputQueryRunnerInput): OutputQueryRunnerResult {
  const { kind, oaRows, erpRows, queryState, metrics } = input;
  const filters = parseFilters(queryState);
  const sourceRows = countSourceRows(oaRows, erpRows);
  const note = `output=${kind}`;

  if (kind === "variance_summary") {
    const queryDirection = parseQueryDirection(queryState.queryDirection);
    const summaryRows = buildDepartmentVarianceSummaryRows(oaRows, erpRows, filters, queryDirection, { metrics, note });
    const values = metrics.measure(
      "build_variance_summary_matrix",
      { inputRows: summaryRows.length, outputRows: outputRowsFor, note },
      () => summaryRows.length === 0 ? null : departmentVarianceSummaryRowsToValues(summaryRows)
    );

    return {
      kind,
      values,
      noResultMessage: values === null ? noResultMessageForSummary(queryDirection) : null,
      rowCounts: {
        sourceRows,
        summaryRows: summaryRows.length,
        outputRows: outputRowsFor(values),
        materialRows: 0
      }
    };
  }

  if (kind === "oa_doc_compare") {
    const compareResult = buildOaDocCompare(oaRows, erpRows, filters, { metrics, note });
    const materialRows = countMaterialRows(compareResult);
    const values = metrics.measure(
      "build_oa_doc_compare_matrix",
      { inputRows: compareResult.summaryRows.length, outputRows: outputRowsFor, note },
      () => compareResult.summaryRows.length === 0 ? null : docCompareRowsToValues("oa_doc_compare", compareResult.summaryRows)
    );

    return {
      kind,
      values,
      noResultMessage: values === null ? "查询条件没有匹配到 OA 数据。" : null,
      rowCounts: {
        sourceRows,
        summaryRows: compareResult.summaryRows.length,
        outputRows: outputRowsFor(values),
        materialRows
      }
    };
  }

  if (kind === "erp_doc_compare") {
    const compareResult = buildErpDocCompare(oaRows, erpRows, filters, { metrics, note });
    const materialRows = countMaterialRows(compareResult);
    const values = metrics.measure(
      "build_erp_doc_compare_matrix",
      { inputRows: compareResult.summaryRows.length, outputRows: outputRowsFor, note },
      () => compareResult.summaryRows.length === 0 ? null : docCompareRowsToValues("erp_doc_compare", compareResult.summaryRows)
    );

    return {
      kind,
      values,
      noResultMessage: values === null ? "查询条件没有匹配到 ERP 数据。" : null,
      rowCounts: {
        sourceRows,
        summaryRows: compareResult.summaryRows.length,
        outputRows: outputRowsFor(values),
        materialRows
      }
    };
  }

  return unsupportedOutputKind(kind);
}
