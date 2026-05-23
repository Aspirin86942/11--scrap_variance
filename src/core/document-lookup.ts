import type Decimal from "decimal.js-light";
import { DOCUMENT_LOOKUP_ERP_LEFT_HEADERS, DOCUMENT_LOOKUP_OA_LEFT_HEADERS } from "../constants";
import type { OutputMatrix, RawRow } from "../types/scrap";
import { normalizeDateKey } from "../utils/date";
import { addDecimal, decimalToNumber2, parseDecimal, subtractDecimal, zeroDecimal } from "../utils/decimal";
import { appendUniqueJoinedText, normalizeText } from "../utils/text";

export type DocumentLookupMode = "oa_form_number" | "erp_doc_number";
export type DocumentLookupTypeLabel = "查OA表单编号" | "查ERP单据编号";

export interface DocumentLookupSuggestion {
  mode: DocumentLookupMode;
  docNumber: string;
  label: string;
}

export interface DocumentLookupSuggestions {
  oa: DocumentLookupSuggestion[];
  erp: DocumentLookupSuggestion[];
}

export interface DocumentLookupInput {
  mode: DocumentLookupMode;
  docNumber: string;
  oaRows: RawRow[] | null | undefined;
  erpRows: RawRow[] | null | undefined;
}

export type DocumentLookupSelection = Pick<DocumentLookupInput, "mode" | "docNumber">;

export interface DocumentLookupRow {
  rowType: "物料";
  lookupType: DocumentLookupTypeLabel;
  matchedDocNumber: string;
  oaFormNumber: string;
  oaRecordedErpDocNumber: string;
  oaDate: string;
  oaCompany: string;
  oaDept1: string;
  oaDept2: string;
  oaItemCode: string;
  oaItemName: string;
  oaQuantity: number;
  oaAmount: number;
  erpDocNumber: string;
  erpRecordedOaFormNumber: string;
  erpDate: string;
  erpCompany: string;
  erpDept1: string;
  erpDept2: string;
  erpItemCode: string;
  erpItemName: string;
  erpQuantity: number;
  erpAmount: number;
  quantityDiff: number;
  amountDiff: number;
  remark: string;
}

export type DocumentLookupResult =
  | { ok: true; rows: DocumentLookupRow[] }
  | { ok: false; message: string };

interface SuggestionAccumulator {
  docNumber: string;
  dates: string;
  companies: string;
  deptPairs: string;
  counterpartDocNumbers: string;
}

interface MaterialAccumulator {
  formNumbers: string;
  recordedCounterpartDocNumbers: string;
  dates: string;
  companies: string;
  dept1: string;
  dept2: string;
  itemCode: string;
  itemName: string;
  quantity: Decimal;
  amount: Decimal;
  missingItemCodeRemark?: string;
}

interface MaterialAggregation {
  materials: Map<string, MaterialAccumulator>;
  missingItemCodeRows: MaterialAccumulator[];
}

interface CounterpartSplit {
  existingCounterpartRows: RawRow[];
  missingCounterpartRows: RawRow[];
}

function appendText(current: string, value: unknown, separator = ","): string {
  return appendUniqueJoinedText(current, normalizeText(value), separator);
}

function deptPair(dept1: unknown, dept2: unknown): string {
  const left = normalizeText(dept1);
  const right = normalizeText(dept2);
  if (left && right) {
    return `${left}/${right}`;
  }
  return left || right;
}

function getOrCreateSuggestion(groups: Map<string, SuggestionAccumulator>, docNumber: string): SuggestionAccumulator {
  const existing = groups.get(docNumber);
  if (existing) {
    return existing;
  }

  const created: SuggestionAccumulator = {
    docNumber,
    dates: "",
    companies: "",
    deptPairs: "",
    counterpartDocNumbers: ""
  };
  groups.set(docNumber, created);
  return created;
}

function buildSuggestionLabel(parts: string[]): string {
  return parts.filter((part) => part.trim()).join(" | ");
}

