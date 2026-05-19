import { type OaAggRow, type QueryFilters, type RawRow } from "../types/scrap";
import { normalizeDateKey } from "../utils/date";
import { addDecimal, parseDecimal, zeroDecimal } from "../utils/decimal";
import { appendUniqueJoinedText, normalizeText } from "../utils/text";

export function parseFilters(
  input: Partial<QueryFilters> | Record<string, unknown> | null | undefined = {}
): QueryFilters {
  // 弹窗、功能区和测试可能传入不同形状的对象，先统一成完整 QueryFilters 再进入核心查询。
  const source = input ?? {};
  const filters = {
    company: normalizeText(source.company),
    dept1: normalizeText(source.dept1),
    dept2: normalizeText(source.dept2),
    startDate: normalizeDateKey(source.startDate),
    endDate: normalizeDateKey(source.endDate)
  };
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    // 日期过滤边界如果反了，继续查询只会得到误导性空结果，所以这里直接报错。
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
  // 明细比较的稳定粒度是“单据号 + 物料”，同一物料多行会先聚合再和 ERP 对比。
  return `${normalizeText(formNumber)}||${normalizeText(itemCode)}`;
}

export function buildOaRows(
  oaRows?: RawRow[] | null,
  filters?: QueryFilters | null
): Map<string, OaAggRow> {
  const result = new Map<string, OaAggRow>();
  const activeRows = oaRows ?? [];
  const activeFilters = filters ?? parseFilters();

  // OA 金蝶单号方向先按用户条件筛 OA，再用 OA 上记录的金蝶云单据编号去 ERP 侧找出库。
  for (const row of activeRows) {
    const dateKey = normalizeDateKey(row["申请日期"]);
    if (!isDateInRange(dateKey, activeFilters)) {
      continue;
    }
    if (!matchesOrgFilters(row["公司简称"], row["一级部门"], row["二级部门"], activeFilters)) {
      continue;
    }

    const formNumber = normalizeText(row["表单编号"]);
    const kingdeeDocNumber = normalizeText(row["金蝶云单据编号"]);
    const itemCode = normalizeText(row["物料代码"]);
    if (!formNumber || !itemCode) {
      continue;
    }

    const key = makeDetailKey(formNumber, itemCode);
    let target = result.get(key);
    if (!target) {
      // 同一 OA 表单和物料保持一个聚合粒度，后续差异比较依赖这个稳定键。
      target = {
        formNumber,
        kingdeeDocNumber,
        itemCode,
        itemName: normalizeText(row["物料名称"]),
        company: normalizeText(row["公司简称"]),
        dept1: normalizeText(row["一级部门"]),
        dept2: normalizeText(row["二级部门"]),
        oaDate: "",
        quantity: zeroDecimal(),
        amount: zeroDecimal()
      };
      result.set(key, target);
    }
    // 同一聚合键下后续行如果补到了金蝶编号，就保留第一个非空编号用于 ERP 出库匹配。
    if (!target.kingdeeDocNumber && kingdeeDocNumber) {
      target.kingdeeDocNumber = kingdeeDocNumber;
    }

    target.oaDate = appendUniqueJoinedText(target.oaDate, dateKey);
    target.quantity = addDecimal(target.quantity, parseDecimal(row["数量"], "数量"));
    target.amount = addDecimal(target.amount, parseDecimal(row["实际预算金额mx"], "实际预算金额mx"));
  }

  return result;
}

export function buildOaRowsForFormNumbers(
  oaRows?: RawRow[] | null,
  formNumbers?: Set<string> | null
): Map<string, OaAggRow> {
  const result = new Map<string, OaAggRow>();
  const activeFormNumbers = formNumbers ?? new Set<string>();

  // ERP 源单查 OA 时，先从 ERP 侧收集源单号，再回 OA 全量表里取这些表单对应的物料行。
  for (const row of oaRows ?? []) {
    const formNumber = normalizeText(row["表单编号"]);
    const itemCode = normalizeText(row["物料代码"]);
    if (!formNumber || !itemCode || !activeFormNumbers.has(formNumber)) {
      continue;
    }

    const dateKey = normalizeDateKey(row["申请日期"]);
    const kingdeeDocNumber = normalizeText(row["金蝶云单据编号"]);
    const key = makeDetailKey(formNumber, itemCode);
    let target = result.get(key);
    if (!target) {
      target = {
        formNumber,
        kingdeeDocNumber,
        itemCode,
        itemName: normalizeText(row["物料名称"]),
        company: normalizeText(row["公司简称"]),
        dept1: normalizeText(row["一级部门"]),
        dept2: normalizeText(row["二级部门"]),
        oaDate: "",
        quantity: zeroDecimal(),
        amount: zeroDecimal()
      };
      result.set(key, target);
    }

    if (!target.kingdeeDocNumber && kingdeeDocNumber) {
      target.kingdeeDocNumber = kingdeeDocNumber;
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
