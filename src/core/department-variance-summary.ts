import { DEPARTMENT_VARIANCE_SUMMARY_HEADERS, DIFFERENCE_TYPE_PRIORITY } from "../constants";
import type { MetricsRecorder } from "../perf/metrics";
import type { DocCompareResult, DocCompareRow, DocCompareSummaryItem, OutputMatrix, QueryFilters, RawRow } from "../types/scrap";
import { addDecimal, decimalToNumber2, subtractDecimal, zeroDecimal } from "../utils/decimal";
import { normalizeText } from "../utils/text";
import { buildErpDocCompare, buildOaDocCompare } from "./doc-compare";
import { QUERY_DIRECTIONS, type QueryDirection } from "./query-direction";

type DepartmentVariancePerspective = "OA视角" | "ERP视角";
type DifferenceType = (typeof DIFFERENCE_TYPE_PRIORITY)[number];

interface RowBuildingMetricsOptions {
  metrics?: MetricsRecorder;
  note?: string;
}

function measureStage<T>(
  options: RowBuildingMetricsOptions | undefined,
  name: string,
  inputRows: number,
  outputRows: number | ((value: T) => number),
  action: () => T
): T {
  if (!options?.metrics) {
    return action();
  }
  if (options.note === undefined) {
    return options.metrics.measure(name, { inputRows, outputRows }, action);
  }
  return options.metrics.measure(name, { inputRows, outputRows, note: options.note }, action);
}

export interface DepartmentVarianceSummaryRow {
  company: string;
  dept1: string;
  dept2: string;
  perspective: DepartmentVariancePerspective;
  primaryDocCount: number;
  matchedDocCount: number;
  unmatchedDocCount: number;
  differentDocCount: number;
  oaQuantity: number;
  erpQuantity: number;
  quantityDiff: number;
  oaAmount: number;
  erpCost: number;
  amountDiff: number;
  differenceSummary: string;
}

interface SummaryAccumulator {
  company: string;
  dept1: string;
  dept2: string;
  perspective: DepartmentVariancePerspective;
  primaryDocCount: number;
  matchedDocCount: number;
  unmatchedDocCount: number;
  differentDocCount: number;
  oaQuantity: ReturnType<typeof zeroDecimal>;
  erpQuantity: ReturnType<typeof zeroDecimal>;
  oaAmount: ReturnType<typeof zeroDecimal>;
  erpCost: ReturnType<typeof zeroDecimal>;
  differenceTypes: Set<DifferenceType>;
}

function makeGroupKey(row: DocCompareRow, perspective: DepartmentVariancePerspective): string {
  return JSON.stringify([normalizeText(row.company), normalizeText(row.dept1), normalizeText(row.dept2), perspective]);
}

function createAccumulator(row: DocCompareRow, perspective: DepartmentVariancePerspective): SummaryAccumulator {
  return {
    company: normalizeText(row.company),
    dept1: normalizeText(row.dept1),
    dept2: normalizeText(row.dept2),
    perspective,
    primaryDocCount: 0,
    matchedDocCount: 0,
    unmatchedDocCount: 0,
    differentDocCount: 0,
    oaQuantity: zeroDecimal(),
    erpQuantity: zeroDecimal(),
    oaAmount: zeroDecimal(),
    erpCost: zeroDecimal(),
    differenceTypes: new Set<DifferenceType>()
  };
}

function addDocTotalsFromMeta(
  summary: SummaryAccumulator,
  item: DocCompareSummaryItem,
  perspective: DepartmentVariancePerspective
): void {
  if (perspective === "OA视角") {
    summary.oaQuantity = addDecimal(summary.oaQuantity, item.meta.primaryQuantity);
    summary.erpQuantity = addDecimal(summary.erpQuantity, item.meta.counterpartQuantity);
    summary.oaAmount = addDecimal(summary.oaAmount, item.meta.primaryAmount);
    summary.erpCost = addDecimal(summary.erpCost, item.meta.counterpartAmount);
    return;
  }

  summary.oaQuantity = addDecimal(summary.oaQuantity, item.meta.counterpartQuantity);
  summary.erpQuantity = addDecimal(summary.erpQuantity, item.meta.primaryQuantity);
  summary.oaAmount = addDecimal(summary.oaAmount, item.meta.counterpartAmount);
  summary.erpCost = addDecimal(summary.erpCost, item.meta.primaryAmount);
}

function buildDocumentNumberSet(rows: RawRow[] | null | undefined, fieldName: string): Set<string> {
  const result = new Set<string>();

  for (const row of rows ?? []) {
    const docNumber = normalizeText(row[fieldName]);
    if (docNumber) {
      result.add(docNumber);
    }
  }

  return result;
}

function hasMatchedCounterpartDoc(item: DocCompareSummaryItem, counterpartDocNumbers: Set<string>): boolean {
  return item.meta.counterpartDocNumbers.some((docNumber) => counterpartDocNumbers.has(docNumber));
}

function classifyDifference(
  item: DocCompareSummaryItem,
  perspective: DepartmentVariancePerspective,
  matched: boolean
): { differenceType: DifferenceType; matched: boolean; different: boolean } {
  if (!matched) {
    return {
      differenceType: perspective === "OA视角" ? "OA有申请，ERP无出库" : "ERP出库对应OA未在当前OA数据中找到",
      matched: false,
      different: false
    };
  }

  if (item.meta.hasMaterialShapeMismatch) {
    return {
      differenceType: "OA和ERP都有，但物料明细不一致",
      matched: true,
      different: true
    };
  }

  if (item.row.quantityDiff !== 0) {
    return {
      differenceType: "OA和ERP都有，但数量不同",
      matched: true,
      different: true
    };
  }

  return {
    differenceType: "OA和ERP都有，数量一致",
    matched: true,
    different: false
  };
}