function counterpartLabel(prefix: string, docNumbers: string): string {
  return docNumbers ? `${prefix}: ${docNumbers}` : "";
}

export function buildDocumentLookupSuggestions(
  oaRows: RawRow[] | null | undefined,
  erpRows: RawRow[] | null | undefined
): DocumentLookupSuggestions {
  const oaGroups = new Map<string, SuggestionAccumulator>();
  for (const row of oaRows ?? []) {
    const docNumber = normalizeText(row["表单编号"]);
    if (!docNumber) {
      continue;
    }
    const target = getOrCreateSuggestion(oaGroups, docNumber);
    target.dates = appendText(target.dates, normalizeDateKey(row["申请日期"]));
    target.companies = appendText(target.companies, row["公司简称"]);
    target.deptPairs = appendText(target.deptPairs, deptPair(row["一级部门"], row["二级部门"]));
    target.counterpartDocNumbers = appendText(target.counterpartDocNumbers, row["金蝶云单据编号"]);
  }

  const erpGroups = new Map<string, SuggestionAccumulator>();
  for (const row of erpRows ?? []) {
    const docNumber = normalizeText(row["单据编号"]);
    if (!docNumber) {
      continue;
    }
    const target = getOrCreateSuggestion(erpGroups, docNumber);
    target.dates = appendText(target.dates, normalizeDateKey(row["日期"]));
    target.companies = appendText(target.companies, row["区分公司简称"]);
    target.deptPairs = appendText(target.deptPairs, deptPair(row["一级部门"], row["二级部门"]));
    target.counterpartDocNumbers = appendText(target.counterpartDocNumbers, row["源单单号"]);
  }

  return {
    oa: [...oaGroups.values()].map((group) => ({
      mode: "oa_form_number",
      docNumber: group.docNumber,
      label: buildSuggestionLabel([
        group.docNumber,
        group.dates,
        group.companies,
        group.deptPairs,
        counterpartLabel("ERP", group.counterpartDocNumbers)
      ])
    })),
    erp: [...erpGroups.values()].map((group) => ({
      mode: "erp_doc_number",
      docNumber: group.docNumber,
      label: buildSuggestionLabel([
        group.docNumber,
        group.dates,
        group.companies,
        group.deptPairs,
        counterpartLabel("OA", group.counterpartDocNumbers)
      ])
    }))
  };
}

function collectRowsByExactText(rows: RawRow[] | null | undefined, fieldName: string, expected: string): RawRow[] {
  const normalizedExpected = normalizeText(expected);
  return (rows ?? []).filter((row) => normalizeText(row[fieldName]) === normalizedExpected);
}

function collectRowsByAnyText(
  rows: RawRow[] | null | undefined,
  fieldName: string,
  expectedValues: Set<string>
): RawRow[] {
  return (rows ?? []).filter((row) => expectedValues.has(normalizeText(row[fieldName])));
}

function collectUniqueText(rows: RawRow[], fieldName: string): Set<string> {
  const result = new Set<string>();
  for (const row of rows) {
    const value = normalizeText(row[fieldName]);
    if (value) {
      result.add(value);
    }
  }
  return result;
}

function splitRowsByCounterpartPresence(
  rows: RawRow[],
  counterpartFieldName: string,
  existingCounterpartDocNumbers: Set<string>
): CounterpartSplit {
  const result: CounterpartSplit = {
    existingCounterpartRows: [],
    missingCounterpartRows: []
  };

  for (const row of rows) {
    const counterpartDocNumber = normalizeText(row[counterpartFieldName]);
    if (counterpartDocNumber && existingCounterpartDocNumbers.has(counterpartDocNumber)) {
      result.existingCounterpartRows.push(row);
    } else {
      result.missingCounterpartRows.push(row);
    }
  }

  return result;
}

function createMaterial(itemCode: string): MaterialAccumulator {
  return {
    formNumbers: "",
    recordedCounterpartDocNumbers: "",
    dates: "",
    companies: "",
    dept1: "",
    dept2: "",
    itemCode,
    itemName: "",
    quantity: zeroDecimal(),
    amount: zeroDecimal()
  };
}

