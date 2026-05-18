import type { OutputSheetKind } from "../types/scrap";
import type { WpsCellValue, WpsSheet } from "../types/wps";
import { normalizeMatrix } from "../utils/matrix";
import { clearRange, writeMatrixBulkOrChunks } from "./write-results";

const METADATA_START_ROW = 1;
const METADATA_START_COL = 80;
const METADATA_ADDRESS = "CB1:CC1";
const VALID_OUTPUT_KINDS = new Set<OutputSheetKind>(["legacy_detail", "oa_doc_compare", "erp_doc_compare"]);

export interface OutputMetadata {
  kind: OutputSheetKind;
  rangeAddress: string;
}

function normalizeText(value: WpsCellValue): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function isOutputSheetKind(value: string): value is OutputSheetKind {
  return VALID_OUTPUT_KINDS.has(value as OutputSheetKind);
}

export function readOutputMetadata(sheet: WpsSheet): OutputMetadata | null {
  const range = sheet.Range(METADATA_ADDRESS);
  const matrix = normalizeMatrix(range.Value2 ?? range.Value);
  const kind = normalizeText(matrix[0]?.[0]);
  const rangeAddress = normalizeText(matrix[0]?.[1]);

  if (!isOutputSheetKind(kind) || !rangeAddress) {
    return null;
  }

  return { kind, rangeAddress };
}

export function saveOutputMetadata(sheet: WpsSheet, metadata: OutputMetadata): void {
  writeMatrixBulkOrChunks(sheet, METADATA_START_ROW, METADATA_START_COL, [[metadata.kind, metadata.rangeAddress]], 1);
}

export function clearPreviousToolOutput(sheet: WpsSheet, expectedKind: OutputSheetKind): void {
  const metadata = readOutputMetadata(sheet);
  if (!metadata || metadata.kind !== expectedKind) {
    return;
  }

  clearRange(sheet, metadata.rangeAddress);
}
