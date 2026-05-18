import { describe, expect, it } from "vitest";
import { SHEET_NAMES } from "../../src/constants";
import {
  OUTPUT_SHEET_KINDS,
  detectOutputSheetKind,
  unsupportedOutputSheetMessage
} from "../../src/core/output-sheets";

describe("output sheet detection", () => {
  it("detects the three supported output sheets", () => {
    expect(detectOutputSheetKind(SHEET_NAMES.detailOutput)).toBe(OUTPUT_SHEET_KINDS.legacyDetail);
    expect(detectOutputSheetKind(SHEET_NAMES.oaDocCompare)).toBe(OUTPUT_SHEET_KINDS.oaDocCompare);
    expect(detectOutputSheetKind(SHEET_NAMES.erpDocCompare)).toBe(OUTPUT_SHEET_KINDS.erpDocCompare);
  });

  it("does not treat source or diagnostics sheets as output sheets", () => {
    expect(detectOutputSheetKind(SHEET_NAMES.oa)).toBeNull();
    expect(detectOutputSheetKind(SHEET_NAMES.erp)).toBeNull();
    expect(detectOutputSheetKind(SHEET_NAMES.performanceDiagnostics)).toBeNull();
    expect(detectOutputSheetKind("Sheet1")).toBeNull();
  });

  it("returns the exact unsupported-sheet guidance", () => {
    expect(unsupportedOutputSheetMessage()).toBe(
      "当前工作表不支持查询，请切换到 报废差异明细、OA视角单据对比 或 ERP视角单据对比。"
    );
  });
});
