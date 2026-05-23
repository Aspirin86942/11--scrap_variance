import type Decimal from "decimal.js-light";
import { ERP_DOC_COMPARE_HEADERS, OA_DOC_COMPARE_HEADERS } from "../constants";
import { UNKNOWN_MEMORY, type MemorySample } from "../perf/memory";
import type { MetricsRecorder } from "../perf/metrics";
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
type TimedDocCompareStage = "summary" | "material";

const INTERLEAVED_STAGE_MEMORY_SAMPLE: MemorySample = {
  available: false,
  heapUsedMb: UNKNOWN_MEMORY,
  rssMb: UNKNOWN_MEMORY
};

interface RowBuildingMetricsOptions {
  metrics?: MetricsRecorder;
  note?: string;
  includeMaterialRows?: boolean;
  includeSummaryItems?: boolean;
}

function measureStage<T>(
  options: RowBuildingMetricsOptions | undefined,
  name: string,
  inputRows: number,
  outputRows: number | ((value: T) => number),
  action: () => T
): T {
  if (!options?.metrics) {
    return action();
  }
  if (options.note === undefined) {
    return options.metrics.measure(name, { inputRows, outputRows }, action);
  }
  return options.metrics.measure(name, { inputRows, outputRows, note: options.note }, action);
}

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

interface PendingDocCompareSummaryItem {
  primary: DocAccumulator;
  counterpart: MatchedCounterpart;
  summaryRow: DocCompareRow;
  summaryKey: string;
  meta: DocCompareSummaryMeta | null;
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

function hasMaterialShapeMismatchFromMaterials(
  primaryMaterials: Map<string, MaterialAccumulator>,
  counterpartMaterials: Map<string, MaterialAccumulator>
): boolean {
  const processedItemCodes = new Set<string>();

  for (const material of primaryMaterials.values()) {
    const counterpart = counterpartMaterials.get(material.itemCode);
    const primaryQuantity = decimalToNumber2(material.quantity);
    const counterpartQuantity = counterpart ? decimalToNumber2(counterpart.quantity) : 0;
    if (
      (primaryQuantity === 0 && counterpartQuantity !== 0) ||
      (primaryQuantity !== 0 && counterpartQuantity === 0)
    ) {
      return true;
    }
    processedItemCodes.add(material.itemCode);
  }

  for (const counterpart of counterpartMaterials.values()) {
    if (processedItemCodes.has(counterpart.itemCode)) {
      continue;
    }
    if (decimalToNumber2(counterpart.quantity) !== 0) {
      return true;
    }
  }

  return false;
}

function copyDocCompareRow(row: DocCompareRow): DocCompareRow {
  return { ...row };
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
    quantityDiff: decimalToDecimal2(subtractDecimal(primary.quantity, counterpart.quantity)),
    amountDiff: decimalToDecimal2(subtractDecimal(primary.amount, counterpart.amount))
  };
}

function buildPendingSummaryItem(
  kind: DocCompareKind,
  primary: DocAccumulator,
  counterpartGroups: Map<string, DocAccumulator>,
  includeSummaryItems: boolean
): PendingDocCompareSummaryItem {
  const counterpart = buildMatchedCounterpart(primary, counterpartGroups);
  const summaryRow = buildDocCompareRow("汇总", primary, counterpart);
  return {
    primary,
    counterpart,
    summaryRow,
    summaryKey: makeSummaryKey(kind, summaryRow),
    meta: includeSummaryItems ? buildSummaryMeta(primary, counterpart) : null
  };
}

function appendPendingSummaryItem(
  item: PendingDocCompareSummaryItem,
  summaryRows: DocCompareRow[],
  materialRowsBySummaryKey: Map<string, DocCompareRow[]>,
  summaryItems: DocCompareSummaryItem[],
  includeMaterialRows: boolean,
  includeSummaryItems: boolean
): number {
  const materialRows = includeMaterialRows ? buildMaterialRows(item.primary, item.counterpart.materials) : [];
  summaryRows.push(item.summaryRow);
  if (includeMaterialRows) {
    materialRowsBySummaryKey.set(item.summaryKey, materialRows);
  }

  if (includeSummaryItems && item.meta) {
    item.meta.hasMaterialShapeMismatch = includeMaterialRows
      ? hasMaterialShapeMismatch(materialRows)
      : hasMaterialShapeMismatchFromMaterials(item.primary.materials, item.counterpart.materials);
    summaryItems.push({
      summaryKey: item.summaryKey,
      row: copyDocCompareRow(item.summaryRow),
      materialRows: materialRows.map(copyDocCompareRow),
      meta: item.meta
    });
  }

  return materialRows.length;
}

