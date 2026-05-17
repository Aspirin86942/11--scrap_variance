import { DETAIL_HEADERS, DIFFERENCE_TYPE_PRIORITY, SUMMARY_HEADERS } from "../constants";
import { type DetailRow, type OutputMatrix, type SummaryRow } from "../types/scrap";
import { addDecimal, decimalToNumber2, parseDecimal, subtractDecimal } from "../utils/decimal";
import { normalizeText } from "../utils/text";

interface SummaryAccumulator extends SummaryRow {
  differenceTypes: Set<string>;
}

function makeSummaryKey(row: DetailRow): string {
  return `${normalizeText(row.company)}||${normalizeText(row.dept1)}||${normalizeText(row.dept2)}`;
}

export function buildSummaryRows(detailRows: DetailRow[]): SummaryRow[] {
  const grouped = new Map<string, SummaryAccumulator>();

  for (const row of detailRows) {
    const key = makeSummaryKey(row);
    let summary = grouped.get(key);

    if (!summary) {
      summary = {
        company: normalizeText(row.company),
        dept1: normalizeText(row.dept1),
        dept2: normalizeText(row.dept2),
        oaQuantity: 0,
        erpQuantity: 0,
        quantityDiff: 0,
        oaAmount: 0,
        erpCost: 0,
        amountDiff: 0,
        differenceSummary: "",
        differenceTypes: new Set<string>()
      };
      grouped.set(key, summary);
    }

    summary.oaQuantity = decimalToNumber2(
      addDecimal(parseDecimal(summary.oaQuantity, "OA数量合计"), parseDecimal(row.oaQuantity, "OA数量合计"))
    );
    summary.erpQuantity = decimalToNumber2(
      addDecimal(
        parseDecimal(summary.erpQuantity, "ERP实发数量合计"),
        parseDecimal(row.erpQuantity, "ERP实发数量合计")
      )
    );
    summary.oaAmount = decimalToNumber2(
      addDecimal(
        parseDecimal(summary.oaAmount, "OA实际预算金额mx合计"),
        parseDecimal(row.oaAmount, "OA实际预算金额mx合计")
      )
    );
    summary.erpCost = decimalToNumber2(
      addDecimal(parseDecimal(summary.erpCost, "ERP总成本合计"), parseDecimal(row.erpCost, "ERP总成本合计"))
    );

    const differenceType = normalizeText(row.differenceType);
    if (differenceType) {
      summary.differenceTypes.add(differenceType);
    }
  }

  const result: SummaryRow[] = [];
  for (const summary of grouped.values()) {
    summary.quantityDiff = decimalToNumber2(
      subtractDecimal(parseDecimal(summary.oaQuantity, "OA数量合计"), parseDecimal(summary.erpQuantity, "ERP实发数量合计"))
    );
    summary.amountDiff = decimalToNumber2(
      subtractDecimal(parseDecimal(summary.oaAmount, "OA实际预算金额mx合计"), parseDecimal(summary.erpCost, "ERP总成本合计"))
    );
    summary.differenceSummary = DIFFERENCE_TYPE_PRIORITY.filter((type) =>
      summary.differenceTypes.has(type)
    ).join("、");

    const { differenceTypes: _differenceTypes, ...row } = summary;
    result.push(row);
  }

  return result;
}

export function summaryRowsToValues(summaryRows: SummaryRow[]): OutputMatrix {
  return [
    [...SUMMARY_HEADERS],
    ...summaryRows.map((row) => [
      row.company,
      row.dept1,
      row.dept2,
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

export function detailRowsToValues(detailRows: DetailRow[]): OutputMatrix {
  return [
    [...DETAIL_HEADERS],
    ...detailRows.map((row) => [
      row.differenceType,
      row.formNumber,
      row.erpDocNumbers,
      row.itemCode,
      row.itemName,
      row.company,
      row.dept1,
      row.dept2,
      row.oaQuantity,
      row.erpQuantity,
      row.quantityDiff,
      row.oaAmount,
      row.erpCost,
      row.amountDiff,
      row.remark
    ])
  ];
}
