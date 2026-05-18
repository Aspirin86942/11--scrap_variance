import type Decimal from "decimal.js-light";
import { ERP_DOC_COMPARE_HEADERS, OA_DOC_COMPARE_HEADERS } from "../constants";
import type { DocCompareResult, DocCompareRow, OutputMatrix, OutputSheetKind, QueryFilters, RawRow } from "../types/scrap";
import { normalizeDateKey } from "../utils/date";
import { addDecimal, decimalToNumber2, parseDecimal, subtractDecimal, zeroDecimal } from "../utils/decimal";
import { appendUniqueJoinedText, normalizeText } from "../utils/text";
import { isDateInRange, matchesOrgFilters, parseFilters } from "./build-oa-rows";

type DocCompareKind = Extract<OutputSheetKind, "oa_doc_compare" | "erp_doc_compare">;
type FilterInput = Partial<QueryFilters> | Record<string, unknown> | null | undefined;

interface MaterialAccumulator {
  itemCode: string;
  itemName: string;
  quantity: Decimal;
  amount: Decimal;
}

interface DocAccumulator {
  docNumber: string;
  counterpartDocNumbers: string;
  counterpartDocNumberSet: Set<string>;
  company: string;
  dept1: string;
  dept2: string;
  date: string;
  quantity: Decimal;
  amount: Decimal;
  materials: Map<string, MaterialAccumulator>;
}

interface MatchedCounterpart {
  quantity: Decimal;
  amount: Decimal;
  materials: Map<string, MaterialAccumulator>;
}

function createDocAccumulator(docNumber: string): DocAccumulator {
  return {
    docNumber,
    counterpartDocNumbers: "",
    counterpartDocNumberSet: new Set<string>(),
    company: "",
    dept1: "",
    dept2: "",
    date: "",
    quantity: zeroDecimal(),
    amount: zeroDecimal(),
    materials: new Map<string, MaterialAccumulator>()
  };
}

function createMaterialAccumulator(itemCode: string, itemName: string): MaterialAccumulator {
  return {
    itemCode,
    itemName,
    quantity: zeroDecimal(),
    amount: zeroDecimal()
  };
}

function appendCounterpartDocNumber(doc: DocAccumulator, docNumber: string): void {
  const normalized = normalizeText(docNumber);
  if (!normalized) {
    return;
  }

  doc.counterpartDocNumberSet.add(normalized);
  doc.counterpartDocNumbers = appendUniqueJoinedText(doc.counterpartDocNumbers, normalized, ",");
}

function assignDocTextFields(
  doc: DocAccumulator,
  company: string,
  dept1: string,
  dept2: string,
  dateKey: string
): void {
  if (!doc.company && company) {
    doc.company = company;
  }
  if (!doc.dept1 && dept1) {
    doc.dept1 = dept1;
  }
  if (!doc.dept2 && dept2) {
    doc.dept2 = dept2;
  }
  doc.date = appendUniqueJoinedText(doc.date, dateKey);
}

function getOrCreateDoc(groups: Map<string, DocAccumulator>, docNumber: string): DocAccumulator {
  let doc = groups.get(docNumber);
  if (!doc) {
    doc = createDocAccumulator(docNumber);
    groups.set(docNumber, doc);
  }
  return doc;
}

function addMaterialTotals(
  materials: Map<string, MaterialAccumulator>,
  itemCode: string,
  itemName: string,
  quantity: Decimal,
  amount: Decimal
): void {
  let material = materials.get(itemCode);
  if (!material) {
    material = createMaterialAccumulator(itemCode, itemName);
    materials.set(itemCode, material);
  }
  if (!material.itemName && itemName) {
    material.itemName = itemName;
  }
  material.quantity = addDecimal(material.quantity, quantity);
  material.amount = addDecimal(material.amount, amount);
}

function addOaRowToDoc(groups: Map<string, DocAccumulator>, row: RawRow, dateKey: string): void {
  const docNumber = normalizeText(row["表单编号"]);
  const itemCode = normalizeText(row["物料代码"]);
  if (!docNumber || !itemCode) {
    return;
  }

  const quantity = parseDecimal(row["数量"], "数量");
  const amount = parseDecimal(row["实际预算金额mx"], "实际预算金额mx");
  const doc = getOrCreateDoc(groups, docNumber);

  assignDocTextFields(
    doc,
    normalizeText(row["公司简称"]),
    normalizeText(row["一级部门"]),
    normalizeText(row["二级部门"]),
    dateKey
  );
  appendCounterpartDocNumber(doc, normalizeText(row["金蝶云单据编号"]));

  doc.quantity = addDecimal(doc.quantity, quantity);
  doc.amount = addDecimal(doc.amount, amount);
  addMaterialTotals(doc.materials, itemCode, normalizeText(row["物料名称"]), quantity, amount);
}

