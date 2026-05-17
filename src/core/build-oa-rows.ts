import { type OaAggRow, type QueryFilters, type RawRow } from "../types/scrap";
import { normalizeDateKey } from "../utils/date";
import { addDecimal, parseDecimal, zeroDecimal } from "../utils/decimal";
import { appendUniqueJoinedText, normalizeText } from "../utils/text";

export function parseFilters(
  input: Partial<QueryFilters> | Record<string, unknown> | null | undefined = {}
): QueryFilters {
  const source = input ?? {};
  const filters = {
    company: normalizeText(source.company),
    dept1: normalizeText(source.dept1),
    dept2: normalizeText(source.dept2),
    startDate: normalizeDateKey(source.startDate),
    endDate: normalizeDateKey(source.endDate)
  };
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    throw new Error(`开始日期不能晚于结束日期：${filters.startDate} > ${filters.endDate}`);
  }
  return filters;
}

export function isDateInRange(dateKey: string, filters: QueryFilters | null | undefined): boolean {
  const activeFilters = filters ?? parseFilters();
  if (!dateKey) {
    return false;
  }
  if (activeFilters.startDate && dateKey < activeFilters.startDate) {
    return false;
  }
  if (activeFilters.endDate && dateKey > activeFilters.endDate) {
    return false;
  }
  return true;
}

export function matchesOrgFilters(
  company: unknown,
  dept1: unknown,
  dept2: unknown,
  filters: QueryFilters | null | undefined
): boolean {
  const activeFilters = filters ?? parseFilters();
  if (activeFilters.company && normalizeText(company) !== activeFilters.company) {
    return false;
  }
  if (activeFilters.dept1 && normalizeText(dept1) !== activeFilters.dept1) {
    return false;
  }
  if (activeFilters.dept2 && normalizeText(dept2) !== activeFilters.dept2) {
    return false;
  }
  return true;
}

export function makeDetailKey(formNumber: unknown, itemCode: unknown): string {
  return `${normalizeText(formNumber)}||${normalizeText(itemCode)}`;
}

export function buildOaRows(
  oaRows?: RawRow[] | null,
  filters?: QueryFilters | null
): Map<string, OaAggRow> {
  const result = new Map<string, OaAggRow>();
  const activeRows = oaRows ?? [];
  const activeFilters = filters ?? parseFilters();

  for (const row of activeRows) {
    const dateKey = normalizeDateKey(row["申请日期"]);
    if (!isDateInRange(dateKey, activeFilters)) {
      continue;
    }
    if (!matchesOrgFilters(row["公司简称"], row["一级部门"], row["二级部门"], activeFilters)) {
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
        oaDate: "",
        quantity: zeroDecimal(),
        amount: zeroDecimal()
      });
    }

    const target = result.get(key);
    if (!target) {
      throw new Error(`OA 聚合失败：${key}`);
    }
    target.oaDate = appendUniqueJoinedText(target.oaDate, dateKey);
    target.quantity = addDecimal(target.quantity, parseDecimal(row["数量"], "数量"));
    target.amount = addDecimal(target.amount, parseDecimal(row["实际预算金额mx"], "实际预算金额mx"));
  }

  return result;
}

export function collectSelectedOaForms(oaGroupedRows?: Map<string, OaAggRow> | null): Set<string> {
  const result = new Set<string>();
  for (const row of (oaGroupedRows ?? new Map<string, OaAggRow>()).values()) {
    if (row.formNumber) {
      result.add(row.formNumber);
    }
  }
  return result;
}