function getOrCreateMaterial(groups: Map<string, MaterialAccumulator>, itemCode: string): MaterialAccumulator {
  const existing = groups.get(itemCode);
  if (existing) {
    return existing;
  }
  const created = createMaterial(itemCode);
  groups.set(itemCode, created);
  return created;
}

function aggregateOaMaterials(rows: RawRow[]): MaterialAggregation {
  const result: MaterialAggregation = {
    materials: new Map<string, MaterialAccumulator>(),
    missingItemCodeRows: []
  };
  for (const row of rows) {
    const itemCode = normalizeText(row["物料代码"]);
    const target = itemCode ? getOrCreateMaterial(result.materials, itemCode) : createMaterial("");
    target.formNumbers = appendText(target.formNumbers, row["表单编号"]);
    target.recordedCounterpartDocNumbers = appendText(target.recordedCounterpartDocNumbers, row["金蝶云单据编号"]);
    target.dates = appendText(target.dates, normalizeDateKey(row["申请日期"]));
    target.companies = appendText(target.companies, row["公司简称"]);
    target.dept1 = appendText(target.dept1, row["一级部门"]);
    target.dept2 = appendText(target.dept2, row["二级部门"]);
    if (!target.itemName) {
      target.itemName = normalizeText(row["物料名称"]);
    }
    target.quantity = addDecimal(target.quantity, parseDecimal(row["数量"], "数量"));
    target.amount = addDecimal(target.amount, parseDecimal(row["实际预算金额mx"], "实际预算金额mx"));
    if (!itemCode) {
      target.missingItemCodeRemark = "OA物料编码为空，无法配对";
      result.missingItemCodeRows.push(target);
    }
  }
  return result;
}

function aggregateErpMaterials(rows: RawRow[]): MaterialAggregation {
  const result: MaterialAggregation = {
    materials: new Map<string, MaterialAccumulator>(),
    missingItemCodeRows: []
  };
  for (const row of rows) {
    const itemCode = normalizeText(row["物料编码"]);
    const target = itemCode ? getOrCreateMaterial(result.materials, itemCode) : createMaterial("");
    target.formNumbers = appendText(target.formNumbers, row["单据编号"]);
    target.recordedCounterpartDocNumbers = appendText(target.recordedCounterpartDocNumbers, row["源单单号"]);
    target.dates = appendText(target.dates, normalizeDateKey(row["日期"]));
    target.companies = appendText(target.companies, row["区分公司简称"]);
    target.dept1 = appendText(target.dept1, row["一级部门"]);
    target.dept2 = appendText(target.dept2, row["二级部门"]);
    if (!target.itemName) {
      target.itemName = normalizeText(row["物料名称"]);
    }
    target.quantity = addDecimal(target.quantity, parseDecimal(row["实发数量"], "实发数量"));
    target.amount = addDecimal(target.amount, parseDecimal(row["总成本"], "总成本"));
    if (!itemCode) {
      target.missingItemCodeRemark = "ERP物料编码为空，无法配对";
      result.missingItemCodeRows.push(target);
    }
  }
  return result;
}

function unionMaterialCodes(left: Map<string, MaterialAccumulator>, right: Map<string, MaterialAccumulator>): string[] {
  return [...new Set([...left.keys(), ...right.keys()])];
}

function remarkFor(
  oa: MaterialAccumulator | undefined,
  erp: MaterialAccumulator | undefined,
  displayedQuantityDiff: number
): string {
  if (oa?.missingItemCodeRemark) {
    return oa.missingItemCodeRemark;
  }
  if (erp?.missingItemCodeRemark) {
    return erp.missingItemCodeRemark;
  }
  if (oa && !erp) {
    return "ERP缺少该物料";
  }
  if (!oa && erp) {
    return "OA缺少该物料";
  }
  if (!oa || !erp) {
    return "";
  }
  return displayedQuantityDiff === 0 ? "数量一致" : "数量不同";
}

