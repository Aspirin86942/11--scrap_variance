import type Decimal from "decimal.js-light";
import { DOCUMENT_LOOKUP_HEADERS } from "../constants";
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
        `ERP: ${group.counterpartDocNumbers}`
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
        `OA: ${group.counterpartDocNumbers}`
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

function getOrCreateMaterial(groups: Map<string, MaterialAccumulator>, itemCode: string): MaterialAccumulator {
  const existing = groups.get(itemCode);
  if (existing) {
    return existing;
  }
  const created: MaterialAccumulator = {
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
  groups.set(itemCode, created);
  return created;
}

function aggregateOaMaterials(rows: RawRow[]): Map<string, MaterialAccumulator> {
  const result = new Map<string, MaterialAccumulator>();
  for (const row of rows) {
    const itemCode = normalizeText(row["物料代码"]);
    if (!itemCode) {
      continue;
    }
    const target = getOrCreateMaterial(result, itemCode);
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
  }
  return result;
}

function aggregateErpMaterials(rows: RawRow[]): Map<string, MaterialAccumulator> {
  const result = new Map<string, MaterialAccumulator>();
  for (const row of rows) {
    const itemCode = normalizeText(row["物料编码"]);
    if (!itemCode) {
      continue;
    }
    const target = getOrCreateMaterial(result, itemCode);
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
  }
  return result;
}

function unionMaterialCodes(left: Map<string, MaterialAccumulator>, right: Map<string, MaterialAccumulator>): string[] {
  return [...new Set([...left.keys(), ...right.keys()])];
}

function remarkFor(
  oa: MaterialAccumulator | undefined,
  erp: MaterialAccumulator | undefined
): string {
  if (oa && !erp) {
    return "ERP缺少该物料";
  }
  if (!oa && erp) {
    return "OA缺少该物料";
  }
  if (!oa || !erp) {
    return "";
  }
  return subtractDecimal(oa.quantity, erp.quantity).isZero() ? "数量一致" : "数量不同";
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

  return unionMaterialCodes(oaMaterials, erpMaterials).map((itemCode) => {
    const oa = oaMaterials.get(itemCode);
    const erp = erpMaterials.get(itemCode);
    const quantityDiff = subtractDecimal(oa?.quantity ?? zeroDecimal(), erp?.quantity ?? zeroDecimal());
    const amountDiff = subtractDecimal(oa?.amount ?? zeroDecimal(), erp?.amount ?? zeroDecimal());
    const rowMissingRemark = counterpartMissing ? missingCounterpartRemark : remarkFor(oa, erp);

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
      quantityDiff: decimalToNumber2(quantityDiff),
      amountDiff: decimalToNumber2(amountDiff),
      remark: rowMissingRemark
    };
  });
}

function buildOaLookup(input: DocumentLookupInput): DocumentLookupResult {
  const oaRows = collectRowsByExactText(input.oaRows, "表单编号", input.docNumber);
  if (oaRows.length === 0) {
    return { ok: false, message: `未找到OA表单编号：${input.docNumber}` };
  }

  const erpDocNumbers = collectUniqueText(oaRows, "金蝶云单据编号");
  const erpRows = collectRowsByAnyText(input.erpRows, "单据编号", erpDocNumbers);
  return { ok: true, rows: buildRows("查OA表单编号", input.docNumber, oaRows, erpRows, "未找到对应ERP单据") };
}

function buildErpLookup(input: DocumentLookupInput): DocumentLookupResult {
  const erpRows = collectRowsByExactText(input.erpRows, "单据编号", input.docNumber);
  if (erpRows.length === 0) {
    return { ok: false, message: `未找到ERP单据编号：${input.docNumber}` };
  }

  const oaFormNumbers = collectUniqueText(erpRows, "源单单号");
  const oaRows = collectRowsByAnyText(input.oaRows, "表单编号", oaFormNumbers);
  return { ok: true, rows: buildRows("查ERP单据编号", input.docNumber, oaRows, erpRows, "未找到对应OA单据") };
}

export function buildDocumentLookupResult(input: DocumentLookupInput): DocumentLookupResult {
  return input.mode === "oa_form_number" ? buildOaLookup(input) : buildErpLookup(input);
}

export function documentLookupRowsToValues(rows: DocumentLookupRow[] | null | undefined): OutputMatrix {
  return [
    [...DOCUMENT_LOOKUP_HEADERS],
    ...(rows ?? []).map((row) => [
      row.rowType,
      row.lookupType,
      row.matchedDocNumber,
      row.oaFormNumber,
      row.oaRecordedErpDocNumber,
      row.oaDate,
      row.oaCompany,
      row.oaDept1,
      row.oaDept2,
      row.oaItemCode,
      row.oaItemName,
      row.oaQuantity,
      row.oaAmount,
      row.erpDocNumber,
      row.erpRecordedOaFormNumber,
      row.erpDate,
      row.erpCompany,
      row.erpDept1,
      row.erpDept2,
      row.erpItemCode,
      row.erpItemName,
      row.erpQuantity,
      row.erpAmount,
      row.quantityDiff,
      row.amountDiff,
      row.remark
    ])
  ];
}
