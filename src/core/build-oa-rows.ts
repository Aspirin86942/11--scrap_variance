import { type OaAggRow, type QueryFilters, type RawRow } from "../types/scrap";
import { normalizeDateKey } from "../utils/date";
import { addDecimal, parseDecimal, zeroDecimal } from "../utils/decimal";
import { normalizeText } from "../utils/text";

export function parseFilters(input: Partial<QueryFilters> | Record<string, unknown>): QueryFilters {
  const filters = {
    company: normalizeText(input.company),
    dept1: normalizeText(input.dept1),
    dept2: normalizeText(input.dept2),
    startDate: normalizeDateKey(input.startDate),
    endDate: normalizeDateKey(input.endDate)
  };
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    throw new Error(`开始日期不能晚于结束日期：${filters.startDate} > ${filters.endDate}`);
  }
  return filters;
}

export function isDateInRange(dateKey: string, filters: QueryFilters): boolean {
  if (!dateKey) {
    return false;
  }
  if (filters.startDate && dateKey < filters.startDate) {
    return false;
  }
  if (filters.endDate && dateKey > filters.endDate) {
    return false;
  }
  return true;
}

export function matchesOrgFilters(
  company: unknown,
  dept1: unknown,
  dept2: unknown,
  filters: QueryFilters
): boolean {
  if (filters.company && normalizeText(company) !== filters.company) {
    return false;
  }
  if (filters.dept1 && normalizeText(dept1) !== filters.dept1) {
    return false;
  }
  if (filters.dept2 && normalizeText(dept2) !== filters.dept2) {
    return false;
  }
  return true;
}

export function makeDetailKey(formNumber: unknown, itemCode: unknown): string {
  return `${normalizeText(formNumber)}||${normalizeText(itemCode)}`;
}

export function buildOaRows(oaRows: RawRow[], filters: QueryFilters): Map<string, OaAggRow> {
  const result = new Map<string, OaAggRow>();

  for (const row of oaRows) {
    const dateKey = normalizeDateKey(row["申请日期"]);
    if (!isDateInRange(dateKey, filters)) {
      continue;
    }
    if (!matchesOrgFilters(row["公司简称"], row["一级部门"], row["二级部门"], filters)) {
      continue;
    }

    const formNumber = normalizeText(row["表单编号"]);
    const itemCode = normalizeText(row["物料代码"]);
    if (!formNumber || !itemCode) {
      continue;
    }

    const key = makeDetailKey(formNumber, itemCode);
    const existing = result.get(key);
    if (!existing) {
      // 同一 OA 表单和物料保持一个聚合粒度，后续差异比较依赖这个稳定键。
      result.set(key, {
        formNumber,
        itemCode,
        itemName: normalizeText(row["物料名称"]),
        company: normalizeText(row["公司简称"]),
        dept1: normalizeText(row["一级部门"]),
        dept2: normalizeText(row["二级部门"]),
        quantity: zeroDecimal(),
        amount: zeroDecimal()
      });
    }

    const target = result.get(key);
    if (!target) {
      throw new Error(`OA 聚合失败：${key}`);
    }
    target.quantity = addDecimal(target.quantity, parseDecimal(row["数量"], "数量"));
    target.amount = addDecimal(target.amount, parseDecimal(row["实际预算金额mx"], "实际预算金额mx"));
  }

  return result;
}

export function collectSelectedOaForms(oaGroupedRows: Map<string, OaAggRow>): Set<string> {
  const result = new Set<string>();
  for (const row of oaGroupedRows.values()) {
    if (row.formNumber) {
      result.add(row.formNumber);
    }
  }
  return result;
}
