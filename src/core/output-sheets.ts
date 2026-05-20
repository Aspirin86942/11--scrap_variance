import { SHEET_NAMES } from "../constants";
import type { LegacyOutputSheetKind, OutputSheetKind } from "../types/scrap";

export const OUTPUT_SHEET_KINDS = {
  varianceSummary: "variance_summary",
  oaDocCompare: "oa_doc_compare",
  erpDocCompare: "erp_doc_compare"
} as const satisfies Record<string, OutputSheetKind>;

export const LEGACY_OUTPUT_SHEET_KINDS = {
  legacyDetail: "legacy_detail"
} as const satisfies Record<string, LegacyOutputSheetKind>;

export function detectOutputSheetKind(sheetName: string): OutputSheetKind | null {
  switch (sheetName) {
    case SHEET_NAMES.varianceSummary:
      return OUTPUT_SHEET_KINDS.varianceSummary;
    case SHEET_NAMES.oaDocCompare:
      return OUTPUT_SHEET_KINDS.oaDocCompare;
    case SHEET_NAMES.erpDocCompare:
      return OUTPUT_SHEET_KINDS.erpDocCompare;
    default:
      return null;
  }
}

export function unsupportedOutputSheetMessage(): string {
  return `当前工作表不支持查询或展开，请切换到 ${SHEET_NAMES.varianceSummary}、${SHEET_NAMES.oaDocCompare} 或 ${SHEET_NAMES.erpDocCompare}。`;
}
