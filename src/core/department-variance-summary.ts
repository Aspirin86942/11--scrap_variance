import { DEPARTMENT_VARIANCE_SUMMARY_HEADERS, DIFFERENCE_TYPE_PRIORITY } from "../constants";
import type { DocCompareResult, DocCompareRow, OutputMatrix, QueryFilters, RawRow } from "../types/scrap";
import { addDecimal, decimalToNumber2, parseDecimal, subtractDecimal, zeroDecimal } from "../utils/decimal";
import { normalizeText } from "../utils/text";
import { buildErpDocCompare, buildMaterialRowsForDocSummary, buildOaDocCompare } from "./doc-compare";
import { QUERY_DIRECTIONS, type QueryDirection } from "./query-direction";

type DepartmentVariancePerspective = "OA视角" | "ERP视角";
type DifferenceType = (typeof DIFFERENCE_TYPE_PRIORITY)[number];

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

function addDocTotals(summary: SummaryAccumulator, row: DocCompareRow, perspective: DepartmentVariancePerspective): void {
  const primaryQuantity = parseDecimal(row.primaryQuantity, "主视角数量");
  const counterpartQuantity = parseDecimal(row.counterpartQuantity, "对方视角数量");
  const primaryAmount = parseDecimal(row.primaryAmount, "主视角金额");
  const counterpartAmount = parseDecimal(row.counterpartAmount, "对方视角金额");

  if (perspective === "OA视角") {
    summary.oaQuantity = addDecimal(summary.oaQuantity, primaryQuantity);
    summary.erpQuantity = addDecimal(summary.erpQuantity, counterpartQuantity);
    summary.oaAmount = addDecimal(summary.oaAmount, primaryAmount);
    summary.erpCost = addDecimal(summary.erpCost, counterpartAmount);
    return;
  }

  summary.oaQuantity = addDecimal(summary.oaQuantity, counterpartQuantity);
  summary.erpQuantity = addDecimal(summary.erpQuantity, primaryQuantity);
  summary.oaAmount = addDecimal(summary.oaAmount, counterpartAmount);
  summary.erpCost = addDecimal(summary.erpCost, primaryAmount);
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

function hasMatchedCounterpartDoc(row: DocCompareRow, counterpartDocNumbers: Set<string>): boolean {
  return normalizeText(row.counterpartDocNumber)
    .split(",")
    .some((docNumber) => counterpartDocNumbers.has(normalizeText(docNumber)));
}

function hasMaterialShapeMismatch(materialRows: DocCompareRow[]): boolean {
  return materialRows.some(
    (row) =>
      (row.primaryQuantity === 0 && row.counterpartQuantity !== 0) ||
      (row.primaryQuantity !== 0 && row.counterpartQuantity === 0)
  );
}

function classifyDifference(
  row: DocCompareRow,
  materialRows: DocCompareRow[],
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

  if (hasMaterialShapeMismatch(materialRows)) {
    return {
      differenceType: "OA和ERP都有，但物料明细不一致",
      matched: true,
      different: true
    };
  }

  if (row.quantityDiff !== 0) {
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

function addSummaryRow(
  grouped: Map<string, SummaryAccumulator>,
  result: DocCompareResult,
  row: DocCompareRow,
  perspective: DepartmentVariancePerspective,
  counterpartDocNumbers: Set<string>
): void {
  const key = makeGroupKey(row, perspective);
  let summary = grouped.get(key);
  if (!summary) {
    summary = createAccumulator(row, perspective);
    grouped.set(key, summary);
  }

  const materialRows = buildMaterialRowsForDocSummary(result, row);
  const classification = classifyDifference(
    row,
    materialRows,
    perspective,
    hasMatchedCounterpartDoc(row, counterpartDocNumbers)
  );

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
  addDocTotals(summary, row, perspective);
}

function buildRowsFromDocCompare(
  result: DocCompareResult,
  perspective: DepartmentVariancePerspective,
  counterpartDocNumbers: Set<string>
): DepartmentVarianceSummaryRow[] {
  const grouped = new Map<string, SummaryAccumulator>();

  for (const row of result.summaryRows) {
    addSummaryRow(grouped, result, row, perspective, counterpartDocNumbers);
  }

  return [...grouped.values()].map((summary) => {
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
  });
}

export function buildDepartmentVarianceSummaryRows(
  oaRows: RawRow[] | null | undefined,
  erpRows: RawRow[] | null | undefined,
  filters: Partial<QueryFilters> | Record<string, unknown> | null | undefined,
  queryDirection: QueryDirection
): DepartmentVarianceSummaryRow[] {
  if (queryDirection === QUERY_DIRECTIONS.oaKingdeeToErp) {
    return buildRowsFromDocCompare(
      buildOaDocCompare(oaRows, erpRows, filters),
      "OA视角",
      buildDocumentNumberSet(erpRows, "单据编号")
    );
  }

  return buildRowsFromDocCompare(
    buildErpDocCompare(oaRows, erpRows, filters),
    "ERP视角",
    buildDocumentNumberSet(oaRows, "表单编号")
  );
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
