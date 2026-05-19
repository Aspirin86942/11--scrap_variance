import { type ErpAggRow, type OaAggRow, type QueryFilters, type RawRow } from "../types/scrap";
import { normalizeDateKey } from "../utils/date";
import { addDecimal, parseDecimal, zeroDecimal } from "../utils/decimal";
import { appendUniqueJoinedText, normalizeText } from "../utils/text";
import { collectSelectedOaForms, isDateInRange, makeDetailKey, matchesOrgFilters, parseFilters } from "./build-oa-rows";

function addErpRowToGroup(
  result: Map<string, ErpAggRow>,
  row: RawRow,
  groupingFormNumber: string,
  itemCode: string,
  dateKey: string,
  sourceFormNumber = normalizeText(row["源单单号"])
): void {
  const key = makeDetailKey(groupingFormNumber, itemCode);
  const docNumber = normalizeText(row["单据编号"]);
  let target = result.get(key);

  if (!target) {
    // ERP 聚合也使用“业务单据 + 物料”粒度，但 groupingFormNumber 会随查询方向变化。
    target = {
      sourceFormNumber,
      formNumber: groupingFormNumber,
      itemCode,
      itemName: normalizeText(row["物料名称"]),
      company: normalizeText(row["区分公司简称"]),
      dept1: normalizeText(row["一级部门"]),
      dept2: normalizeText(row["二级部门"]),
      erpDate: "",
      quantity: zeroDecimal(),
      cost: zeroDecimal(),
      erpDocNumbers: ""
    };
    result.set(key, target);
  }

  if (!target.sourceFormNumber && sourceFormNumber) {
    target.sourceFormNumber = sourceFormNumber;
  }

  // 一个 OA 表单可能对应多张 ERP 出库单，展示时用逗号拼接但保持去重。
  target.erpDate = appendUniqueJoinedText(target.erpDate, dateKey);
  target.erpDocNumbers = appendUniqueJoinedText(target.erpDocNumbers, docNumber, ",");
  target.quantity = addDecimal(target.quantity, parseDecimal(row["实发数量"], "实发数量"));
  target.cost = addDecimal(target.cost, parseDecimal(row["总成本"], "总成本"));
}

export function buildErpRowsForOa(
  erpRows?: RawRow[] | null,
  oaGroupedRows?: Map<string, OaAggRow> | null
): Map<string, ErpAggRow> {
  const result = new Map<string, ErpAggRow>();
  const selectedForms = collectSelectedOaForms(oaGroupedRows);

  // 旧的源单号方向按 ERP 源单单号匹配 OA 表单编号，只有当前 OA 集合里的单据才参与比较。
  for (const row of erpRows ?? []) {
    const sourceFormNumber = normalizeText(row["源单单号"]);
    const itemCode = normalizeText(row["物料编码"]);
    if (!sourceFormNumber || !itemCode || !selectedForms.has(sourceFormNumber)) {
      continue;
    }
    const dateKey = normalizeDateKey(row["日期"]);
    addErpRowToGroup(result, row, sourceFormNumber, itemCode, dateKey);
  }

  return result;
}

function indexErpRowsByDocNumber(erpRows: RawRow[] | null | undefined): Map<string, RawRow[]> {
  const result = new Map<string, RawRow[]>();

  // OA 金蝶单号方向需要按 ERP 单据编号快速查找出库行，所以先建一个一对多索引。
  for (const row of erpRows ?? []) {
    const docNumber = normalizeText(row["单据编号"]);
    if (!docNumber) {
      continue;
    }
    const rows = result.get(docNumber) ?? [];
    rows.push(row);
    result.set(docNumber, rows);
  }

  return result;
}

function makeOaKingdeeLookupKey(formNumber: string, kingdeeDocNumber: string): string {
  return JSON.stringify([formNumber, kingdeeDocNumber]);
}