function buildRows(
  lookupType: DocumentLookupTypeLabel,
  matchedDocNumber: string,
  oaRows: RawRow[],
  erpRows: RawRow[],
  missingCounterpartRemark: string
): DocumentLookupRow[] {
  const oaMaterials = aggregateOaMaterials(oaRows);
  const erpMaterials = aggregateErpMaterials(erpRows);
  const counterpartMissing = lookupType === "查OA表单编号" ? erpRows.length === 0 : oaRows.length === 0;

  function buildRow(oa: MaterialAccumulator | undefined, erp: MaterialAccumulator | undefined): DocumentLookupRow {
    const quantityDiff = subtractDecimal(oa?.quantity ?? zeroDecimal(), erp?.quantity ?? zeroDecimal());
    const amountDiff = subtractDecimal(oa?.amount ?? zeroDecimal(), erp?.amount ?? zeroDecimal());
    const displayedQuantityDiff = decimalToNumber2(quantityDiff);
    const materialRemark = remarkFor(oa, erp, displayedQuantityDiff);
    const hasMissingItemCode = Boolean(oa?.missingItemCodeRemark || erp?.missingItemCodeRemark);
    const rowMissingRemark = counterpartMissing && !hasMissingItemCode ? missingCounterpartRemark : materialRemark;

    return {
      rowType: "物料",
      lookupType,
      matchedDocNumber,
      oaFormNumber: oa?.formNumbers ?? "",
      oaRecordedErpDocNumber: oa?.recordedCounterpartDocNumbers ?? "",
      oaDate: oa?.dates ?? "",
      oaCompany: oa?.companies ?? "",
      oaDept1: oa?.dept1 ?? "",
      oaDept2: oa?.dept2 ?? "",
      oaItemCode: oa?.itemCode ?? "",
      oaItemName: oa?.itemName ?? "",
      oaQuantity: decimalToNumber2(oa?.quantity ?? zeroDecimal()),
      oaAmount: decimalToNumber2(oa?.amount ?? zeroDecimal()),
      erpDocNumber: erp?.formNumbers ?? "",
      erpRecordedOaFormNumber: erp?.recordedCounterpartDocNumbers ?? "",
      erpDate: erp?.dates ?? "",
      erpCompany: erp?.companies ?? "",
      erpDept1: erp?.dept1 ?? "",
      erpDept2: erp?.dept2 ?? "",
      erpItemCode: erp?.itemCode ?? "",
      erpItemName: erp?.itemName ?? "",
      erpQuantity: decimalToNumber2(erp?.quantity ?? zeroDecimal()),
      erpAmount: decimalToNumber2(erp?.amount ?? zeroDecimal()),
      quantityDiff: displayedQuantityDiff,
      amountDiff: decimalToNumber2(amountDiff),
      remark: rowMissingRemark
    };
  }

  const normalRows = unionMaterialCodes(oaMaterials.materials, erpMaterials.materials).map((itemCode) =>
    buildRow(oaMaterials.materials.get(itemCode), erpMaterials.materials.get(itemCode))
  );
  const missingOaRows = oaMaterials.missingItemCodeRows.map((oa) => buildRow(oa, undefined));
  const missingErpRows = erpMaterials.missingItemCodeRows.map((erp) => buildRow(undefined, erp));

  return [...normalRows, ...missingOaRows, ...missingErpRows];
}

function buildOaLookup(input: DocumentLookupInput): DocumentLookupResult {
  const oaRows = collectRowsByExactText(input.oaRows, "表单编号", input.docNumber);
  if (oaRows.length === 0) {
    return { ok: false, message: `未找到OA表单编号：${input.docNumber}` };
  }

  const existingErpDocNumbers = collectUniqueText(input.erpRows ?? [], "单据编号");
  const { existingCounterpartRows, missingCounterpartRows } = splitRowsByCounterpartPresence(
    oaRows,
    "金蝶云单据编号",
    existingErpDocNumbers
  );
  const erpDocNumbers = collectUniqueText(existingCounterpartRows, "金蝶云单据编号");
  const erpRows = collectRowsByAnyText(input.erpRows, "单据编号", erpDocNumbers);

  return {
    ok: true,
    rows: [
      ...buildRows("查OA表单编号", input.docNumber, existingCounterpartRows, erpRows, "未找到对应ERP单据"),
      ...buildRows("查OA表单编号", input.docNumber, missingCounterpartRows, [], "未找到对应ERP单据")
    ]
  };
}

