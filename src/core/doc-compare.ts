import type Decimal from "decimal.js-light";
import { ERP_DOC_COMPARE_HEADERS, OA_DOC_COMPARE_HEADERS } from "../constants";
import type {
  DocCompareResult,
  DocCompareRow,
  DocCompareSummaryItem,
  DocCompareSummaryMeta,
  OutputMatrix,
  OutputSheetKind,
  QueryFilters,
  RawRow
} from "../types/scrap";
import { normalizeDateKey } from "../utils/date";
import { addDecimal, decimalToDecimal2, decimalToNumber2, parseDecimal, subtractDecimal, zeroDecimal } from "../utils/decimal";
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

// 单据对比先按单据聚合，再在每张单据下面保留物料 Map，支撑后续“展开物料”。
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

  // 既保留 Set 便于匹配对方单据，也保留拼接文本便于直接写到输出表。
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
    // 物料层级也先聚合，避免一张单据同一物料多行直接变成多条展开结果。
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

  // OA 视角单据对比只按用户条件筛 OA 主单据，对方 ERP 单据在后面按金蝶编号匹配。
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

  // ERP 视角单据对比只按用户条件筛 ERP 主单据，对方 OA 单据在后面按源单号匹配。
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

  // 对方单据可能有多张，逐张累加数量、金额和物料，用来生成汇总行与展开行。
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

function makeSummaryKey(kind: DocCompareKind, summaryRow: Pick<DocCompareRow, "primaryDocNumber">): string {
  // 同一个单号在 OA/ERP 两个输出页含义不同，key 里带 kind 避免展开物料时串页。
  return JSON.stringify([kind, normalizeText(summaryRow.primaryDocNumber)]);
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

  // 先输出主单据自己的物料，再补对方独有物料，才能完整展示物料层级差异。
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

function hasMaterialShapeMismatch(materialRows: DocCompareRow[]): boolean {
  return materialRows.some(
    (row) =>
      (row.primaryQuantity === 0 && row.counterpartQuantity !== 0) ||
      (row.primaryQuantity !== 0 && row.counterpartQuantity === 0)
  );
}

function buildSummaryMeta(primary: DocAccumulator, counterpart: Pick<MatchedCounterpart, "quantity" | "amount">): DocCompareSummaryMeta {
  const primaryQuantity = decimalToDecimal2(primary.quantity);
  const primaryAmount = decimalToDecimal2(primary.amount);
  const counterpartQuantity = decimalToDecimal2(counterpart.quantity);
  const counterpartAmount = decimalToDecimal2(counterpart.amount);

  return {
    counterpartDocNumbers: [...primary.counterpartDocNumberSet],
    hasMaterialShapeMismatch: false,
    primaryQuantity,
    primaryAmount,
    counterpartQuantity,
    counterpartAmount,
    quantityDiff: subtractDecimal(primaryQuantity, counterpartQuantity),
    amountDiff: subtractDecimal(primaryAmount, counterpartAmount)
  };
}

function buildDocCompareResult(
  kind: DocCompareKind,
  primaryGroups: Map<string, DocAccumulator>,
  counterpartGroups: Map<string, DocAccumulator>
): DocCompareResult {
  const summaryRows: DocCompareRow[] = [];
  const materialRowsBySummaryKey = new Map<string, DocCompareRow[]>();
  const summaryItems: DocCompareSummaryItem[] = [];

  // 汇总行和物料行分开返回，宏层可以只写汇总，再按用户展开动作插入物料行。
  for (const primary of primaryGroups.values()) {
    const counterpart = buildMatchedCounterpart(primary, counterpartGroups);
    const summaryRow = buildDocCompareRow("汇总", primary, counterpart);
    const summaryKey = makeSummaryKey(kind, summaryRow);
    const materialRows = buildMaterialRows(primary, counterpart.materials);
    const meta = buildSummaryMeta(primary, counterpart);
    meta.hasMaterialShapeMismatch = hasMaterialShapeMismatch(materialRows);

    summaryRows.push(summaryRow);
    materialRowsBySummaryKey.set(summaryKey, materialRows);
    summaryItems.push({
      summaryKey,
      row: summaryRow,
      materialRows,
      meta
    });
  }

  return {
    kind,
    summaryRows,
    materialRowsBySummaryKey,
    summaryItems
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
