import { DETAIL_HEADERS, DIFFERENCE_TYPE_PRIORITY, SUMMARY_HEADERS } from "../constants";
import { type DetailRow, type OutputMatrix, type SummaryRow } from "../types/scrap";
import type Decimal from "decimal.js-light";
import { addDecimal, decimalToNumber2, parseDecimal, subtractDecimal, zeroDecimal } from "../utils/decimal";
import { normalizeText } from "../utils/text";

interface SummaryAccumulator {
  company: string;
  dept1: string;
  dept2: string;
  oaQuantity: Decimal;
  erpQuantity: Decimal;
  oaAmount: Decimal;
  erpCost: Decimal;
  differenceTypes: Set<string>;
}

function makeSummaryKey(row: DetailRow): string {
  // summary 聚合到公司和两级部门，不带单据和物料；这些明细只保留在 detail 输出。
  return `${normalizeText(row.company)}||${normalizeText(row.dept1)}||${normalizeText(row.dept2)}`;
}

export function buildSummaryRows(detailRows?: DetailRow[] | null): SummaryRow[] {
  const grouped = new Map<string, SummaryAccumulator>();

  // 先从明细行累计部门维度的数量、金额和出现过的差异类型。
  for (const row of detailRows ?? []) {
    const key = makeSummaryKey(row);
    let summary = grouped.get(key);

    if (!summary) {
      summary = {
        company: normalizeText(row.company),
        dept1: normalizeText(row.dept1),
        dept2: normalizeText(row.dept2),
        oaQuantity: zeroDecimal(),
        erpQuantity: zeroDecimal(),
        oaAmount: zeroDecimal(),
        erpCost: zeroDecimal(),
        differenceTypes: new Set<string>()
      };
      grouped.set(key, summary);
    }

    summary.oaQuantity = addDecimal(summary.oaQuantity, parseDecimal(row.oaQuantity, "OA数量合计"));
    summary.erpQuantity = addDecimal(summary.erpQuantity, parseDecimal(row.erpQuantity, "ERP实发数量合计"));
    summary.oaAmount = addDecimal(summary.oaAmount, parseDecimal(row.oaAmount, "OA实际预算金额mx合计"));
    summary.erpCost = addDecimal(summary.erpCost, parseDecimal(row.erpCost, "ERP总成本合计"));

    const differenceType = normalizeText(row.differenceType);
    if (differenceType) {
      summary.differenceTypes.add(differenceType);
    }
  }

  const result: SummaryRow[] = [];
  for (const summary of grouped.values()) {
    const quantityDiff = subtractDecimal(summary.oaQuantity, summary.erpQuantity);
    const amountDiff = subtractDecimal(summary.oaAmount, summary.erpCost);
    result.push({
      company: summary.company,
      dept1: summary.dept1,
      dept2: summary.dept2,
      oaQuantity: decimalToNumber2(summary.oaQuantity),
      erpQuantity: decimalToNumber2(summary.erpQuantity),
      quantityDiff: decimalToNumber2(quantityDiff),
      oaAmount: decimalToNumber2(summary.oaAmount),
      erpCost: decimalToNumber2(summary.erpCost),
      amountDiff: decimalToNumber2(amountDiff),
      // 差异摘要按业务优先级输出，避免 Set 插入顺序影响用户看到的摘要顺序。
      differenceSummary: DIFFERENCE_TYPE_PRIORITY.filter((type) => summary.differenceTypes.has(type)).join("、")
    });
  }

  return result;
}

export function summaryRowsToValues(summaryRows?: SummaryRow[] | null): OutputMatrix {
  // 输出矩阵第一行固定为表头，后续写表逻辑可以整块写入 Range。
  return [
    [...SUMMARY_HEADERS],
    ...(summaryRows ?? []).map((row) => [
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

export function detailRowsToValues(detailRows?: DetailRow[] | null): OutputMatrix {
  // detail 字段顺序必须和 DETAIL_HEADERS 保持一致，否则 WPS 输出列会错位。
  return [
    [...DETAIL_HEADERS],
    ...(detailRows ?? []).map((row) => [
      row.differenceType,
      row.formNumber,
      row.oaKingdeeDocNumber,
      row.oaDate,
      row.erpDocNumbers,
      row.erpSourceFormNumber,
      row.erpDate,
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