function addSummaryItem(
  grouped: Map<string, SummaryAccumulator>,
  item: DocCompareSummaryItem,
  perspective: DepartmentVariancePerspective,
  counterpartDocNumbers: Set<string>
): void {
  const row = item.row;
  const key = makeGroupKey(row, perspective);
  let summary = grouped.get(key);
  if (!summary) {
    summary = createAccumulator(row, perspective);
    grouped.set(key, summary);
  }

  const classification = classifyDifference(item, perspective, hasMatchedCounterpartDoc(item, counterpartDocNumbers));

  summary.primaryDocCount += 1;
  if (classification.matched) {
    summary.matchedDocCount += 1;
  } else {
    summary.unmatchedDocCount += 1;
  }
  // unmatched 单据只进入未匹配数；有差异单据数只统计已匹配后仍有数量差或物料结构差的单据。
  if (classification.different) {
    summary.differentDocCount += 1;
  }
  summary.differenceTypes.add(classification.differenceType);
  addDocTotalsFromMeta(summary, item, perspective);
}

function buildRowsFromDocCompare(
  result: DocCompareResult,
  perspective: DepartmentVariancePerspective,
  counterpartDocNumbers: Set<string>,
  options?: RowBuildingMetricsOptions
): DepartmentVarianceSummaryRow[] {
  const grouped = new Map<string, SummaryAccumulator>();

  measureStage(options, "classify_summary_rows", result.summaryItems.length, result.summaryItems.length, () => {
    for (const item of result.summaryItems) {
      addSummaryItem(grouped, item, perspective, counterpartDocNumbers);
    }
    return result.summaryItems.length;
  });

  return measureStage(
    options,
    "build_summary_group_rows",
    grouped.size,
    (rows: DepartmentVarianceSummaryRow[]) => rows.length,
    () =>
      [...grouped.values()].map((summary) => {
        const quantityDiff = subtractDecimal(summary.oaQuantity, summary.erpQuantity);
        const amountDiff = subtractDecimal(summary.oaAmount, summary.erpCost);

        return {
          company: summary.company,
          dept1: summary.dept1,
          dept2: summary.dept2,
          perspective: summary.perspective,
          primaryDocCount: summary.primaryDocCount,
          matchedDocCount: summary.matchedDocCount,
          unmatchedDocCount: summary.unmatchedDocCount,
          differentDocCount: summary.differentDocCount,
          oaQuantity: decimalToNumber2(summary.oaQuantity),
          erpQuantity: decimalToNumber2(summary.erpQuantity),
          quantityDiff: decimalToNumber2(quantityDiff),
          oaAmount: decimalToNumber2(summary.oaAmount),
          erpCost: decimalToNumber2(summary.erpCost),
          amountDiff: decimalToNumber2(amountDiff),
          differenceSummary: DIFFERENCE_TYPE_PRIORITY.filter((type) => summary.differenceTypes.has(type)).join("、")
        };
      })
  );
}

export function buildDepartmentVarianceSummaryRows(
  oaRows: RawRow[] | null | undefined,
  erpRows: RawRow[] | null | undefined,
  filters: Partial<QueryFilters> | Record<string, unknown> | null | undefined,
  queryDirection: QueryDirection,
  options?: RowBuildingMetricsOptions
): DepartmentVarianceSummaryRow[] {
  if (queryDirection === QUERY_DIRECTIONS.oaKingdeeToErp) {
    const result = buildOaDocCompare(oaRows, erpRows, filters, options);
    const counterpartDocNumbers = measureStage(
      options,
      "build_summary_document_set",
      erpRows?.length ?? 0,
      (docNumbers: Set<string>) => docNumbers.size,
      () => buildDocumentNumberSet(erpRows, "单据编号")
    );

    return buildRowsFromDocCompare(result, "OA视角", counterpartDocNumbers, options);
  }

  const result = buildErpDocCompare(oaRows, erpRows, filters, options);
  const counterpartDocNumbers = measureStage(
    options,
    "build_summary_document_set",
    oaRows?.length ?? 0,
    (docNumbers: Set<string>) => docNumbers.size,
    () => buildDocumentNumberSet(oaRows, "表单编号")
  );
  return buildRowsFromDocCompare(result, "ERP视角", counterpartDocNumbers, options);
}

export function departmentVarianceSummaryRowsToValues(
  rows?: DepartmentVarianceSummaryRow[] | null
): OutputMatrix {
  return [
    [...DEPARTMENT_VARIANCE_SUMMARY_HEADERS],
    ...(rows ?? []).map((row) => [
      row.company,
      row.dept1,
      row.dept2,
      row.perspective,
      row.primaryDocCount,
      row.matchedDocCount,
      row.unmatchedDocCount,
      row.differentDocCount,
      row.oaQuantity,
      row.erpQuantity,
      row.quantityDiff,
      row.oaAmount,
      row.erpCost,
      row.amountDiff,
      row.differenceSummary
    ])
  ];
}
