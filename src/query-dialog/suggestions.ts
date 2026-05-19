import {
  ERP_REQUIRED_HEADERS,
  MAX_HEADER_SCAN_ROWS,
  MIN_ERP_HEADER_MATCH_COUNT,
  MIN_OA_HEADER_MATCH_COUNT,
  OA_REQUIRED_HEADERS,
  SHEET_NAMES
} from "../constants";
import type { RawRow } from "../types/scrap";
import type { ScrapVarianceGlobal } from "../types/wps";
import { readSheetTable } from "../wps-api/read-sheet-data";
import { getSheetByName } from "../wps-api/workbook";
import { normalizeText } from "../utils/text";

export interface QueryDialogSuggestions {
  company: string[];
  dept1: string[];
  dept2: string[];
}

export const EMPTY_QUERY_DIALOG_SUGGESTIONS: QueryDialogSuggestions = {
  company: [],
  dept1: [],
  dept2: []
};

function createEmptyQueryDialogSuggestions(): QueryDialogSuggestions {
  return {
    company: [],
    dept1: [],
    dept2: []
  };
}

function pickColumnText(rows: RawRow[], header: string): string[] {
  return rows.map((row) => normalizeText(row[header])).filter((value) => value.length > 0);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "zh-CN"));
}

export function buildQueryDialogSuggestions(root?: ScrapVarianceGlobal): QueryDialogSuggestions {
  const runtimeRoot = root ?? (globalThis as ScrapVarianceGlobal);

  try {
    const oaSheet = getSheetByName(SHEET_NAMES.oa, runtimeRoot);
    const erpSheet = getSheetByName(SHEET_NAMES.erp, runtimeRoot);
    const oaTable = readSheetTable(oaSheet, [...OA_REQUIRED_HEADERS], MIN_OA_HEADER_MATCH_COUNT, MAX_HEADER_SCAN_ROWS);
    const erpTable = readSheetTable(
      erpSheet,
      [...ERP_REQUIRED_HEADERS],
      MIN_ERP_HEADER_MATCH_COUNT,
      MAX_HEADER_SCAN_ROWS
    );

    return {
      company: uniqueSorted([
        ...pickColumnText(oaTable.rows, "公司简称"),
        ...pickColumnText(erpTable.rows, "区分公司简称")
      ]),
      dept1: uniqueSorted([
        ...pickColumnText(oaTable.rows, "一级部门"),
        ...pickColumnText(erpTable.rows, "一级部门")
      ]),
      dept2: uniqueSorted([
        ...pickColumnText(oaTable.rows, "二级部门"),
        ...pickColumnText(erpTable.rows, "二级部门")
      ])
    };
  } catch (error) {
    runtimeRoot.console?.error?.("读取查询候选失败，查询弹窗将不显示补全下拉。", error);
    return createEmptyQueryDialogSuggestions();
  }
}
