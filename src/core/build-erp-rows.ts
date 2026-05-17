import { type ErpAggRow, type OaAggRow, type QueryFilters, type RawRow } from "../types/scrap";
import { normalizeDateKey } from "../utils/date";
import { addDecimal, parseDecimal, zeroDecimal } from "../utils/decimal";
import { normalizeText } from "../utils/text";
import { isDateInRange, makeDetailKey, matchesOrgFilters } from "./build-oa-rows";

function collectSelectedOaForms(oaGroupedRows: Map<string, OaAggRow>): Set<string> {
  const forms = new Set<string>();
  for (const row of oaGroupedRows.values()) {
    if (row.formNumber) {
      forms.add(row.formNumber);
    }
  }
  return forms;
}

function addErpRowToGroup(
  result: Map<string, ErpAggRow>,
  row: RawRow,
  sourceFormNumber: string,
  itemCode: string
): void {
  const key = makeDetailKey(sourceFormNumber, itemCode);
  const docNumber = normalizeText(row["单据编号"]);
  const existing = result.get(key);

  if (!existing) {
    result.set(key, {
      sourceFormNumber,
      formNumber: sourceFormNumber,
      itemCode,
      itemName: normalizeText(row["物料名称"]),
      company: normalizeText(row["区分公司简称"]),
      dept1: normalizeText(row["一级部门"]),
      dept2: normalizeText(row["二级部门"]),
      quantity: zeroDecimal(),
      cost: zeroDecimal(),
      erpDocNumbers: []
    });
  }

  const target = result.get(key);
  if (!target) {
    throw new Error(`ERP 聚合失败：${key}`);
  }
  target.quantity = addDecimal(target.quantity, parseDecimal(row["实发数量"], "实发数量"));
  target.cost = addDecimal(target.cost, parseDecimal(row["总成本"], "总成本"));
  if (docNumber && !target.erpDocNumbers.includes(docNumber)) {
    target.erpDocNumbers.push(docNumber);
  }
}

export function buildErpRowsForOa(
  erpRows: RawRow[],
  oaGroupedRows: Map<string, OaAggRow>
): Map<string, ErpAggRow> {
  const result = new Map<string, ErpAggRow>();
  const selectedForms = collectSelectedOaForms(oaGroupedRows);

  for (const row of erpRows) {
    const sourceFormNumber = normalizeText(row["源单单号"]);
    const itemCode = normalizeText(row["物料编码"]);
    if (!sourceFormNumber || !itemCode || !selectedForms.has(sourceFormNumber)) {
      continue;
    }
    normalizeDateKey(row["日期"]);
    addErpRowToGroup(result, row, sourceFormNumber, itemCode);
  }

  return result;
}

export function buildErpOnlyRows(
  erpRows: RawRow[],
  currentOaFormNumbers: Set<string>,
  filters: QueryFilters
): Map<string, ErpAggRow> {
  const result = new Map<string, ErpAggRow>();

  for (const row of erpRows) {
    const dateKey = normalizeDateKey(row["日期"]);
    if (!isDateInRange(dateKey, filters)) {
      continue;
    }
    if (!matchesOrgFilters(row["区分公司简称"], row["一级部门"], row["二级部门"], filters)) {
      continue;
    }

    const sourceFormNumber = normalizeText(row["源单单号"]);
    const itemCode = normalizeText(row["物料编码"]);
    if (!sourceFormNumber || !itemCode || currentOaFormNumbers.has(sourceFormNumber)) {
      continue;
    }

    addErpRowToGroup(result, row, sourceFormNumber, itemCode);
  }

  return result;
}
