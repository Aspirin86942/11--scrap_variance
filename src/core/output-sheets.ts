import { SHEET_NAMES } from "../constants";
import type { OutputSheetKind } from "../types/scrap";

export const OUTPUT_SHEET_KINDS = {
  legacyDetail: "legacy_detail",
  oaDocCompare: "oa_doc_compare",
  erpDocCompare: "erp_doc_compare"
} as const satisfies Record<string, OutputSheetKind>;

export function detectOutputSheetKind(sheetName: string): OutputSheetKind | null {
  switch (sheetName) {
    case SHEET_NAMES.detailOutput:
      return OUTPUT_SHEET_KINDS.legacyDetail;
    case SHEET_NAMES.oaDocCompare:
      return OUTPUT_SHEET_KINDS.oaDocCompare;
    case SHEET_NAMES.erpDocCompare:
      return OUTPUT_SHEET_KINDS.erpDocCompare;
    default:
      return null;
  }
}

export function unsupportedOutputSheetMessage(): string {
  return `当前工作表不支持查询或展开，请切换到 ${SHEET_NAMES.detailOutput}、${SHEET_NAMES.oaDocCompare} 或 ${SHEET_NAMES.erpDocCompare}。`;
}