function addErpRowToDoc(groups: Map<string, DocAccumulator>, row: RawRow, dateKey: string): void {
  const docNumber = normalizeText(row["单据编号"]);
  const itemCode = normalizeText(row["物料编码"]);
  if (!docNumber || !itemCode) {
    return;
  }

  const quantity = parseDecimal(row["实发数量"], "实发数量");
  const amount = parseDecimal(row["总成本"], "总成本");
  const doc = getOrCreateDoc(groups, docNumber);

  assignDocTextFields(
    doc,
    normalizeText(row["区分公司简称"]),
    normalizeText(row["一级部门"]),
    normalizeText(row["二级部门"]),
    dateKey
  );
  appendCounterpartDocNumber(doc, normalizeText(row["源单单号"]));

  doc.quantity = addDecimal(doc.quantity, quantity);
  doc.amount = addDecimal(doc.amount, amount);
  addMaterialTotals(doc.materials, itemCode, normalizeText(row["物料名称"]), quantity, amount);
}

function buildOaDocGroups(
  rows: RawRow[] | null | undefined,
  filters?: QueryFilters | null
): Map<string, DocAccumulator> {
  const result = new Map<string, DocAccumulator>();
  const activeFilters = filters ?? parseFilters();

  for (const row of rows ?? []) {
    const dateKey = normalizeDateKey(row["申请日期"]);
    if (!isDateInRange(dateKey, activeFilters)) {
      continue;
    }
    if (!matchesOrgFilters(row["公司简称"], row["一级部门"], row["二级部门"], activeFilters)) {
      continue;
    }
    addOaRowToDoc(result, row, dateKey);
  }

  return result;
}

function buildErpDocGroups(
  rows: RawRow[] | null | undefined,
  filters?: QueryFilters | null
): Map<string, DocAccumulator> {
  const result = new Map<string, DocAccumulator>();
  const activeFilters = filters ?? parseFilters();

  for (const row of rows ?? []) {
    const dateKey = normalizeDateKey(row["日期"]);
    if (!isDateInRange(dateKey, activeFilters)) {
      continue;
    }
    if (!matchesOrgFilters(row["区分公司简称"], row["一级部门"], row["二级部门"], activeFilters)) {
      continue;
    }
    addErpRowToDoc(result, row, dateKey);
  }

  return result;
}

function buildAllOaDocGroups(rows: RawRow[] | null | undefined): Map<string, DocAccumulator> {
  const result = new Map<string, DocAccumulator>();
  for (const row of rows ?? []) {
    addOaRowToDoc(result, row, normalizeDateKey(row["申请日期"]));
  }
  return result;
}

function buildAllErpDocGroups(rows: RawRow[] | null | undefined): Map<string, DocAccumulator> {
  const result = new Map<string, DocAccumulator>();
  for (const row of rows ?? []) {
    addErpRowToDoc(result, row, normalizeDateKey(row["日期"]));
  }
  return result;
}

function addCounterpartMaterial(
  target: Map<string, MaterialAccumulator>,
  source: MaterialAccumulator
): void {
  addMaterialTotals(target, source.itemCode, source.itemName, source.quantity, source.amount);
}

function buildMatchedCounterpart(
  primary: DocAccumulator,
  counterpartGroups: Map<string, DocAccumulator>
): MatchedCounterpart {
  const matched: MatchedCounterpart = {
    quantity: zeroDecimal(),
    amount: zeroDecimal(),
    materials: new Map<string, MaterialAccumulator>()
  };

  for (const counterpartDocNumber of primary.counterpartDocNumberSet) {
    const counterpart = counterpartGroups.get(counterpartDocNumber);
    if (!counterpart) {
      continue;
    }

    matched.quantity = addDecimal(matched.quantity, counterpart.quantity);
    matched.amount = addDecimal(matched.amount, counterpart.amount);
    for (const material of counterpart.materials.values()) {
      addCounterpartMaterial(matched.materials, material);
    }
  }

  return matched;
}

function makeSummaryKey(kind: DocCompareKind, summaryRow: Pick<DocCompareRow, "primaryDocNumber" | "counterpartDocNumber">): string {
  return JSON.stringify([kind, summaryRow.primaryDocNumber, summaryRow.counterpartDocNumber]);
}