function recordDocCompareStage(
  metrics: MetricsRecorder,
  name: string,
  inputRows: number,
  outputRows: number,
  timeMs: number,
  note: string | undefined
): void {
  const options = {
    inputRows,
    outputRows,
    timeMs,
    memoryBefore: INTERLEAVED_STAGE_MEMORY_SAMPLE,
    memoryAfter: INTERLEAVED_STAGE_MEMORY_SAMPLE
  };
  if (note === undefined) {
    metrics.record(name, options);
    return;
  }
  metrics.record(name, { ...options, note });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function elapsedSince(metrics: MetricsRecorder, startedAt: number): number {
  try {
    return Math.max(0, metrics.now() - startedAt);
  } catch {
    return 0;
  }
}

function buildDocCompareResult(
  kind: DocCompareKind,
  primaryGroups: Map<string, DocAccumulator>,
  counterpartGroups: Map<string, DocAccumulator>,
  options?: RowBuildingMetricsOptions
): DocCompareResult {
  const includeMaterialRows = options?.includeMaterialRows ?? true;
  const includeSummaryItems = options?.includeSummaryItems ?? true;
  const summaryRows: DocCompareRow[] = [];
  const materialRowsBySummaryKey = new Map<string, DocCompareRow[]>();
  const summaryItems: DocCompareSummaryItem[] = [];
  let materialRowCount = 0;

  // 汇总行和物料行分开返回，宏层可以只写汇总，再按用户展开动作插入物料行。
  const metrics = options?.metrics;
  if (!metrics) {
    for (const primary of primaryGroups.values()) {
      const item = buildPendingSummaryItem(kind, primary, counterpartGroups, includeSummaryItems);
      materialRowCount += appendPendingSummaryItem(
        item,
        summaryRows,
        materialRowsBySummaryKey,
        summaryItems,
        includeMaterialRows,
        includeSummaryItems
      );
    }
  } else {
    let summaryTimeMs = 0;
    let materialTimeMs = 0;
    let activeStage: TimedDocCompareStage = "summary";
    let activeStageStartedAt = 0;

    try {
      for (const primary of primaryGroups.values()) {
        activeStage = "summary";
        activeStageStartedAt = metrics.now();
        const item = buildPendingSummaryItem(kind, primary, counterpartGroups, includeSummaryItems);
        summaryTimeMs += metrics.now() - activeStageStartedAt;

        activeStage = "material";
        activeStageStartedAt = metrics.now();
        materialRowCount += appendPendingSummaryItem(
          item,
          summaryRows,
          materialRowsBySummaryKey,
          summaryItems,
          includeMaterialRows,
          includeSummaryItems
        );
        materialTimeMs += metrics.now() - activeStageStartedAt;
      }
    } catch (error) {
      const note = errorMessage(error);
      if (activeStage === "material") {
        recordDocCompareStage(
          metrics,
          "build_doc_compare_summary_rows",
          primaryGroups.size,
          summaryRows.length,
          summaryTimeMs,
          options.note
        );
        recordDocCompareStage(
          metrics,
          "build_doc_compare_material_rows",
          summaryRows.length,
          materialRowCount,
          materialTimeMs + elapsedSince(metrics, activeStageStartedAt),
          note
        );
      } else {
        recordDocCompareStage(
          metrics,
          "build_doc_compare_summary_rows",
          primaryGroups.size,
          summaryRows.length,
          summaryTimeMs + elapsedSince(metrics, activeStageStartedAt),
          note
        );
      }
      throw error;
    }

    recordDocCompareStage(
      metrics,
      "build_doc_compare_summary_rows",
      primaryGroups.size,
      summaryRows.length,
      summaryTimeMs,
      options.note
    );
    recordDocCompareStage(
      metrics,
      "build_doc_compare_material_rows",
      summaryRows.length,
      materialRowCount,
      materialTimeMs,
      options.note
    );
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
  filters?: FilterInput,
  options?: RowBuildingMetricsOptions
): DocCompareResult {
  const activeFilters = parseFilters(filters);
  const primaryGroups = measureStage(
    options,
    "build_primary_doc_groups",
    oaRows?.length ?? 0,
    (groups: Map<string, DocAccumulator>) => groups.size,
    () => buildOaDocGroups(oaRows, activeFilters)
  );
  const counterpartGroups = measureStage(
    options,
    "build_counterpart_doc_groups",
    erpRows?.length ?? 0,
    (groups: Map<string, DocAccumulator>) => groups.size,
    () => buildAllErpDocGroups(erpRows)
  );
  return buildDocCompareResult("oa_doc_compare", primaryGroups, counterpartGroups, options);
}

export function buildErpDocCompare(
  oaRows: RawRow[] | null | undefined,
  erpRows: RawRow[] | null | undefined,
  filters?: FilterInput,
  options?: RowBuildingMetricsOptions
): DocCompareResult {
  const activeFilters = parseFilters(filters);
  const primaryGroups = measureStage(
    options,
    "build_primary_doc_groups",
    erpRows?.length ?? 0,
    (groups: Map<string, DocAccumulator>) => groups.size,
    () => buildErpDocGroups(erpRows, activeFilters)
  );
  const counterpartGroups = measureStage(
    options,
    "build_counterpart_doc_groups",
    oaRows?.length ?? 0,
    (groups: Map<string, DocAccumulator>) => groups.size,
    () => buildAllOaDocGroups(oaRows)
  );
  return buildDocCompareResult("erp_doc_compare", primaryGroups, counterpartGroups, options);
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