function buildErpLookup(input: DocumentLookupInput): DocumentLookupResult {
  const erpRows = collectRowsByExactText(input.erpRows, "单据编号", input.docNumber);
  if (erpRows.length === 0) {
    return { ok: false, message: `未找到ERP单据编号：${input.docNumber}` };
  }

  const existingOaFormNumbers = collectUniqueText(input.oaRows ?? [], "表单编号");
  const { existingCounterpartRows, missingCounterpartRows } = splitRowsByCounterpartPresence(
    erpRows,
    "源单单号",
    existingOaFormNumbers
  );
  const oaFormNumbers = collectUniqueText(existingCounterpartRows, "源单单号");
  const oaRows = collectRowsByAnyText(input.oaRows, "表单编号", oaFormNumbers);

  return {
    ok: true,
    rows: [
      ...buildRows("查ERP单据编号", input.docNumber, oaRows, existingCounterpartRows, "未找到对应OA单据"),
      ...buildRows("查ERP单据编号", input.docNumber, [], missingCounterpartRows, "未找到对应OA单据")
    ]
  };
}

export function buildDocumentLookupResult(input: DocumentLookupInput): DocumentLookupResult {
  return input.mode === "oa_form_number" ? buildOaLookup(input) : buildErpLookup(input);
}

function oaSideValues(row: DocumentLookupRow): OutputMatrix[number] {
  return [
    row.oaFormNumber,
    row.oaRecordedErpDocNumber,
    row.oaDate,
    row.oaCompany,
    row.oaDept1,
    row.oaDept2,
    row.oaItemCode,
    row.oaItemName,
    row.oaQuantity,
    row.oaAmount
  ];
}

function erpSideValues(row: DocumentLookupRow): OutputMatrix[number] {
  return [
    row.erpDocNumber,
    row.erpRecordedOaFormNumber,
    row.erpDate,
    row.erpCompany,
    row.erpDept1,
    row.erpDept2,
    row.erpItemCode,
    row.erpItemName,
    row.erpQuantity,
    row.erpAmount
  ];
}

function leftMinusRight(left: number, right: number, leftFieldName: string, rightFieldName: string): number {
  return decimalToNumber2(
    subtractDecimal(parseDecimal(left, leftFieldName), parseDecimal(right, rightFieldName))
  );
}

export function documentLookupRowsToValues(
  rows: DocumentLookupRow[] | null | undefined,
  lookupType?: DocumentLookupTypeLabel
): OutputMatrix {
  const outputRows = rows ?? [];
  const resolvedLookupType = lookupType ?? outputRows[0]?.lookupType;
  const erpLeft = resolvedLookupType === "查ERP单据编号";
  const headers = erpLeft ? DOCUMENT_LOOKUP_ERP_LEFT_HEADERS : DOCUMENT_LOOKUP_OA_LEFT_HEADERS;

  return [
    [...headers],
    ...outputRows.map((row) => {
      const leftSide = erpLeft ? erpSideValues(row) : oaSideValues(row);
      const rightSide = erpLeft ? oaSideValues(row) : erpSideValues(row);
      const quantityDiff = erpLeft
        ? leftMinusRight(row.erpQuantity, row.oaQuantity, "ERP数量", "OA数量")
        : row.quantityDiff;
      const amountDiff = erpLeft
        ? leftMinusRight(row.erpAmount, row.oaAmount, "ERP金额", "OA金额")
        : row.amountDiff;

      return [
        row.rowType,
        row.lookupType,
        row.matchedDocNumber,
        ...leftSide,
        ...rightSide,
        quantityDiff,
        amountDiff,
        row.remark
      ];
    })
  ];
}