function buildDocCompareRow(
  rowType: DocCompareRow["rowType"],
  primary: DocAccumulator,
  counterpart: Pick<MatchedCounterpart, "quantity" | "amount">,
  itemCode = "",
  itemName = ""
): DocCompareRow {
  const primaryQuantity = decimalToNumber2(primary.quantity);
  const primaryAmount = decimalToNumber2(primary.amount);
  const counterpartQuantity = decimalToNumber2(counterpart.quantity);
  const counterpartAmount = decimalToNumber2(counterpart.amount);

  return {
    rowType,
    company: primary.company,
    dept1: primary.dept1,
    dept2: primary.dept2,
    date: primary.date,
    primaryDocNumber: primary.docNumber,
    primaryQuantity,
    primaryAmount,
    counterpartDocNumber: primary.counterpartDocNumbers,
    counterpartQuantity,
    counterpartAmount,
    quantityDiff: decimalToNumber2(subtractDecimal(primary.quantity, counterpart.quantity)),
    amountDiff: decimalToNumber2(subtractDecimal(primary.amount, counterpart.amount)),
    itemCode,
    itemName,
    remark: ""
  };
}

function buildMaterialRows(
  primary: DocAccumulator,
  counterpartMaterials: Map<string, MaterialAccumulator>
): DocCompareRow[] {
  const result: DocCompareRow[] = [];
  const processedItemCodes = new Set<string>();

  for (const material of primary.materials.values()) {
    const counterpart = counterpartMaterials.get(material.itemCode) ?? createMaterialAccumulator(material.itemCode, "");
    result.push(
      buildDocCompareRow(
        "物料",
        {
          ...primary,
          quantity: material.quantity,
          amount: material.amount
        },
        counterpart,
        material.itemCode,
        material.itemName || counterpart.itemName
      )
    );
    processedItemCodes.add(material.itemCode);
  }

  for (const counterpart of counterpartMaterials.values()) {
    if (processedItemCodes.has(counterpart.itemCode)) {
      continue;
    }

    const emptyPrimaryMaterial = createMaterialAccumulator(counterpart.itemCode, counterpart.itemName);
    result.push(
      buildDocCompareRow(
        "物料",
        {
          ...primary,
          quantity: emptyPrimaryMaterial.quantity,
          amount: emptyPrimaryMaterial.amount
        },
        counterpart,
        counterpart.itemCode,
        counterpart.itemName
      )
    );
  }

  return result;
}

function buildDocCompareResult(
  kind: DocCompareKind,
  primaryGroups: Map<string, DocAccumulator>,
  counterpartGroups: Map<string, DocAccumulator>
): DocCompareResult {
  const summaryRows: DocCompareRow[] = [];
  const materialRowsBySummaryKey = new Map<string, DocCompareRow[]>();

  for (const primary of primaryGroups.values()) {
    const counterpart = buildMatchedCounterpart(primary, counterpartGroups);
    const summaryRow = buildDocCompareRow("汇总", primary, counterpart);
    summaryRows.push(summaryRow);
    materialRowsBySummaryKey.set(makeSummaryKey(kind, summaryRow), buildMaterialRows(primary, counterpart.materials));
  }

  return {
    kind,
    summaryRows,
    materialRowsBySummaryKey
  };
}

export function buildOaDocCompare(
  oaRows: RawRow[] | null | undefined,
  erpRows: RawRow[] | null | undefined,
  filters?: FilterInput
): DocCompareResult {
  const activeFilters = parseFilters(filters);
  return buildDocCompareResult("oa_doc_compare", buildOaDocGroups(oaRows, activeFilters), buildAllErpDocGroups(erpRows));
}

export function buildErpDocCompare(
  oaRows: RawRow[] | null | undefined,
  erpRows: RawRow[] | null | undefined,
  filters?: FilterInput
): DocCompareResult {
  const activeFilters = parseFilters(filters);
  return buildDocCompareResult("erp_doc_compare", buildErpDocGroups(erpRows, activeFilters), buildAllOaDocGroups(oaRows));
}

export function buildMaterialRowsForDocSummary(
  result: DocCompareResult,
  summaryRow: DocCompareRow
): DocCompareRow[] {
  return [...(result.materialRowsBySummaryKey.get(makeSummaryKey(result.kind, summaryRow)) ?? [])];
}

export function docCompareRowsToValues(kind: DocCompareKind, rows?: DocCompareRow[] | null): OutputMatrix {
  const headers = kind === "oa_doc_compare" ? OA_DOC_COMPARE_HEADERS : ERP_DOC_COMPARE_HEADERS;

  return [
    [...headers],
    ...(rows ?? []).map((row) => [
      row.rowType,
      row.company,
      row.dept1,
      row.dept2,
      row.date,
      row.primaryDocNumber,
      row.primaryQuantity,
      row.primaryAmount,
      row.counterpartDocNumber,
      row.counterpartQuantity,
      row.counterpartAmount,
      row.quantityDiff,
      row.amountDiff,
      row.itemCode,
      row.itemName,
      row.remark
    ])
  ];
}
