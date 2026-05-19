import { type DetailRow, type ErpAggRow, type OaAggRow } from "../types/scrap";
import { decimalToNumber2, parseDecimal, subtractDecimal } from "../utils/decimal";
import { normalizeText } from "../utils/text";

function buildFormNumberSet(groupedRows: Map<string, ErpAggRow> | null | undefined): Set<string> {
  const result = new Set<string>();

  // 这个集合只判断“这张 OA 单据是否有任何 ERP 出库”，用于区分整单缺失和物料明细缺失。
  for (const [key, row] of (groupedRows ?? new Map<string, ErpAggRow>()).entries()) {
    const formNumber = normalizeText(row.formNumber || row.sourceFormNumber || key.split("||")[0]);
    if (formNumber) {
      result.add(formNumber);
    }
  }

  return result;
}

function buildDifference(differenceType: string, oa?: OaAggRow, erp?: ErpAggRow): DetailRow {
  // OA/ERP 任一侧缺失时，展示字段从存在的一侧兜底取值，让用户仍能定位单据和物料。
  const formNumber = normalizeText(oa?.formNumber || erp?.formNumber || erp?.sourceFormNumber);
  const oaKingdeeDocNumber = normalizeText(oa?.kingdeeDocNumber);
  const erpSourceFormNumber = normalizeText(erp?.sourceFormNumber);
  const itemCode = normalizeText(oa?.itemCode || erp?.itemCode);
  const itemName = normalizeText(oa?.itemName || erp?.itemName);
  const company = normalizeText(oa?.company || erp?.company);
  const dept1 = normalizeText(oa?.dept1 || erp?.dept1);
  const dept2 = normalizeText(oa?.dept2 || erp?.dept2);
  const oaQuantity = oa ? decimalToNumber2(oa.quantity) : 0;
  const erpQuantity = erp ? decimalToNumber2(erp.quantity) : 0;
  const oaAmount = oa ? decimalToNumber2(oa.amount) : 0;
  const erpCost = erp ? decimalToNumber2(erp.cost) : 0;

  return {
    differenceType,
    formNumber,
    oaKingdeeDocNumber,
    oaDate: oa?.oaDate ?? "",
    erpDocNumbers: erp?.erpDocNumbers ?? "",
    erpSourceFormNumber,
    erpDate: erp?.erpDate ?? "",
    itemCode,
    itemName,
    company,
    dept1,
    dept2,
    oaQuantity,
    erpQuantity,
    quantityDiff: decimalToNumber2(
      subtractDecimal(parseDecimal(oaQuantity, "OA数量合计"), parseDecimal(erpQuantity, "ERP实发数量合计"))
    ),
    oaAmount,
    erpCost,
    amountDiff: decimalToNumber2(
      subtractDecimal(parseDecimal(oaAmount, "OA实际预算金额mx合计"), parseDecimal(erpCost, "ERP总成本合计"))
    ),
    remark:
      differenceType === "ERP出库对应OA未在当前OA数据中找到"
        ? "请用 ERP 源单单号回 OA 系统补查，或确认 OA 导出表是否包含该流程。"
        : ""
  };
}

export function compareRows(
  oaRows?: Map<string, OaAggRow> | null,
  erpRowsForOa?: Map<string, ErpAggRow> | null,
  erpOnlyRows?: Map<string, ErpAggRow> | null
): DetailRow[] {
  const details: DetailRow[] = [];
  const erpFormNumbers = buildFormNumberSet(erpRowsForOa);
  const activeOaRows = oaRows ?? new Map<string, OaAggRow>();
  const activeErpRowsForOa = erpRowsForOa ?? new Map<string, ErpAggRow>();
  const activeErpOnlyRows = erpOnlyRows ?? new Map<string, ErpAggRow>();

  // 先以 OA 聚合结果为主遍历，判断整单未出库、物料不一致、数量不同或数量一致。
  for (const [key, oa] of activeOaRows.entries()) {
    const erp = activeErpRowsForOa.get(key);
    const formNumber = normalizeText(oa?.formNumber || key.split("||")[0]);
    let differenceType: string;

    if (oa && !erp && !erpFormNumbers.has(formNumber)) {
      differenceType = "OA有申请，ERP无出库";
    } else if (!oa || !erp) {
      differenceType = "OA和ERP都有，但物料明细不一致";
    } else if (decimalToNumber2(oa.quantity) !== decimalToNumber2(erp.quantity)) {
      differenceType = "OA和ERP都有，但数量不同";
    } else {
      differenceType = "OA和ERP都有，数量一致";
    }

    details.push(buildDifference(differenceType, oa, erp));
  }

  // 再补 ERP 有、OA 同单据下没有的物料行，这类不是整单缺失，而是物料明细不一致。
  for (const [key, erp] of activeErpRowsForOa.entries()) {
    if (activeOaRows.has(key)) {
      continue;
    }

    details.push(buildDifference("OA和ERP都有，但物料明细不一致", undefined, erp));
  }

  // 最后补 ERP 源单完全不在当前 OA 数据中的记录，用单独差异类型提示用户回 OA 系统补查。
  for (const erp of activeErpOnlyRows.values()) {
    details.push(buildDifference("ERP出库对应OA未在当前OA数据中找到", undefined, erp));
  }

  return details;
}
