import {
  ERP_REQUIRED_HEADERS,
  MAX_HEADER_SCAN_ROWS,
  MIN_ERP_HEADER_MATCH_COUNT,
  MIN_OA_HEADER_MATCH_COUNT,
  OA_REQUIRED_HEADERS,
  SHEET_NAMES,
  WRITE_CHUNK_ROWS
} from "../constants";
import {
  buildDocumentLookupResult,
  buildDocumentLookupSuggestions,
  documentLookupRowsToValues,
  type DocumentLookupSelection
} from "../core/document-lookup";
import type { OutputMatrix, RawRow } from "../types/scrap";
import type { ScrapVarianceGlobal, WpsSheet } from "../types/wps";
import { openDocumentLookupDialogAndRun } from "../query-dialog/open-document-lookup-dialog";
import { clearPreviousToolOutput, saveOutputMetadata } from "../wps-api/output-metadata";
import { readSheetTable } from "../wps-api/read-sheet-data";
import { ensureSheet, getSheetByName } from "../wps-api/workbook";
import { rangeAddress, writeMatrixBulkOrChunks } from "../wps-api/write-results";

type ReportError = (error: unknown) => void;
type RunDocumentLookup = (selection: DocumentLookupSelection) => void;

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

function readSourceRows(root: ScrapVarianceGlobal): SourceRows {
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

function writeOutputWithMetadata(sheet: WpsSheet, values: OutputMatrix): void {
  const width = matrixWidth(values);
  if (values.length === 0 || width === 0) {
    return;
  }

  const address = rangeAddress(1, 1, values.length, width);
  writeMatrixBulkOrChunks(sheet, 1, 1, values, WRITE_CHUNK_ROWS);
  saveOutputMetadata(sheet, { kind: "document_lookup", rangeAddress: address });
}

function safeWriteLookupError(root: ScrapVarianceGlobal, error: unknown): void {
  const message = errorMessage(error);
  try {
    const sheet = ensureSheet(SHEET_NAMES.documentLookup, root);
    clearPreviousToolOutput(sheet, "document_lookup");
    writeOutputWithMetadata(sheet, [["错误", message]]);
  } catch (writeError) {
    throw new Error(`单号查询失败：${message}；错误信息写入也失败：${errorMessage(writeError)}`);
  }
}

export function runDocumentLookupWithSelection(root: ScrapVarianceGlobal, selection: DocumentLookupSelection): void {
  try {
    const { oaRows, erpRows } = readSourceRows(root);
    const result = buildDocumentLookupResult({
      mode: selection.mode,
      docNumber: selection.docNumber,
      oaRows,
      erpRows
    });
    const sheet = ensureSheet(SHEET_NAMES.documentLookup, root);
    const values = result.ok ? documentLookupRowsToValues(result.rows) : [["提示", result.message]];

    clearPreviousToolOutput(sheet, "document_lookup");
    writeOutputWithMetadata(sheet, values);
  } catch (error) {
    safeWriteLookupError(root, error);
  }
}

export function startDocumentLookup(
  root: ScrapVarianceGlobal,
  reportError: ReportError,
  runLookup?: RunDocumentLookup
): void {
  const { oaRows, erpRows } = readSourceRows(root);
  const suggestions = buildDocumentLookupSuggestions(oaRows, erpRows);
  const lookupRunner = runLookup ?? ((selection: DocumentLookupSelection) => runDocumentLookupWithSelection(root, selection));

  openDocumentLookupDialogAndRun(root, suggestions, lookupRunner, reportError);
}
