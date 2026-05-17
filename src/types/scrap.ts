import type Decimal from "decimal.js-light";
import type { WpsCellValue, WpsMatrix } from "./wps";

export type SheetSource = "OA" | "ERP" | "系统";
export type IssueLevel = "错误" | "提醒";

export interface RawRow {
  _rowNumber?: number | string;
  [header: string]: WpsCellValue | number | string | undefined;
}

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

export interface OaAggRow {
  formNumber: string;
  itemCode: string;
  itemName: string;
  company: string;
  dept1: string;
  dept2: string;
  oaDate: string;
  quantity: Decimal;
  amount: Decimal;
}

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

export interface DetailRow {
  differenceType: string;
  formNumber: string;
  erpDocNumbers: string;
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
