import type Decimal from "decimal.js-light";
import type { QueryDirection } from "../core/query-direction";
import type { WpsCellValue, WpsMatrix } from "./wps";

export type SheetSource = "OA" | "ERP" | "系统";
export type IssueLevel = "错误" | "提醒";

// RawRow 保留源表表头作为动态 key，同时额外带上真实行号，便于错误提示回到 Excel/WPS 行。
export interface RawRow {
  _rowNumber?: number | string;
  [header: string]: WpsCellValue | number | string | undefined;
}

// ParsedTable 是表头识别后的标准形状，后续预验证和查询都不再直接面对原始矩阵。
export interface ParsedTable {
  headers: string[];
  rows: RawRow[];
  headerRowNumber: number | string;
  columnIndex: Record<string, number>;
  matrix: WpsMatrix;
}

export interface QueryFilters {
  company: string;
  dept1: string;
  dept2: string;
  startDate: string;
  endDate: string;
}

// OA 聚合行以“OA 单号 + 物料”为核心粒度，金额和数量仍保留 Decimal，最后输出时再转数字。
export interface OaAggRow {
  formNumber: string;
  kingdeeDocNumber: string;
  itemCode: string;
  itemName: string;
  company: string;
  dept1: string;
  dept2: string;
  oaDate: string;
  quantity: Decimal;
  amount: Decimal;
}

// ERP 聚合行同时保留源单号和 ERP 出库单号，便于从 OA 视角和 ERP 视角生成不同输出。
export interface ErpAggRow {
  sourceFormNumber: string;
  formNumber: string;
  itemCode: string;
  itemName: string;
  company: string;
  dept1: string;
  dept2: string;
  erpDate: string;
  quantity: Decimal;
  cost: Decimal;
  erpDocNumbers: string;
}

// DetailRow 是内部单据/物料明细行契约，字段顺序需要和 DETAIL_HEADERS 保持一致。
export interface DetailRow {
  differenceType: string;
  formNumber: string;
  oaKingdeeDocNumber: string;
  oaDate: string;
  erpDocNumbers: string;
  erpSourceFormNumber: string;
  erpDate: string;
  itemCode: string;
  itemName: string;
  company: string;
  dept1: string;
  dept2: string;
  oaQuantity: number;
  erpQuantity: number;
  quantityDiff: number;
  oaAmount: number;
  erpCost: number;
  amountDiff: number;
  remark: string;
}

export interface PanelQueryInput {
  filters: QueryFilters;
  queryDirection: QueryDirection;
}

export type DocCompareRowType = "汇总" | "物料";
export type OutputSheetKind = "variance_summary" | "oa_doc_compare" | "erp_doc_compare";
export type LegacyOutputSheetKind = "legacy_detail";
export type OutputMetadataKind = OutputSheetKind | LegacyOutputSheetKind;

// 弹窗和功能区共享同一份查询状态，避免三张输出页各自维护不兼容的输入格式。
export interface RibbonQueryState {
  company: string;
  dept1: string;
  dept2: string;
  startDate: string;
  endDate: string;
  queryDirection: QueryDirection;
}

// 单据对比输出既有汇总行也有物料展开行，所以用 rowType 明确区分两种显示层级。
export interface DocCompareRow {
  rowType: DocCompareRowType;
  company: string;
  dept1: string;
  dept2: string;
  date: string;
  primaryDocNumber: string;
  primaryQuantity: number;
  primaryAmount: number;
  counterpartDocNumber: string;
  counterpartQuantity: number;
  counterpartAmount: number;
  quantityDiff: number;
  amountDiff: number;
  itemCode: string;
  itemName: string;
  remark: string;
}

export interface DocCompareSummaryMeta {
  counterpartDocNumbers: string[];
  hasMaterialShapeMismatch: boolean;
  primaryQuantity: Decimal;
  primaryAmount: Decimal;
  counterpartQuantity: Decimal;
  counterpartAmount: Decimal;
  quantityDiff: Decimal;
  amountDiff: Decimal;
}

export interface DocCompareSummaryItem {
  summaryKey: string;
  row: DocCompareRow;
  materialRows: DocCompareRow[];
  meta: DocCompareSummaryMeta;
}

// materialRowsBySummaryKey 让展开物料时能快速找到某张汇总单据下面的明细物料。
export interface DocCompareResult {
  kind: Extract<OutputSheetKind, "oa_doc_compare" | "erp_doc_compare">;
  summaryRows: DocCompareRow[];
  materialRowsBySummaryKey: Map<string, DocCompareRow[]>;
  summaryItems: DocCompareSummaryItem[];
}

// SummaryRow 只承载汇总页需要的聚合结果，不包含单据和物料层级字段。
export interface SummaryRow {
  company: string;
  dept1: string;
  dept2: string;
  oaQuantity: number;
  erpQuantity: number;
  quantityDiff: number;
  oaAmount: number;
  erpCost: number;
  amountDiff: number;
  differenceSummary: string;
}

// 预验证问题必须能回到具体来源、行号、字段和值，用户才知道该改哪一格数据。
export interface PrecheckIssue {
  level: IssueLevel;
  source: SheetSource;
  rowNumber: number | string;
  fieldName: string;
  rawValue: string;
  issueType: string;
  reason: string;
  suggestion: string;
}

export type OutputMatrix = Array<Array<string | number>>;
