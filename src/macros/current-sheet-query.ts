import {
  ERP_REQUIRED_HEADERS,
  MAX_HEADER_SCAN_ROWS,
  MIN_ERP_HEADER_MATCH_COUNT,
  MIN_OA_HEADER_MATCH_COUNT,
  OA_REQUIRED_HEADERS,
  SHEET_NAMES,
  WRITE_CHUNK_ROWS
} from "../constants";
import { buildErpDocCompare, buildOaDocCompare, docCompareRowsToValues } from "../core/doc-compare";
import { detectOutputSheetKind, unsupportedOutputSheetMessage } from "../core/output-sheets";
import { QUERY_DIRECTIONS } from "../core/query-direction";
import { runQueryCorePipeline } from "../core/query-pipeline";
import { getRibbonState, readRibbonFilters } from "../ribbon/state";
import type { OutputMatrix, OutputSheetKind, QueryFilters, RawRow } from "../types/scrap";
import type { ScrapVarianceGlobal, WpsSheet } from "../types/wps";
import { getActiveSheet } from "../wps-api/active-context";
import { clearPreviousToolOutput, saveOutputMetadata } from "../wps-api/output-metadata";
import { readSheetTable } from "../wps-api/read-sheet-data";
import { getSheetByName } from "../wps-api/workbook";
import { rangeAddress, writeMatrixBulkOrChunks } from "../wps-api/write-results";
import { setupOutputSheets } from "./output-sheets";

interface SourceRows {
  oaRows: RawRow[];
  erpRows: RawRow[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function matrixWidth(values: OutputMatrix): number {
  return values.reduce((width, row) => Math.max(width, row.length), 0);
}

function writeOutputWithMetadata(sheet: WpsSheet, kind: OutputSheetKind, values: OutputMatrix): void {
  const width = matrixWidth(values);
  if (values.length === 0 || width === 0) {
    return;
  }

  const address = rangeAddress(1, 1, values.length, width);
  writeMatrixBulkOrChunks(sheet, 1, 1, values, WRITE_CHUNK_ROWS);
  saveOutputMetadata(sheet, { kind, rangeAddress: address });
}

function readSourceRows(root?: ScrapVarianceGlobal): SourceRows {
  const oaSheet = getSheetByName(SHEET_NAMES.oa, root);
  const erpSheet = getSheetByName(SHEET_NAMES.erp, root);
  const oaTable = readSheetTable(oaSheet, [...OA_REQUIRED_HEADERS], MIN_OA_HEADER_MATCH_COUNT, MAX_HEADER_SCAN_ROWS);
  const erpTable = readSheetTable(
    erpSheet,
    [...ERP_REQUIRED_HEADERS],
    MIN_ERP_HEADER_MATCH_COUNT,
    MAX_HEADER_SCAN_ROWS
  );

  return {
    oaRows: oaTable.rows,
    erpRows: erpTable.rows
  };
}

function buildLegacyDetailValues(oaRows: RawRow[], erpRows: RawRow[], filters: QueryFilters, root?: ScrapVarianceGlobal):
  | { values: OutputMatrix; noResultMessage: null }
  | { values: null; noResultMessage: string } {
  const pipeline = runQueryCorePipeline(oaRows, erpRows, filters, undefined, getRibbonState(root).queryDirection);

  if (pipeline.detailRows.length === 0) {
    return {
      values: null,
      noResultMessage:
        pipeline.queryDirection === QUERY_DIRECTIONS.erpSourceToOa
          ? "查询条件没有匹配到 ERP 数据。"
          : "查询条件没有匹配到 OA 数据。"
    };
  }

  return {
    values: [["汇总差异"], ...pipeline.summaryValues, ["明细差异"], ...pipeline.detailValues],
    noResultMessage: null
  };
}

function buildOaDocCompareValues(oaRows: RawRow[], erpRows: RawRow[], filters: QueryFilters):
  | { values: OutputMatrix; noResultMessage: null }
  | { values: null; noResultMessage: string } {
  const result = buildOaDocCompare(oaRows, erpRows, filters);
  if (result.summaryRows.length === 0) {
    return {
      values: null,
      noResultMessage: "查询条件没有匹配到 OA 数据。"
    };
  }

  return {
    values: docCompareRowsToValues("oa_doc_compare", result.summaryRows),
    noResultMessage: null
  };
}

function buildErpDocCompareValues(oaRows: RawRow[], erpRows: RawRow[], filters: QueryFilters):
  | { values: OutputMatrix; noResultMessage: null }
  | { values: null; noResultMessage: string } {
  const result = buildErpDocCompare(oaRows, erpRows, filters);
  if (result.summaryRows.length === 0) {
    return {
      values: null,
      noResultMessage: "查询条件没有匹配到 ERP 数据。"
    };
  }

  return {
    values: docCompareRowsToValues("erp_doc_compare", result.summaryRows),
    noResultMessage: null
  };
}

function safeWriteCurrentSheetError(sheet: WpsSheet, kind: OutputSheetKind, message: string): void {
  try {
    clearPreviousToolOutput(sheet, kind);
    writeOutputWithMetadata(sheet, kind, [["错误", message]]);
  } catch (writeError) {
    throw new Error(`查询执行失败：${message}；错误信息写入也失败：${errorMessage(writeError)}`);
  }
}

export function runCurrentSheetQuery(root?: ScrapVarianceGlobal): void {
  setupOutputSheets(root);

  const activeSheet = getActiveSheet(root);
  const kind = detectOutputSheetKind(activeSheet.Name);
  if (!kind) {
    throw new Error(unsupportedOutputSheetMessage());
  }

  try {
    const filters = readRibbonFilters(root);
    const { oaRows, erpRows } = readSourceRows(root);
    const result =
      kind === "legacy_detail"
        ? buildLegacyDetailValues(oaRows, erpRows, filters, root)
        : kind === "oa_doc_compare"
          ? buildOaDocCompareValues(oaRows, erpRows, filters)
          : buildErpDocCompareValues(oaRows, erpRows, filters);

    clearPreviousToolOutput(activeSheet, kind);
    writeOutputWithMetadata(activeSheet, kind, result.values ?? [[result.noResultMessage]]);
  } catch (error) {
    safeWriteCurrentSheetError(activeSheet, kind, errorMessage(error));
  }
}