export function buildErpRowsForOaKingdee(
  erpRows?: RawRow[] | null,
  oaGroupedRows?: Map<string, OaAggRow> | null
): Map<string, ErpAggRow> {
  const result = new Map<string, ErpAggRow>();
  const erpByDocNumber = indexErpRowsByDocNumber(erpRows);
  const processedOaKingdeeDocs = new Set<string>();

  // 同一 OA 表单可能有多个物料行，但金蝶单据编号只需要处理一次，避免重复累计 ERP 出库行。
  for (const oa of (oaGroupedRows ?? new Map<string, OaAggRow>()).values()) {
    if (!oa.kingdeeDocNumber) {
      continue;
    }
    const oaKingdeeLookupKey = makeOaKingdeeLookupKey(oa.formNumber, oa.kingdeeDocNumber);
    if (processedOaKingdeeDocs.has(oaKingdeeLookupKey)) {
      continue;
    }
    processedOaKingdeeDocs.add(oaKingdeeLookupKey);

    for (const row of erpByDocNumber.get(oa.kingdeeDocNumber) ?? []) {
      const itemCode = normalizeText(row["物料编码"]);
      if (!itemCode) {
        continue;
      }
      addErpRowToGroup(result, row, oa.formNumber, itemCode, normalizeDateKey(row["日期"]));
    }
  }

  return result;
}

export interface SplitErpRowsByOaFormsResult {
  erpRowsForOa: Map<string, ErpAggRow>;
  erpOnlyRows: Map<string, ErpAggRow>;
}

export function buildErpRowsByErpFilters(
  erpRows?: RawRow[] | null,
  filters?: QueryFilters | null
): Map<string, ErpAggRow> {
  const result = new Map<string, ErpAggRow>();
  const activeFilters = filters ?? parseFilters();

  // ERP 源单查 OA 时，用户条件先作用在 ERP 出库表上，再反查相关 OA 表单。
  for (const row of erpRows ?? []) {
    const dateKey = normalizeDateKey(row["日期"]);
    if (!isDateInRange(dateKey, activeFilters)) {
      continue;
    }
    if (!matchesOrgFilters(row["区分公司简称"], row["一级部门"], row["二级部门"], activeFilters)) {
      continue;
    }

    const sourceFormNumber = normalizeText(row["源单单号"]);
    const itemCode = normalizeText(row["物料编码"]);
    if (!itemCode) {
      continue;
    }

    addErpRowToGroup(result, row, sourceFormNumber, itemCode, dateKey, sourceFormNumber);
  }

  return result;
}

export function collectErpSourceForms(erpGroupedRows?: Map<string, ErpAggRow> | null): Set<string> {
  const result = new Set<string>();

  for (const row of (erpGroupedRows ?? new Map<string, ErpAggRow>()).values()) {
    const sourceFormNumber = normalizeText(row.sourceFormNumber || row.formNumber);
    if (sourceFormNumber) {
      result.add(sourceFormNumber);
    }
  }

  return result;
}

export function splitErpRowsByOaForms(
  erpGroupedRows?: Map<string, ErpAggRow> | null,
  oaFormNumbers?: Set<string> | null
): SplitErpRowsByOaFormsResult {
  const erpRowsForOa = new Map<string, ErpAggRow>();
  const erpOnlyRows = new Map<string, ErpAggRow>();
  const activeOaFormNumbers = oaFormNumbers ?? new Set<string>();

  // ERP 已筛中的记录如果源单不在当前 OA 数据里，要单独输出“ERP 有出库，OA 未找到”。
  for (const [key, row] of (erpGroupedRows ?? new Map<string, ErpAggRow>()).entries()) {
    const sourceFormNumber = normalizeText(row.sourceFormNumber || row.formNumber);
    if (sourceFormNumber && activeOaFormNumbers.has(sourceFormNumber)) {
      erpRowsForOa.set(key, row);
    } else {
      erpOnlyRows.set(key, row);
    }
  }

  return { erpRowsForOa, erpOnlyRows };
}

export function buildErpOnlyRows(
  erpRows?: RawRow[] | null,
  currentOaFormNumbers?: Set<string> | null,
  filters?: QueryFilters | null
): Map<string, ErpAggRow> {
  const result = new Map<string, ErpAggRow>();
  const activeFormNumbers = currentOaFormNumbers ?? new Set<string>();
  const activeFilters = filters ?? parseFilters();

  for (const row of erpRows ?? []) {
    const dateKey = normalizeDateKey(row["日期"]);
    if (!isDateInRange(dateKey, activeFilters)) {
      continue;
    }
    if (!matchesOrgFilters(row["区分公司简称"], row["一级部门"], row["二级部门"], activeFilters)) {
      continue;
    }

    const sourceFormNumber = normalizeText(row["源单单号"]);
    const itemCode = normalizeText(row["物料编码"]);
    if (!sourceFormNumber || !itemCode || activeFormNumbers.has(sourceFormNumber)) {
      continue;
    }

    addErpRowToGroup(result, row, sourceFormNumber, itemCode, dateKey);
  }

  return result;
}
